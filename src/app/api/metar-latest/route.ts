import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const icao = searchParams.get('icao')?.toUpperCase() || 'KCDW';

  const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0',
      },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      throw new Error(`Aviation Weather API returned ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'No METAR data available for this station' },
        { status: 404 }
      );
    }

    const latest = data[0];
    return NextResponse.json({
      wdir: latest.wdir,
      wspd: latest.wspd,
      wgst: latest.wgst,
      rawOb: latest.rawOb,
      obsTime: latest.obsTime,
    });
  } catch (error) {
    console.error('METAR fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch METAR data' },
      { status: 500 }
    );
  }
}
