#!/usr/bin/env node
/**
 * Fetches and parses FAA NASR data to generate airport/runway JSON
 * Run with: node scripts/update-nasr.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(__dirname, '..', 'src', 'lib', 'airports-data.json');

// NASR subscription URL pattern
const NASR_BASE = 'https://nfdc.faa.gov/webContent/28DaySub/extra/';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || '';
    });
    return row;
  });
}

async function downloadNASRData() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log('Fetching NASR subscription info...');
  const subscriptionPage = execSync(
    'curl -sL "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/"',
    { encoding: 'utf-8' }
  );

  const dateMatch = subscriptionPage.match(/(\d{2})_([A-Z][a-z]{2})_(\d{4})_APT_CSV\.zip/i);
  if (!dateMatch) {
    throw new Error('Could not find current NASR subscription date');
  }

  const [, day, month, year] = dateMatch;
  const zipName = `${day}_${month}_${year}_APT_CSV.zip`;
  const zipUrl = `${NASR_BASE}${zipName}`;
  const zipPath = path.join(DATA_DIR, 'APT_CSV.zip');

  console.log(`Downloading ${zipName}...`);
  execSync(`curl -sL "${zipUrl}" -o "${zipPath}"`, { encoding: 'utf-8' });

  console.log('Extracting...');
  execSync(
    `python3 -c "import zipfile; zipfile.ZipFile('${zipPath}').extractall('${DATA_DIR}')"`,
    { encoding: 'utf-8' }
  );

  console.log('Download complete.');
}

function parseAirports() {
  const basePath = path.join(DATA_DIR, 'APT_BASE.csv');
  const content = fs.readFileSync(basePath, 'utf-8');
  const rows = parseCSV(content);

  const airports = new Map();

  for (const row of rows) {
    const icao = row['ICAO_ID']?.trim();
    const faaId = row['ARPT_ID']?.trim();
    const name = row['ARPT_NAME']?.trim();
    const city = row['CITY']?.trim();
    const state = row['STATE_CODE']?.trim();
    const lat = parseFloat(row['LAT_DECIMAL']);
    const lon = parseFloat(row['LONG_DECIMAL']);
    const siteNo = row['SITE_NO']?.trim();

    // Include airports with ICAO codes OR FAA IDs
    // Skip if no valid identifier or coordinates
    if ((!icao && !faaId) || isNaN(lat) || isNaN(lon)) continue;

    // Use ICAO if available, otherwise construct from FAA ID (K + faaId for US)
    const effectiveIcao = icao || (faaId ? `K${faaId}` : null);
    if (!effectiveIcao) continue;

    airports.set(siteNo, {
      icao: effectiveIcao,
      faaId,
      name,
      city,
      state,
      lat,
      lon,
      runways: [],
    });
  }

  return airports;
}

function parseRunwayEnds() {
  const rwyEndPath = path.join(DATA_DIR, 'APT_RWY_END.csv');
  const content = fs.readFileSync(rwyEndPath, 'utf-8');
  const rows = parseCSV(content);

  const runwayEnds = new Map();

  for (const row of rows) {
    const siteNo = row['SITE_NO']?.trim();
    const rwyId = row['RWY_ID']?.trim();
    const endId = row['RWY_END_ID']?.trim();
    const trueAlignment = row['TRUE_ALIGNMENT'] ? parseInt(row['TRUE_ALIGNMENT'], 10) : null;
    const displacedThreshold = row['DISPLACED_THR_LEN'] ? parseInt(row['DISPLACED_THR_LEN'], 10) : 0;

    if (!siteNo || !rwyId || !endId) continue;

    if (!runwayEnds.has(siteNo)) {
      runwayEnds.set(siteNo, []);
    }

    runwayEnds.get(siteNo).push({
      siteNo,
      rwyId,
      endId,
      trueAlignment,
      displacedThreshold,
    });
  }

  return runwayEnds;
}

function parseRunways() {
  const rwyPath = path.join(DATA_DIR, 'APT_RWY.csv');
  const content = fs.readFileSync(rwyPath, 'utf-8');
  const rows = parseCSV(content);

  const runways = new Map();

  for (const row of rows) {
    const siteNo = row['SITE_NO']?.trim();
    const rwyId = row['RWY_ID']?.trim();
    const length = parseInt(row['RWY_LEN'], 10) || 0;
    const width = parseInt(row['RWY_WIDTH'], 10) || 0;
    const surface = row['SURFACE_TYPE_CODE']?.trim() || '';

    if (!siteNo || !rwyId) continue;

    if (!runways.has(siteNo)) {
      runways.set(siteNo, []);
    }

    runways.get(siteNo).push({ id: rwyId, length, width, surface });
  }

  return runways;
}

async function main() {
  const forceDownload = process.argv.includes('--download');
  
  const basePath = path.join(DATA_DIR, 'APT_BASE.csv');
  if (forceDownload || !fs.existsSync(basePath)) {
    await downloadNASRData();
  }

  console.log('Parsing airport data...');
  const airports = parseAirports();
  console.log(`Found ${airports.size} ICAO airports`);

  console.log('Parsing runway data...');
  const runways = parseRunways();
  const runwayEnds = parseRunwayEnds();

  // Merge runway data into airports
  for (const [siteNo, airport] of airports) {
    const siteRunways = runways.get(siteNo) || [];
    const siteRunwayEnds = runwayEnds.get(siteNo) || [];

    for (const rwy of siteRunways) {
      const ends = siteRunwayEnds.filter(e => e.rwyId === rwy.id);
      
      const sortedEnds = ends.sort((a, b) => {
        const numA = parseInt(a.endId.replace(/[LRC]/g, ''), 10);
        const numB = parseInt(b.endId.replace(/[LRC]/g, ''), 10);
        return numA - numB;
      });

      const lowEnd = sortedEnds[0];
      const highEnd = sortedEnds[1];

      if (lowEnd && highEnd && lowEnd.trueAlignment !== null) {
        airport.runways.push({
          id: rwy.id,
          low: lowEnd.endId,
          high: highEnd.endId,
          trueHdg: lowEnd.trueAlignment,
          length: rwy.length,
          width: rwy.width,
          surface: rwy.surface,
          lowDisplacedThreshold: lowEnd.displacedThreshold || 0,
          highDisplacedThreshold: highEnd.displacedThreshold || 0,
        });
      }
    }
  }

  const airportsWithRunways = Array.from(airports.values()).filter(a => a.runways.length > 0);
  console.log(`${airportsWithRunways.length} airports have runway data`);

  airportsWithRunways.sort((a, b) => a.icao.localeCompare(b.icao));

  const output = {
    generated: new Date().toISOString(),
    count: airportsWithRunways.length,
    airports: airportsWithRunways,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch(console.error);
