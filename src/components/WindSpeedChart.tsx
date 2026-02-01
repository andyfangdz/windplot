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

interface WindSpeedChartProps {
  observations: WindDataPoint[];
}

export default function WindSpeedChart({ observations }: WindSpeedChartProps) {
  const labels = observations.map((d) => d.time);
  const windSpeeds = observations.map((d) => d.wspd);
  const gustSpeeds = observations.map((d) => d.wgst);

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
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#192734',
        titleColor: '#fff',
        bodyColor: '#8899a6',
        borderColor: '#38444d',
        borderWidth: 1,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            if (value === null) return '';
            return `${context.dataset.label}: ${value}kt`;
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
    <div className="chart-section">
      <div className="chart-title">📈 Wind & Gusts</div>
      <div className="h-[180px]">
        <Line data={data} options={options} />
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
