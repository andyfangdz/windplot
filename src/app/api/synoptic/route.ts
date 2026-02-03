import { NextRequest, NextResponse } from 'next/server';
import { WindData, WindDataPoint } from '@/lib/types';
import { getAirport } from '@/app/actions';

export const dynamic = 'force-dynamic';

// NWS public token for Synoptic API (requires Origin header)
const SYNOPTIC_TOKEN = '7c76618b66c74aee913bdbae4b448bdd';
const SYNOPTIC_ORIGIN = 'https://www.weather.gov';

interface SynopticObservations {
  date_time: string[];
  wind_speed_set_1?: (number | null)[];
  wind_direction_set_1?: (number | null)[];
  wind_gust_set_1?: (number | null)[];
}

interface SynopticStation {
  STID: string;
  NAME: string;
  LATITUDE: number;
  LONGITUDE: number;
  ELEVATION: number;
  OBSERVATIONS: SynopticObservations;
}

interface SynopticResponse {
  SUMMARY: {
    RESPONSE_CODE: number;
    RESPONSE_MESSAGE: string;
  };
  STATION?: SynopticStation[];
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const icao = searchParams.get('icao')?.toUpperCase() || 'KCDW';
  const hours = Math.min(Math.max(1, parseInt(searchParams.get('hours') || '4', 10)), 720);
  const minutes = hours * 60;

  const url = `https://api.synopticdata.com/v2/stations/timeseries?STID=${icao}&showemptystations=1&units=temp|F,speed|kts,english&recent=${minutes}&complete=1&token=${SYNOPTIC_TOKEN}&obtimezone=local`;

  try {
    const response = await fetch(url, {
      headers: {
        'Origin': SYNOPTIC_ORIGIN,
        'User-Agent': 'WindPlot/1.0 (weather app)',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Synoptic API returned ${response.status}`);
    }

    const data: SynopticResponse = await response.json();

    if (data.SUMMARY?.RESPONSE_CODE !== 1 || !data.STATION || data.STATION.length === 0) {
      return NextResponse.json(
        { error: data.SUMMARY?.RESPONSE_MESSAGE || 'No data available for this station' },
        { status: 404 }
      );
    }

    const station = data.STATION[0];
    const obs = station.OBSERVATIONS;

    // Check if we have any observations
    if (!obs.date_time || obs.date_time.length === 0) {
      return NextResponse.json(
        { error: 'No recent observations available for this station' },
        { status: 404 }
      );
    }

    // Transform to our format
    const observations: WindDataPoint[] = obs.date_time.map((dt, i) => {
      // date_time format: "2026-01-30T18:15:00-0500"
      const timeStr = dt.split('T')[1]?.split(/[-+]/)[0]?.substring(0, 5) || '';
      
      return {
        time: timeStr,
        timestamp: new Date(dt).getTime() / 1000,
        wspd: obs.wind_speed_set_1?.[i] ?? null,
        wgst: obs.wind_gust_set_1?.[i] ?? null,
        wdir: obs.wind_direction_set_1?.[i] ?? null,
      };
    });

    const airport = await getAirport(icao);
    const windData: WindData = {
      icao,
      name: airport?.name || station.NAME || icao,
      observations,
    };

    return NextResponse.json(windData, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Synoptic fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Synoptic data' },
      { status: 500 }
    );
  }
}
