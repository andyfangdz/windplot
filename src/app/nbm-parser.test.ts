import { describe, it, expect } from 'vitest';
import { parseNbmBulletin } from '@/lib/nbm-parser';
import * as fs from 'fs';

// Real NBM bulletin format (as of 2026)
const REAL_FORMAT_BULLETIN = `
KFRG   NBM V4.3 NBH GUIDANCE    2/05/2026  0000 UTC
 UTC  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01
 TMP  24 23 22 20 19 18 17 17 16 16 15 15 17 20 23 25 26 27 28 28 28 26 24 23 21
 TSD   3  3  3  3  3  3  3  3  3  3  2  2  2  2  2  2  2  2  2  2  2  3  3  3  3
 DPT  11 11 10 10  9  9  9  8  8  8  8  8  9 11 13 12 13 13 13 13 13 12 12 11 11
 DSD   2  3  3  3  3  3  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2
 SKY  43 57 68 67 59 59 35 13 13 11 12 13 10  5  9  8 11 23 31 27 22 17 16 12  9
 SSD  40 36 32 22 28 35 32 27 25 26 27 26 12  4  5  6  6 17 27 23 25 27 26 21 10
 WDR  34 33 34 34 34 34 33 33 34 34 34 34 34 35 35 35 35 34 34 34 33 34 34 35 36
 WSP   1  1  1  1  2  2  2  3  3  3  4  4  4  5  6  6  6  6  6  5  4  3  2  2  2
 WSD   2  2  2  2  2  2  2  2  2  2  2  2  2  1  1  1  1  1  1  2  2  2  2  2  2
 GST   6  6  7  6  6  7  7  7  8  8  9  9  9  9 10 10 10  9  9  8  7  7  6  7  7
 GSD   1  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  2  3  3  3  3  3
 P01   0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
 P06                  0                 0                 0                 0
 Q01   0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0
 CIG -88210220200200200-88-88-88-88-88-88-88-88-88-88-88-88-88-88-88-88-88-88-88
 VIS 100100100100100100100100100100100100100100100100100100100100100100100100100

KJFK   NBM V4.3 NBH GUIDANCE    2/05/2026  0000 UTC
 UTC  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01
 TMP  26 25 24 22 21 20 19 19 18 18 17 17 19 22 25 27 28 29 30 30 30 28 26 25 23
`;

// Sample NBM bulletin text for testing (legacy format)
const SAMPLE_BULLETIN = `
KFRG   NBH GFS MOS GUIDANCE   2/05/2026  0700 UTC
DT /FEB   5            /FEB   6                 /
UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08
FHR  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
TMP  34 33 32 31 30 29 28 27 28 30 33 35 37 38 38 37 35 33 32 31 30 29 28 28 27
DPT  28 27 27 26 26 25 25 24 24 24 24 23 22 21 20 19 19 20 21 22 23 24 25 25 26
WDR  29 30 31 31 32 32 33 33 34 34 35 35 36 36 01 01 02 02 03 03 04 04 05 05 06
WSP   8  7  6  5  5  4  4  3  4  5  6  7  8  9 10 11 10  9  8  7  6  5  4  4  5
GST  14 13 12 11 10 -99 -99 -99 -99 12 13 14 15 16 17 18 17 16 15 14 13 12 11 10 -99
SKY  20 25 30 35 40 45 50 55 60 55 50 45 40 35 30 25 20 15 10  5 10 15 20 25 30
CIG 888 200 180 150 120 100  80  60  40  50  60  70  80 100 120 150 180 200 888 888 888 888 888 888 888
VIS  60  55  50  45  40  35  30  25  20  25  30  35  40  45  50  55  60  60  60  60  60  60  60  60  60
P01   0   5  10  15  20  25  30  35  40  35  30  25  20  15  10   5   0   0   0   0   0   0   0   0   0

KJFK   NBH GFS MOS GUIDANCE   2/05/2026  0700 UTC
DT /FEB   5            /FEB   6                 /
UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08
FHR  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
TMP  35 34 33 32 31 30 29 28 29 31 34 36 38 39 39 38 36 34 33 32 31 30 29 29 28
`;

