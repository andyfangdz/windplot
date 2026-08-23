'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  ChartOptions,
} from 'chart.js';
import { WindDataPoint } from '@/lib/types';
import { hasSkyData } from '@/lib/conditions';
import {
  FLIGHT_CATEGORY_STYLES,
  FlightCategory,
  ceilingFromClouds,
  computeFlightCategory,
  formatCeiling,
  formatCloudLayer,
} from '@/lib/weather';
import { useHorizontalSwipeLock } from '@/lib/useHorizontalSwipeLock';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

interface ConditionsHistoryProps {
  observations: WindDataPoint[];
}

// Matches ForecastConditions so the two panels read on the same scale
const ALTITUDE_CAP_FT = 12000;
const VISIBILITY_CAP_SM = 10;

// ASOS reports at most three layers
const MAX_LAYERS = 3;

// Denser coverage reads as a brighter mark
const COVER_COLORS: Record<string, string> = {
  FEW: 'rgba(148, 163, 184, 0.5)',
  SCT: 'rgba(186, 202, 219, 0.8)',
  BKN: '#cbd5e1',
  OVC: '#f1f5f9',
  OVX: '#a855f7',
  CLR: 'rgba(148, 163, 184, 0.3)',
};

export default function ConditionsHistory({ observations }: ConditionsHistoryProps) {
  const chartContainerRef = useHorizontalSwipeLock<HTMLDivElement>();

  const history = useMemo(() => {
    const points = observations.filter(hasSkyData);
    if (points.length === 0) return null;

    const labels: string[] = [];
    const categories: (FlightCategory | null)[] = [];
    const ceilings: (number | null)[] = [];
    const visibilities: (number | null)[] = [];
    // One series per layer slot, coloured per point by that layer's coverage
    const layerBases: (number | null)[][] = Array.from({ length: MAX_LAYERS }, () => []);
    const layerColors: string[][] = Array.from({ length: MAX_LAYERS }, () => []);

    let sawClampedLayer = false;

    for (const point of points) {
      labels.push(point.time);

      const layers = (point.clouds ?? []).filter((layer) => layer.base !== null);
      for (let slot = 0; slot < MAX_LAYERS; slot++) {
        const layer = layers[slot];
        if (!layer || layer.base === null) {
          layerBases[slot].push(null);
          layerColors[slot].push('transparent');
          continue;
        }
        if (layer.base > ALTITUDE_CAP_FT) sawClampedLayer = true;
        layerBases[slot].push(Math.min(layer.base, ALTITUDE_CAP_FT));
        layerColors[slot].push(COVER_COLORS[layer.cover] ?? '#94a3b8');
      }

      const ceiling = ceilingFromClouds(point.clouds);
      // A missing ceiling means "no ceiling", so pin it to the top of the axis
      ceilings.push(ceiling === null ? ALTITUDE_CAP_FT : Math.min(ceiling, ALTITUDE_CAP_FT));

      const visibility =
        typeof point.visib === 'number' ? Math.abs(point.visib) : null;
      visibilities.push(visibility === null ? null : Math.min(visibility, VISIBILITY_CAP_SM));

      categories.push(computeFlightCategory(ceiling, visibility));
    }

    const hasAnyLayer = layerBases.some((series) => series.some((v) => v !== null));

    return {
      points,
      labels,
      categories,
      ceilings,
      visibilities,
      layerBases,
      layerColors,
      hasAnyLayer,
      sawClampedLayer,
    };
  }, [observations]);

  const chartData = useMemo(() => {
    if (!history) return null;
    return {
      labels: history.labels,
      datasets: [
        // Cloud layers first so the ceiling line draws over them
        ...history.layerBases.map((data, slot) => ({
          label: `Layer ${slot + 1}`,
          data,
          yAxisID: 'yAlt',
          showLine: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: history.layerColors[slot],
          pointBorderColor: 'transparent',
          borderColor: 'transparent',
        })),
        {
          label: 'Ceiling',
          data: history.ceilings,
          yAxisID: 'yAlt',
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          stepped: true as const,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
        {
          label: 'Visibility',
          data: history.visibilities,
          yAxisID: 'yVis',
          borderColor: '#1d9bf0',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    };
  }, [history]);

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      hover: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(25, 39, 52, 0.95)',
          titleColor: '#fff',
          titleFont: { size: 13, weight: 'bold' },
          bodyColor: '#e7e9ea',
          bodyFont: { size: 12 },
          borderColor: '#38444d',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            // One tooltip per observation rather than one per dataset
            title: (items) => {
              if (!items.length || !history) return '';
              const idx = items[0].dataIndex;
              const category = history.categories[idx];
              return category
                ? `${history.labels[idx]} — ${category}`
                : history.labels[idx];
            },
            label: () => '',
            afterBody: (items) => {
              if (!items.length || !history) return [];
              const idx = items[0].dataIndex;
              const point = history.points[idx];
              const lines: string[] = [];

              const layers = (point.clouds ?? []).filter((l) => l.base !== null);
              lines.push(
                layers.length
                  ? layers.map(formatCloudLayer).join('  ')
                  : 'No layers reported'
              );
              lines.push(`Ceiling: ${formatCeiling(ceilingFromClouds(point.clouds))}`);
              if (typeof point.visib === 'number') {
                const vis = Math.abs(point.visib);
                lines.push(
                  `Visibility: ${point.visib < 0 ? '< ' : ''}${
                    vis >= 1 ? Math.round(vis * 10) / 10 : vis
                  } sm`
                );
              }
              return lines;
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
        yAlt: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          max: ALTITUDE_CAP_FT,
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (value) =>
              Number(value) >= ALTITUDE_CAP_FT
                ? '12k+'
                : `${Math.round(Number(value) / 1000)}k`,
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
        },
        yVis: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          max: VISIBILITY_CAP_SM,
          ticks: {
            color: '#1d9bf0',
            font: { size: 10 },
            callback: (value) => `${value}sm`,
          },
          grid: { display: false },
        },
      },
    }),
    [history]
  );

  if (!history || !chartData) return null;
  // Visibility-only stations get nothing useful out of a sky plot
  if (!history.hasAnyLayer) return null;

  return (
    <div className="chart-section">
      <div className="chart-title">Sky Condition History</div>

      {/* Flight category over the same window */}
      <div
        className="flex gap-[1px] mb-3 overflow-hidden rounded"
        title="Flight category over the observation window"
      >
        {history.categories.map((category, idx) => (
          <div
            key={`${history.points[idx].timestamp}-${idx}`}
            className="flex-1 min-w-0 h-3"
            style={{
              backgroundColor: category
                ? FLIGHT_CATEGORY_STYLES[category].color
                : 'var(--bg-tertiary)',
            }}
            title={`${history.labels[idx]}${category ? ` — ${category}` : ''}`}
          />
        ))}
      </div>

      <div
        ref={chartContainerRef}
        className="relative h-[200px] lg:h-[260px] w-full"
      >
        <Line data={chartData} options={options} />
      </div>

      <div className="legend">
        {(['FEW', 'SCT', 'BKN', 'OVC'] as const).map((cover) => (
          <div key={cover} className="legend-item">
            <div
              className="legend-dot"
              style={{ backgroundColor: COVER_COLORS[cover] }}
            ></div>
            {cover}
          </div>
        ))}
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#f59e0b' }}></div>
          Ceiling
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#1d9bf0' }}></div>
          Visibility
        </div>
      </div>

      <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
        Each dot is one reported layer; the ceiling line rides the top of the scale
        when there is no ceiling
        {history.sawClampedLayer && '. Layers above 12,000 ft are drawn at the cap'}
      </p>
    </div>
  );
}
