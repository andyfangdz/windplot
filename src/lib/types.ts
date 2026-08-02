// A single reported cloud layer (cover code + base in feet AGL)
export interface CloudLayer {
  cover: string;          // SKC/CLR/FEW/SCT/BKN/OVC/OVX
  base: number | null;    // Feet AGL, null when not reported (e.g. CLR)
}

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
  clouds: CloudLayer[];
  wxString: string | null;
  vertVis: number | null;
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
  dewp?: number | null;   // Dew point in Fahrenheit
  sky?: number | null;    // Sky cover percentage
  pop?: number | null;    // Probability of precipitation
  cig?: number | null;    // Ceiling in feet (null = unlimited / no ceiling)
  vis?: number | null;    // Visibility in statute miles
  cloudBase?: number | null;  // Lowest cloud base in feet (null = no clouds)
  tstm?: number | null;       // Thunderstorm probability %
  mvfrProb?: number | null;   // Probability of MVFR ceiling %
  ifrProb?: number | null;    // Probability of IFR ceiling %
  lifrProb?: number | null;   // Probability of LIFR ceiling %
  rainProb?: number | null;          // Conditional probability of rain %
  snowProb?: number | null;          // Conditional probability of snow %
  icePelletProb?: number | null;     // Conditional probability of ice pellets %
  freezingRainProb?: number | null;  // Conditional probability of freezing rain %
}

// NBM Forecast data container
export interface ForecastData {
  icao: string;
  name: string;
  forecasts: ForecastDataPoint[];
  generatedAt?: number;   // When the forecast was generated (Unix timestamp)
  validUntil?: number;    // Forecast valid until (Unix timestamp)
}