const BULLETIN_WITH_NG = `
KBOS   NBH GFS MOS GUIDANCE   2/05/2026  0700 UTC
DT /FEB   5            /FEB   6                 /
UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08
FHR  01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25
TMP  34 33 32 31 30 29 28 27 28 30 33 35 37 38 38 37 35 33 32 31 30 29 28 28 27
DPT  28 27 27 26 26 25 25 24 24 24 24 23 22 21 20 19 19 20 21 22 23 24 25 25 26
WDR  29 30 31 NG NG 32 33 33 34 34 35 35 36 36 01 01 02 02 03 03 04 04 05 05 06
WSP   8  7  6 NG NG  4  4  3  4  5  6  7  8  9 10 11 10  9  8  7  6  5  4  4  5
GST  14 13 12 NG NG -99 -99 -99 -99 12 13 14 15 16 17 18 17 16 15 14 13 12 11 10 -99
`;

describe('parseNbmBulletin', () => {
  describe('station lookup', () => {
    it('returns null for station not in bulletin', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KXYZ');
      expect(result).toBeNull();
    });

    it('finds station at start of bulletin', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();
      expect(result?.station).toBe('KFRG');
    });

    it('finds station in middle of bulletin', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KJFK');
      expect(result).not.toBeNull();
      expect(result?.station).toBe('KJFK');
    });

    it('returns null for empty bulletin', () => {
      const result = parseNbmBulletin('', 'KFRG');
      expect(result).toBeNull();
    });

    it('returns null for bulletin without NBH marker', () => {
      const result = parseNbmBulletin('KFRG some other text', 'KFRG');
      expect(result).toBeNull();
    });
  });

  describe('time parsing', () => {
    it('parses correct number of forecast hours', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();
      // NBH bulletins have 25 hourly forecasts
      expect(result!.times.length).toBe(25);
    });

    it('parses timestamps as Date objects', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();
      expect(result!.times[0]).toBeInstanceOf(Date);
    });

    it('handles day rollover correctly', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // Hours go 08, 09, ... 23, 00, 01, ... which crosses midnight
      // Find hour 00 which should be on Feb 6
      const hour23Idx = result!.times.findIndex(
        (t) => t.getUTCHours() === 23
      );
      const hour00Idx = result!.times.findIndex((t) => t.getUTCHours() === 0);

      if (hour23Idx >= 0 && hour00Idx >= 0 && hour00Idx > hour23Idx) {
        // Hour 00 should be one day after hour 23
        expect(result!.times[hour00Idx].getUTCDate()).toBe(
          result!.times[hour23Idx].getUTCDate() + 1
        );
      }
    });

    it('parses base time from header', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // Header: "2/05/2026  0700 UTC"
      // First forecast hour is 08, so should be Feb 5, 2026 at 08:00 UTC
      const firstTime = result!.times[0];
      expect(firstTime.getUTCFullYear()).toBe(2026);
      expect(firstTime.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(firstTime.getUTCDate()).toBe(5);
      expect(firstTime.getUTCHours()).toBe(8);
    });
  });

  describe('wind direction (WDR) parsing', () => {
    it('converts WDR from tens of degrees to degrees', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 29 -> 290 degrees
      expect(result!.wdr[0]).toBe(290);

      // Second value: 30 -> 300 degrees
      expect(result!.wdr[1]).toBe(300);

      // Value of 36 -> 360 degrees
      const idx36 = result!.wdr.findIndex((v) => v === 360);
      expect(idx36).toBeGreaterThanOrEqual(0);
    });

    it('handles single-digit directions', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // Values like 01, 02, 03, etc. should become 10, 20, 30
      const idx10 = result!.wdr.findIndex((v) => v === 10);
      expect(idx10).toBeGreaterThanOrEqual(0);
    });
  });

  describe('wind speed (WSP) parsing', () => {
    it('parses wind speed in knots (no conversion)', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 8 kt
      expect(result!.wsp[0]).toBe(8);
      // Second value: 7 kt
      expect(result!.wsp[1]).toBe(7);
    });

    it('parses all wind speed values', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();
      expect(result!.wsp.length).toBe(25);
    });
  });

  describe('wind gust (GST) parsing', () => {
    it('parses gust values correctly', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 14 kt
      expect(result!.gst[0]).toBe(14);
    });

    it('treats -99 as null (no gust)', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // -99 values should become null
      const nullIndices = result!.gst
        .map((v, i) => (v === null ? i : -1))
        .filter((i) => i >= 0);
      expect(nullIndices.length).toBeGreaterThan(0);
    });
  });

  describe('temperature (TMP) parsing', () => {
    it('parses temperature in Fahrenheit', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 34F
      expect(result!.tmp[0]).toBe(34);
      // Second value: 33F
      expect(result!.tmp[1]).toBe(33);
    });
  });

  describe('ceiling (CIG) parsing', () => {
    it('converts CIG from hundreds of feet to feet', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // Second value: 200 -> 20000 feet
      expect(result!.cig[1]).toBe(20000);
      // Fourth value: 150 -> 15000 feet
      expect(result!.cig[3]).toBe(15000);
    });

    it('treats 888 as unlimited ceiling (null)', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 888 -> null (unlimited)
      expect(result!.cig[0]).toBeNull();
    });
  });

  describe('visibility (VIS) parsing', () => {
    it('converts VIS from tenths of miles to miles', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 60 -> 6.0 miles
      expect(result!.vis[0]).toBe(6.0);
      // Second value: 55 -> 5.5 miles
      expect(result!.vis[1]).toBe(5.5);
    });
  });

  describe('precipitation probability (P01) parsing', () => {
    it('parses precipitation probability as percentage', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // First value: 0%
      expect(result!.pop[0]).toBe(0);
      // Third value: 10%
      expect(result!.pop[2]).toBe(10);
      // Ninth value: 40%
      expect(result!.pop[8]).toBe(40);
    });
  });

  describe('special value handling', () => {
    it('treats NG as null', () => {
      const result = parseNbmBulletin(BULLETIN_WITH_NG, 'KBOS');
      expect(result).not.toBeNull();

      // NG values in WDR and WSP should be null
      // Indices 3 and 4 have NG values
      expect(result!.wdr[3]).toBeNull();
      expect(result!.wdr[4]).toBeNull();
      expect(result!.wsp[3]).toBeNull();
      expect(result!.wsp[4]).toBeNull();
    });

    it('treats -99 as null', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      // GST has -99 values which should become null
      const hasNullGusts = result!.gst.some((v) => v === null);
      expect(hasNullGusts).toBe(true);
    });
  });

  describe('data array lengths', () => {
    it('all data arrays have same length as times', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      const expectedLength = result!.times.length;
      expect(result!.wdr.length).toBe(expectedLength);
      expect(result!.wsp.length).toBe(expectedLength);
      expect(result!.gst.length).toBe(expectedLength);
      expect(result!.tmp.length).toBe(expectedLength);
      expect(result!.dpt.length).toBe(expectedLength);
      expect(result!.sky.length).toBe(expectedLength);
      expect(result!.cig.length).toBe(expectedLength);
      expect(result!.vis.length).toBe(expectedLength);
      expect(result!.pop.length).toBe(expectedLength);
    });
  });

  describe('NbmParsedData structure', () => {
    it('returns correct structure', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();

      expect(result).toHaveProperty('station');
      expect(result).toHaveProperty('times');
      expect(result).toHaveProperty('wdr');
      expect(result).toHaveProperty('wsp');
      expect(result).toHaveProperty('gst');
      expect(result).toHaveProperty('tmp');
      expect(result).toHaveProperty('dpt');
      expect(result).toHaveProperty('sky');
      expect(result).toHaveProperty('cig');
      expect(result).toHaveProperty('vis');
      expect(result).toHaveProperty('pop');
    });

    it('station matches input', () => {
      const result = parseNbmBulletin(SAMPLE_BULLETIN, 'KFRG');
      expect(result).not.toBeNull();
      expect(result!.station).toBe('KFRG');
    });
  });
});

