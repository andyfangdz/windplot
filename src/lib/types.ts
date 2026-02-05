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

// NBM Forecast data point (hourly forecast)
export interface ForecastDataPoint {
  time: string;           // Display time (HH:MM)
  timestamp: number;      // Unix timestamp in seconds
  wspd: number | null;    // Wind speed in knots
  wgst: number | null;    // Wind gust in knots
  wdir: number | null;    // Wind direction in degrees
  temp?: number | null;   // Temperature in Fahrenheit
  sky?: number | null;    // Sky cover percentage
  pop?: number | null;    // Probability of precipitation
}

// NBM Forecast data container
export interface ForecastData {
  icao: string;
  name: string;
  forecasts: ForecastDataPoint[];
  generatedAt?: number;   // When the forecast was generated (Unix timestamp)
  validUntil?: number;    // Forecast valid until (Unix timestamp)
}
