export interface Runway {
  low: string;
  high: string;
  trueHdg: number;
}

export interface Airport {
  icao: string;
  name: string;
  runways: Runway[];
}

export const AIRPORTS: Record<string, Airport> = {
  KCDW: {
    icao: 'KCDW',
    name: 'Essex County Airport',
    runways: [
      { low: '04', high: '22', trueHdg: 30 },
      { low: '10', high: '28', trueHdg: 83 },
    ],
  },
  KFRG: {
    icao: 'KFRG',
    name: 'Republic Airport',
    runways: [
      { low: '01', high: '19', trueHdg: 359 },
      { low: '14', high: '32', trueHdg: 132 },
    ],
  },
  KTEB: {
    icao: 'KTEB',
    name: 'Teterboro Airport',
    runways: [
      { low: '01', high: '19', trueHdg: 10 },
      { low: '06', high: '24', trueHdg: 58 },
    ],
  },
  KMMU: {
    icao: 'KMMU',
    name: 'Morristown Airport',
    runways: [
      { low: '05', high: '23', trueHdg: 49 },
      { low: '13', high: '31', trueHdg: 131 },
    ],
  },
  KEWR: {
    icao: 'KEWR',
    name: 'Newark Liberty International',
    runways: [
      { low: '04L', high: '22R', trueHdg: 40 },
      { low: '04R', high: '22L', trueHdg: 43 },
      { low: '11', high: '29', trueHdg: 114 },
    ],
  },
};

export const AIRPORT_LIST = Object.values(AIRPORTS);