describe('parseNbmBulletin with real NBM V4.3 format', () => {
  it('parses station with NBM V4.3 header format', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    expect(result?.station).toBe('KFRG');
  });

  it('parses correct number of forecast hours', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    expect(result!.times.length).toBe(25);
  });

  it('parses wind direction correctly', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // First WDR value: 34 -> 340 degrees
    expect(result!.wdr[0]).toBe(340);
    // Second WDR value: 33 -> 330 degrees
    expect(result!.wdr[1]).toBe(330);
  });

  it('parses wind speed correctly', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // First WSP value: 1 kt
    expect(result!.wsp[0]).toBe(1);
    // Tenth WSP value: 3 kt
    expect(result!.wsp[7]).toBe(3);
  });

  it('parses gusts correctly', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // First GST value: 6 kt
    expect(result!.gst[0]).toBe(6);
  });

  it('parses temperature correctly', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // First TMP value: 24F
    expect(result!.tmp[0]).toBe(24);
  });

  it('handles -88 ceiling as unlimited (null)', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // First CIG value: -88 -> null (unlimited)
    expect(result!.cig[0]).toBeNull();
    // Second CIG value: 210 -> 21000 feet
    expect(result!.cig[1]).toBe(21000);
  });

  it('finds KJFK station in bulletin', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KJFK');
    expect(result).not.toBeNull();
    expect(result?.station).toBe('KJFK');
  });

  it('correctly extracts base time from header', () => {
    const result = parseNbmBulletin(REAL_FORMAT_BULLETIN, 'KFRG');
    expect(result).not.toBeNull();
    // Header: "2/05/2026  0000 UTC", first hour is 01
    const firstTime = result!.times[0];
    expect(firstTime.getUTCFullYear()).toBe(2026);
    expect(firstTime.getUTCMonth()).toBe(1); // February
    expect(firstTime.getUTCDate()).toBe(5);
    expect(firstTime.getUTCHours()).toBe(1);
  });
});

