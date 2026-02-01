import { NextRequest, NextResponse } from 'next/server';
import { MetarObservation, WindData, WindDataPoint } from '@/lib/types';
import { AIRPORTS } from '@/lib/airports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const icao = searchParams.get('icao')?.toUpperCase() || 'KCDW';
  const hours = parseInt(searchParams.get('hours') || '4', 10);

  const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&hours=${hours}&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0',
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Aviation Weather API returned ${response.status}`);
    }

    const data: MetarObservation[] = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'No METAR data available for this station' },
        { status: 404 }
      );
    }

    // Sort observations by time (oldest first for chart)
    const sorted = data.sort((a, b) => a.obsTime - b.obsTime);

    // Transform to our format
    const observations: WindDataPoint[] = sorted.map((obs) => {
      const date = new Date(obs.obsTime * 1000);
      return {
        time: date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'America/New_York',
        }),
        timestamp: obs.obsTime,
        wspd: obs.wspd,
        wgst: obs.wgst,
        wdir: obs.wdir === 0 ? null : obs.wdir, // 0 = variable/calm
      };
    });

    const airport = AIRPORTS[icao];
    const windData: WindData = {
      icao,
      name: airport?.name || data[0]?.name || icao,
      observations,
    };

    return NextResponse.json(windData);
  } catch (error) {
    console.error('METAR fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch METAR data' },
      { status: 500 }
    );
  }
}
