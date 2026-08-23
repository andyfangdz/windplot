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
  // Sky/surface conditions, present only for stations that report them in the
  // 5-minute feed. Units follow the Synoptic request (temp|F, english).
  temp?: number | null;       // Fahrenheit
  dewp?: number | null;       // Fahrenheit
  visib?: number | null;      // Statute miles; negative means "less than"
  altim?: number | null;      // Inches of mercury
  clouds?: CloudLayer[];      // Decoded from cloud_layer_N_code, lowest first
  weather?: string | null;    // Present weather summary, when reported
}

export interface WindData {
  icao: string;
  name: string;
  observations: WindDataPoint[];
  elevationFt?: number | null;  // Station elevation from Synoptic metadata
}

// Conditions normalized to one unit system so the UI can render either source
export interface ObservedConditions {
  source: 'synoptic' | 'metar';
  timestamp: number | null;      // Unix seconds
  tempC: number | null;
  dewpC: number | null;
  visibilitySm: number | null;
  // True when the sensor reported "at or above" (METAR "10+") rather than exact
  visibilityIsPlus: boolean;
  // True when the sensor reported "less than" (Synoptic negative visibility)
  visibilityIsBelow: boolean;
  altimeterInHg: number | null;
  clouds: CloudLayer[];
  cover: string | null;          // Summary cover when no layers are listed
  weather: string | null;        // Decoded present weather
  vertVisFt: number | null;
  rawOb: string | null;
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
