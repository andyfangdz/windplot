// NBM Text Bulletin Parser
// Parses NOAA National Blend of Models (NBM) text bulletins
// Supports both NBH (hourly, 24h) and NBS (3-hourly, 72h) products

export type NbmProductType = 'nbh' | 'nbs';

export interface NbmParsedData {
  station: string;
  baseTime: Date;           // Bulletin issuance time (UTC)
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
  lcb: (number | null)[];  // Lowest cloud base in feet (null = no clouds)
  tstm: (number | null)[]; // Thunderstorm probability % (T01 for NBH, T03 for NBS)
  mvc: (number | null)[];  // Probability of MVFR ceiling %
  ifc: (number | null)[];  // Probability of IFR ceiling %
  lic: (number | null)[];  // Probability of LIFR ceiling %
  pra: (number | null)[];  // Conditional probability of rain %
  psn: (number | null)[];  // Conditional probability of snow %
  ppl: (number | null)[];  // Conditional probability of ice pellets %
  pzr: (number | null)[];  // Conditional probability of freezing rain %
}

// Parse NBM text bulletin for a specific station
// productType: 'nbh' for hourly (24h) or 'nbs' for 3-hourly (72h)
export function parseNbmBulletin(text: string, station: string, productType: NbmProductType = 'nbh'): NbmParsedData | null {
  // Find station section - format: " KFRG   NBM V4.3 NBH GUIDANCE" or "NBM V4.3 NBS GUIDANCE"
  // Use [ \t]* instead of \s* to avoid matching across newlines
  const productName = productType.toUpperCase();
  const stationPattern = new RegExp(`^[ \\t]*${station}\\s+(?:NBM[^\\n]*${productName}|${productName})`, 'm');
  const stationMatch = text.match(stationPattern);
  if (!stationMatch || stationMatch.index === undefined) {
    return null;
  }

  // Find end of station section (next station or end of file)
  const startIdx = stationMatch.index;
  const endPattern = new RegExp(`\\n[ \\t]*[A-Z0-9]{4,6}\\s+(?:NBM[^\\n]*${productName}|${productName})`);
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

  // Parse time row - find line starting with UTC (NBH) or FHR (NBS)
  // NBH format: "UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08"
  // NBS format: "FHR  06 09 12 15 18 21 24 27 30 33 36 39 42 45 48 51 54 57 60 63 66 69 72"
  let forecastHours: number[] = [];
  let isForecastHourRelative = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('FHR')) {
      // NBS uses forecast hours relative to base time
      isForecastHourRelative = true;
      const hourMatches = line.match(/\d{2,3}/g);
      if (hourMatches) {
        forecastHours = hourMatches.map(h => parseInt(h));
      }
      break;
    } else if (line.startsWith('UTC')) {
      // NBH uses UTC hours
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

  if (isForecastHourRelative) {
    // NBS: forecast hours are relative to base time (e.g., 06 = 6 hours from now)
    for (const fhr of forecastHours) {
      const forecastTime = new Date(baseTime.getTime() + fhr * 60 * 60 * 1000);
      times.push(forecastTime);
    }
  } else {
    // NBH: hours are UTC clock hours
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

  // Helper to parse a fixed-width data row.
  //
  // CIG, VIS and LCB are written as 3-character RIGHT-ALIGNED columns, so
  // adjacent values run together whenever they fill the width ("210220210",
  // or " 90" + "130" -> " 90130"). A whitespace split then merges them into
  // one bogus number. Guessing the layout from punctuation is unreliable —
  // a single 5-character run is indistinguishable from a real value — so
  // parse both ways and keep whichever yields one value per forecast hour.
  const parseFixedWidthRow = (prefix: string, width: number = 3): (number | null)[] => {
    const toValue = (raw: string): number | null => {
      const num = parseInt(raw);
      if (isNaN(num) || num === -99 || raw === 'NG') return null;
      return num;
    };

    for (const line of lines) {
      if (line.startsWith(prefix) || line.startsWith(` ${prefix}`)) {
        // Columns begin one space after the label. Do not trim: the padding in
        // front of a short value is part of its column, and dropping it shifts
        // every later field left.
        const aligned = line.slice(line.indexOf(prefix) + prefix.length + 1);

        const fixed: (number | null)[] = [];
        for (let i = 0; i < aligned.length; i += width) {
          const chunk = aligned.slice(i, i + width).trim();
          fixed.push(chunk ? toValue(chunk) : null);
        }
        // Trailing padding on the line shows up as empty columns
        while (fixed.length > times.length && fixed[fixed.length - 1] === null) {
          fixed.pop();
        }

        const spaced = aligned.trim().split(/\s+/).filter(Boolean).map(toValue);

        // times.length is the authoritative column count for this bulletin
        if (fixed.length === times.length) return fixed;
        if (spaced.length === times.length) return spaced;
        // Neither lines up (short or malformed row): real bulletins are
        // fixed-width, so prefer that reading over the merged one.
        return fixed;
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
  const lcbRaw = parseFixedWidthRow('LCB');
  // P01 for NBH (1-hour precip), P06 for NBS (6-hour precip)
  let pop = parseRow('P01');
  if (pop.length === 0) {
    pop = parseRow('P06');
  }
  // T01 for NBH (1-hour thunder), T03 for NBS (3-hour thunder)
  let tstm = parseRow('T01');
  if (tstm.length === 0) {
    tstm = parseRow('T03');
  }
  // Flight-category ceiling probabilities. NBS only publishes IFC.
  const mvc = parseRow('MVC');
  const ifc = parseRow('IFC');
  const lic = parseRow('LIC');
  // Conditional precipitation type probabilities
  const pra = parseRow('PRA');
  const psn = parseRow('PSN');
  const ppl = parseRow('PPL');
  const pzr = parseRow('PZR');

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

  // Lowest cloud base uses the same encoding as CIG (hundreds of feet,
  // 888/-88 = no clouds)
  const lcb = lcbRaw.map(v => {
    if (v === null) return null;
    if (v === 888 || v === -88) return null;
    return v * 100;
  });

  return {
    station,
    baseTime,
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
    lcb,
    tstm,
    mvc,
    ifc,
    lic,
    pra,
    psn,
    ppl,
    pzr,
  };
}

// Get current NBM bulletin URL
// productType: 'nbh' for hourly (24h) or 'nbs' for 3-hourly (72h)
export function getNbmBulletinUrl(productType: NbmProductType = 'nbh'): string {
  const now = new Date();
  // NBM is updated hourly, use the previous hour to ensure data is available
  const hour = (now.getUTCHours() - 1 + 24) % 24;
  const hourStr = hour.toString().padStart(2, '0');

  // Format date as YYYYMMDD
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  // blend_nbhtx for hourly, blend_nbstx for short-range (3-hourly)
  const productFile = productType === 'nbh' ? 'blend_nbhtx' : 'blend_nbstx';
  return `https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.${dateStr}/${hourStr}/text/${productFile}.t${hourStr}z`;
}
