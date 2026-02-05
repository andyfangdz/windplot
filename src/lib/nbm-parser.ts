// NBM Text Bulletin Parser
// Parses NOAA National Blend of Models (NBM) hourly text bulletins

export interface NbmParsedData {
  station: string;
  times: Date[];
  wdr: (number | null)[];  // Wind direction in degrees
  wsp: (number | null)[];  // Wind speed in knots
  gst: (number | null)[];  // Wind gust in knots
  tmp: (number | null)[];  // Temperature in F
  dpt: (number | null)[];  // Dew point in F
  sky: (number | null)[];  // Sky cover %
  cig: (number | null)[];  // Ceiling in feet (null = unlimited)
  vis: (number | null)[];  // Visibility in miles
  pop: (number | null)[];  // Probability of precipitation %
}

// Parse NBM text bulletin for a specific station
export function parseNbmBulletin(text: string, station: string): NbmParsedData | null {
  // Find station section - format: " KFRG   NBM V4.3 NBH GUIDANCE" (note leading space)
  // Also support legacy format: "KFRG   NBH"
  const stationPattern = new RegExp(`^\\s*${station}\\s+(?:NBM[^\\n]*NBH|NBH)`, 'm');
  const stationMatch = text.match(stationPattern);
  if (!stationMatch || stationMatch.index === undefined) {
    return null;
  }

  // Find end of station section (next station or end of file)
  const startIdx = stationMatch.index;
  const endPattern = /\n\s*[A-Z0-9]{4,6}\s+(?:NBM[^\n]*NBH|NBH)/;
  const endMatch = text.slice(startIdx + 10).match(endPattern);
  const endIdx = endMatch?.index ? startIdx + 10 + endMatch.index : text.length;

  const stationSection = text.slice(startIdx, endIdx);
  const lines = stationSection.split('\n').filter(l => l.trim());

  if (lines.length < 3) return null;

  // Parse header line: "KFRG   NBH GFS MOS GUIDANCE   2/05/2026  0700 UTC"
  const headerLine = lines[0];
  const dateMatch = headerLine.match(/(\d{1,2})\/(\d{2})\/(\d{4})\s+(\d{2})(\d{2})\s*UTC/);
  if (!dateMatch) return null;

  const [, month, day, year, hour, minute] = dateMatch;
  const baseTime = new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  ));

  // Parse time row - find line starting with UTC or containing hour values
  // Format: "UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08"
  let forecastHours: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('UTC') || line.startsWith('FHR')) {
      // Extract hours from the line
      const hourMatches = line.match(/\d{2}/g);
      if (hourMatches) {
        forecastHours = hourMatches.map(h => parseInt(h));
      }
      break;
    }
  }

  if (forecastHours.length === 0) return null;

  // Generate timestamps for each forecast hour
  const times: Date[] = [];
  let currentDate = new Date(baseTime);
  let prevHour = baseTime.getUTCHours();

  for (const hour of forecastHours) {
    // Handle day rollover
    if (hour < prevHour) {
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }
    const forecastTime = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      hour,
      0
    ));
    times.push(forecastTime);
    prevHour = hour;
  }

  // Helper to parse a data row (space-separated values)
  const parseRow = (prefix: string): (number | null)[] => {
    for (const line of lines) {
      if (line.startsWith(prefix) || line.startsWith(` ${prefix}`)) {
        const values = line.slice(4).trim().split(/\s+/);
        return values.map(v => {
          const num = parseInt(v);
          if (isNaN(num) || num === -99 || v === 'NG') return null;
          return num;
        });
      }
    }
    return [];
  };

  // Helper to parse fixed-width data row (3-char fields, no spaces)
  // Used for CIG and VIS which can have values like "-88" that run together
  const parseFixedWidthRow = (prefix: string, width: number = 3): (number | null)[] => {
    for (const line of lines) {
      if (line.startsWith(prefix) || line.startsWith(` ${prefix}`)) {
        const dataSection = line.slice(4).trimStart();
        // Check if this looks like fixed-width (no spaces between numbers)
        if (!dataSection.includes(' ') || /[-\d]{3}[-\d]{3}/.test(dataSection)) {
          // Parse as fixed-width
          const values: (number | null)[] = [];
          for (let i = 0; i < dataSection.length; i += width) {
            const chunk = dataSection.slice(i, i + width).trim();
            if (!chunk) continue;
            const num = parseInt(chunk);
            if (isNaN(num) || num === -99 || chunk === 'NG') {
              values.push(null);
            } else {
              values.push(num);
            }
          }
          return values;
        } else {
          // Fall back to space-separated
          const values = dataSection.split(/\s+/);
          return values.map(v => {
            const num = parseInt(v);
            if (isNaN(num) || num === -99 || v === 'NG') return null;
            return num;
          });
        }
      }
    }
    return [];
  };

  // Parse all data rows
  const wdrRaw = parseRow('WDR');
  const wsp = parseRow('WSP');
  const gst = parseRow('GST');
  const tmp = parseRow('TMP');
  const dpt = parseRow('DPT');
  const sky = parseRow('SKY');
  const cigRaw = parseFixedWidthRow('CIG');
  const visRaw = parseFixedWidthRow('VIS');
  const pop = parseRow('P01'); // 1-hour precip probability

  // Convert wind direction from tens of degrees to degrees
  const wdr = wdrRaw.map(v => v !== null ? v * 10 : null);

  // Convert ceiling from hundreds of feet to feet, 888 = unlimited
  const cig = cigRaw.map(v => {
    if (v === null) return null;
    if (v === 888 || v === -88) return null; // Unlimited ceiling
    return v * 100;
  });

  // Convert visibility from tenths of miles to miles
  const vis = visRaw.map(v => v !== null ? v / 10 : null);

  return {
    station,
    times,
    wdr,
    wsp,
    gst,
    tmp,
    dpt,
    sky,
    cig,
    vis,
    pop,
  };
}

// Get current NBM bulletin URL
export function getNbmBulletinUrl(): string {
  const now = new Date();
  // NBM is updated hourly, use the previous hour to ensure data is available
  const hour = (now.getUTCHours() - 1 + 24) % 24;
  const hourStr = hour.toString().padStart(2, '0');

  // Format date as YYYYMMDD
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  return `https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.${dateStr}/${hourStr}/text/blend_nbhtx.t${hourStr}z`;
}
