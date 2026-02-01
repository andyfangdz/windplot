export interface MetarObservation {
  icaoId: string;
  reportTime: string;
  obsTime: number;
  temp: number | null;
  dewp: number | null;
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  visib: string | number | null;
  altim: number | null;
  rawOb: string;
  name?: string;
}

export interface WindDataPoint {
  time: string;
  timestamp: number;
  wspd: number | null;
  wgst: number | null;
  wdir: number | null;
}

export interface WindData {
  icao: string;
  name: string;
  observations: WindDataPoint[];
}