// Integration test with real bulletin file (if available)
describe('parseNbmBulletin integration test', () => {
  // This tests with actual downloaded bulletin data
  const realBulletinPath = '/tmp/real_bulletin.txt';

  it.skipIf(!fs.existsSync(realBulletinPath))('parses KCDW from real bulletin file', () => {
    const bulletinText = fs.readFileSync(realBulletinPath, 'utf-8');
    const result = parseNbmBulletin(bulletinText, 'KCDW');

    expect(result).not.toBeNull();
    expect(result?.station).toBe('KCDW');
    expect(result!.times.length).toBe(25);
    expect(result!.wdr.length).toBe(25);
    expect(result!.wsp.length).toBe(25);
    expect(result!.gst.length).toBe(25);

    // Verify wind direction is converted correctly (tens of degrees to degrees)
    const hasValidWdr = result!.wdr.some((v) => v !== null && v >= 0 && v <= 360);
    expect(hasValidWdr).toBe(true);
  });

  it.skipIf(!fs.existsSync(realBulletinPath))('parses KFRG from real bulletin file', () => {
    const bulletinText = fs.readFileSync(realBulletinPath, 'utf-8');
    const result = parseNbmBulletin(bulletinText, 'KFRG');

    expect(result).not.toBeNull();
    expect(result?.station).toBe('KFRG');
    expect(result!.times.length).toBe(25);
  });

  it.skipIf(!fs.existsSync(realBulletinPath))('parses KJFK from real bulletin file', () => {
    const bulletinText = fs.readFileSync(realBulletinPath, 'utf-8');
    const result = parseNbmBulletin(bulletinText, 'KJFK');

    expect(result).not.toBeNull();
    expect(result?.station).toBe('KJFK');
    expect(result!.times.length).toBe(25);
  });
});
