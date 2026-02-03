'use client';

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
import { WindDataPoint } from '@/lib/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
);

// Custom plugin for vertical crosshair line
const crosshairPlugin: Plugin<'line'> = {
  id: 'crosshair',
  afterDraw: (chart) => {
    const tooltip = chart.tooltip;
    if (tooltip && tooltip.getActiveElements().length > 0) {
      const ctx = chart.ctx;
      const activePoint = tooltip.getActiveElements()[0];
      const x = activePoint.element.x;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();
    }
  },
};

interface WindSpeedChartProps {
  observations: WindDataPoint[];
}

// Format direction as cardinal
const formatDirection = (deg: number | null): string => {
  if (deg === null) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

export default function WindSpeedChart({ observations }: WindSpeedChartProps) {
  const labels = observations.map((d) => d.time);
  const windSpeeds = observations.map((d) => d.wspd);
  const gustSpeeds = observations.map((d) => d.wgst);
  const windDirs = observations.map((d) => d.wdir);

  const data = {
    labels,
    datasets: [
      {
        label: 'Wind',
        data: windSpeeds,
        borderColor: '#1d9bf0',
        backgroundColor: 'rgba(29, 155, 240, 0.15)',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#1d9bf0',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        borderWidth: 2.5,
      },
      {
        label: 'Gusts',
        data: gustSpeeds,
        borderColor: '#f91880',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        tension: 0.3,
        pointRadius: gustSpeeds.map((g) => (g ? 5 : 0)),
        pointBackgroundColor: '#f91880',
        borderWidth: 2,
      },
    ],
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
            return [`${items[0].label}`, `Direction: ${dirStr}`];
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
          maxRotation: 0,
          maxTicksLimit: 8,
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
    <div className="chart-section w-full overflow-hidden h-full">
      <div className="chart-title">📈 Wind & Gusts</div>
      <div className="relative h-[180px] lg:h-[280px] w-full">
        <Line data={data} options={options} plugins={[crosshairPlugin]} />
      </div>
      <div className="legend">
        <div className="legend-item">
          <div className="legend-dot bg-[#1d9bf0]"></div>
          Wind
        </div>
        <div className="legend-item">
          <div className="legend-dot bg-[#f91880]"></div>
          Gusts
        </div>
      </div>
    </div>
  );
}
