'use client';

import { useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  ChartOptions,
  Plugin,
} from 'chart.js';
import { ForecastDataPoint } from '@/lib/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

interface ForecastChartProps {
  forecasts: ForecastDataPoint[];
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
}

// Format direction as cardinal
const formatDirection = (deg: number | null): string => {
  if (deg === null) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

export default function ForecastChart({ forecasts, selectedIdx, onSelectIdx }: ForecastChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);

  const labels = forecasts.map((d) => d.time);
  const windSpeeds = forecasts.map((d) => d.wspd);
  const gustSpeeds = forecasts.map((d) => d.wgst);
  const windDirs = forecasts.map((d) => d.wdir);

  // Custom plugin for selected index vertical line
  const selectedLinePlugin: Plugin<'line'> = useMemo(() => ({
    id: 'selectedLine',
    afterDraw: (chart) => {
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[selectedIdx]) return;

      const ctx = chart.ctx;
      const x = meta.data[selectedIdx].x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.stroke();
      ctx.restore();
    },
  }), [selectedIdx]);

  // Point radii: larger for selected point
  const windPointRadii = windSpeeds.map((_, i) => i === selectedIdx ? 7 : 3);
  const gustPointRadii = gustSpeeds.map((g, i) => g ? (i === selectedIdx ? 8 : 4) : 0);

  const data = {
    labels,
    datasets: [
      {
        label: 'Wind',
        data: windSpeeds,
        borderColor: '#10b981', // Green for forecast
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: windPointRadii,
        pointHoverRadius: 8,
        pointHoverBackgroundColor: '#10b981',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        pointBackgroundColor: windSpeeds.map((_, i) => i === selectedIdx ? '#fff' : '#10b981'),
        pointBorderColor: windSpeeds.map((_, i) => i === selectedIdx ? '#10b981' : 'transparent'),
        pointBorderWidth: windSpeeds.map((_, i) => i === selectedIdx ? 3 : 0),
        borderWidth: 2.5,
      },
      {
        label: 'Gusts',
        data: gustSpeeds,
        borderColor: '#f59e0b', // Amber for forecast gusts
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.3,
        pointRadius: gustPointRadii,
        pointBackgroundColor: gustSpeeds.map((_, i) => i === selectedIdx ? '#fff' : '#f59e0b'),
        pointBorderColor: gustSpeeds.map((g, i) => g && i === selectedIdx ? '#f59e0b' : 'transparent'),
        pointBorderWidth: gustSpeeds.map((g, i) => g && i === selectedIdx ? 3 : 0),
        borderWidth: 2,
      },
    ],
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const chart = chartRef.current;
    if (!chart) return;

    const points = chart.getElementsAtEventForMode(
      event.nativeEvent,
      'index',
      { intersect: false },
      false
    );

    if (points.length > 0) {
      onSelectIdx(points[0].index);
    }
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    hover: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(25, 39, 52, 0.95)',
        titleColor: '#fff',
        titleFont: { size: 13, weight: 'bold' },
        bodyColor: '#e7e9ea',
        bodyFont: { size: 12 },
        borderColor: '#38444d',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const idx = items[0].dataIndex;
            const dir = windDirs[idx];
            const dirStr = dir !== null ? `${dir}° (${formatDirection(dir)})` : '—';
            const forecast = forecasts[idx];
            const lines = [`${items[0].label}`, `Direction: ${dirStr}`];
            if (forecast.temp !== null && forecast.temp !== undefined) {
              lines.push(`Temp: ${forecast.temp}°F`);
            }
            if (forecast.pop !== null && forecast.pop !== undefined) {
              lines.push(`Precip: ${forecast.pop}%`);
            }
            return lines;
          },
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return ` ${context.dataset.label}: ${value} kt`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#8899a6',
          font: { size: 10 },
          maxRotation: 45,
          maxTicksLimit: 12,
        },
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: '#8899a6',
          font: { size: 10 },
          callback: (value) => `${value}kt`,
        },
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
      },
    },
  };

  return (
    <div className="chart-section w-full overflow-hidden">
      <div className="chart-title">Wind Forecast (NBM)</div>
      <div className="relative h-[220px] lg:h-[300px] w-full cursor-pointer">
        <Line
          ref={chartRef}
          data={data}
          options={options}
          plugins={[selectedLinePlugin]}
          onClick={handleClick}
        />
      </div>
      <div className="legend">
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#10b981' }}></div>
          Forecast Wind
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#f59e0b' }}></div>
          Forecast Gusts
        </div>
      </div>
      <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
        NOAA National Blend of Models
      </p>
    </div>
  );
}
