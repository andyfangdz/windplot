'use client';

import { useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
  ChartOptions,
  Plugin,
} from 'chart.js';
import { ForecastDataPoint } from '@/lib/types';
import {
  FLIGHT_CATEGORY_STYLES,
  FlightCategory,
  computeFlightCategory,
  fahrenheitToCelsius,
  formatCeiling,
  relativeHumidity,
  skyCoverCode,
  cloudCoverLabel,
} from '@/lib/weather';
import { useHorizontalSwipeLock } from '@/lib/useHorizontalSwipeLock';
import FlightCategoryBadge from './FlightCategoryBadge';
import StatTile from './StatTile';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

interface ForecastConditionsProps {
  forecasts: ForecastDataPoint[];
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
}

// Ceilings above this are drawn at the top of the axis — the exact value stops
// mattering to a pilot well before then.
const CEILING_CAP_FT = 12000;
const VISIBILITY_CAP_SM = 10;

function formatForecastVisibility(vis: number | null | undefined): string {
  if (vis === null || vis === undefined) return '—';
  if (vis >= 10) return '10+ sm';
  if (vis >= 1) return `${Math.round(vis * 10) / 10} sm`;
  return `${Math.round(vis * 100) / 100} sm`;
}

// Highest-probability precipitation type for a forecast hour
function dominantPrecipType(point: ForecastDataPoint): { label: string; prob: number } | null {
  const candidates: { label: string; prob: number | null | undefined }[] = [
    { label: 'Rain', prob: point.rainProb },
    { label: 'Snow', prob: point.snowProb },
    { label: 'Ice pellets', prob: point.icePelletProb },
    { label: 'Freezing rain', prob: point.freezingRainProb },
  ];
  let best: { label: string; prob: number } | null = null;
  for (const candidate of candidates) {
    if (typeof candidate.prob !== 'number' || candidate.prob <= 0) continue;
    if (!best || candidate.prob > best.prob) {
      best = { label: candidate.label, prob: candidate.prob };
    }
  }
  return best;
}

export default function ForecastConditions({
  forecasts,
  selectedIdx,
  onSelectIdx,
}: ForecastConditionsProps) {
  const chartRef = useRef<ChartJS<'line'>>(null);
  const chartContainerRef = useHorizontalSwipeLock<HTMLDivElement>();

  const categories = useMemo(
    () =>
      forecasts.map((point) =>
        computeFlightCategory(point.cig ?? null, point.vis ?? null)
      ),
    [forecasts]
  );

  const hasConditionData = useMemo(
    () =>
      forecasts.some(
        (point) =>
          point.vis !== null && point.vis !== undefined
      ) ||
      forecasts.some((point) => point.sky !== null && point.sky !== undefined),
    [forecasts]
  );

  const selected = forecasts[selectedIdx];
  const selectedCategory = categories[selectedIdx] ?? null;

  const selectedHumidity = useMemo(() => {
    if (!selected) return null;
    const tempC =
      typeof selected.temp === 'number' ? fahrenheitToCelsius(selected.temp) : null;
    const dewpC =
      typeof selected.dewp === 'number' ? fahrenheitToCelsius(selected.dewp) : null;
    return relativeHumidity(tempC, dewpC);
  }, [selected]);

  // Vertical marker for the selected hour, matching the wind forecast chart
  const selectedLinePlugin: Plugin<'line'> = useMemo(
    () => ({
      id: 'selectedConditionLine',
      afterDraw: (chart) => {
        const meta = chart.getDatasetMeta(0);
        if (!meta.data[selectedIdx]) return;

        const ctx = chart.ctx;
        const x = meta.data[selectedIdx].x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chart.scales.yCeiling.top);
        ctx.lineTo(x, chart.scales.yCeiling.bottom);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
        ctx.stroke();
        ctx.restore();
      },
    }),
    [selectedIdx]
  );

  const chartData = useMemo(() => {
    // A null ceiling from NBM means "no ceiling", so pin it to the top of the axis
    const ceilings = forecasts.map((point) =>
      point.cig === null || point.cig === undefined
        ? CEILING_CAP_FT
        : Math.min(point.cig, CEILING_CAP_FT)
    );
    const visibilities = forecasts.map((point) =>
      point.vis === null || point.vis === undefined
        ? null
        : Math.min(point.vis, VISIBILITY_CAP_SM)
    );

    return {
      labels: forecasts.map((point) => point.time),
      datasets: [
        {
          label: 'Ceiling',
          data: ceilings,
          yAxisID: 'yCeiling',
          borderColor: '#94a3b8',
          backgroundColor: 'rgba(148, 163, 184, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.5,
          pointRadius: ceilings.map((_, i) => (i === selectedIdx ? 6 : 2)),
          pointBackgroundColor: ceilings.map((_, i) =>
            i === selectedIdx ? '#fff' : '#94a3b8'
          ),
          pointBorderColor: ceilings.map((_, i) =>
            i === selectedIdx ? '#94a3b8' : 'transparent'
          ),
          pointBorderWidth: ceilings.map((_, i) => (i === selectedIdx ? 3 : 0)),
        },
        {
          label: 'Visibility',
          data: visibilities,
          yAxisID: 'yVis',
          borderColor: '#1d9bf0',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3,
          borderWidth: 2,
          pointRadius: visibilities.map((v, i) =>
            v === null ? 0 : i === selectedIdx ? 6 : 2
          ),
          pointBackgroundColor: visibilities.map((_, i) =>
            i === selectedIdx ? '#fff' : '#1d9bf0'
          ),
          pointBorderColor: visibilities.map((v, i) =>
            v !== null && i === selectedIdx ? '#1d9bf0' : 'transparent'
          ),
          pointBorderWidth: visibilities.map((v, i) =>
            v !== null && i === selectedIdx ? 3 : 0
          ),
        },
      ],
    };
  }, [forecasts, selectedIdx]);

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
          usePointStyle: true,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const category = categories[idx];
              return category ? `${items[0].label} — ${category}` : items[0].label;
            },
            label: (context) => {
              const idx = context.dataIndex;
              const point = forecasts[idx];
              if (context.dataset.label === 'Ceiling') {
                return ` Ceiling: ${formatCeiling(point.cig ?? null)}`;
              }
              return ` Visibility: ${formatForecastVisibility(point.vis)}`;
            },
            afterBody: (items) => {
              if (!items.length) return [];
              const point = forecasts[items[0].dataIndex];
              const lines: string[] = [];
              const cover = skyCoverCode(point.sky);
              if (cover) lines.push(`Sky: ${cover} (${point.sky}%)`);
              if (typeof point.pop === 'number') lines.push(`Precip: ${point.pop}%`);
              if (typeof point.tstm === 'number' && point.tstm > 0) {
                lines.push(`Thunder: ${point.tstm}%`);
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
            maxRotation: 45,
            maxTicksLimit: 12,
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
        },
        yCeiling: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          max: CEILING_CAP_FT,
          ticks: {
            color: '#94a3b8',
            font: { size: 10 },
            callback: (value) =>
              Number(value) >= CEILING_CAP_FT
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
    [forecasts, categories]
  );

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

  if (forecasts.length === 0 || !hasConditionData) return null;

  const selectedCover = skyCoverCode(selected?.sky);
  const precipType = selected ? dominantPrecipType(selected) : null;
  const categoryProbs: { label: FlightCategory; value: number | null | undefined }[] = [
    { label: 'MVFR', value: selected?.mvfrProb },
    { label: 'IFR', value: selected?.ifrProb },
    { label: 'LIFR', value: selected?.lifrProb },
  ];
  const hasCategoryProbs = categoryProbs.some((p) => typeof p.value === 'number');

  return (
    <div className="chart-section">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="chart-title mb-0">Ceiling &amp; Visibility Forecast</div>
        <div className="flex items-center gap-2">
          <FlightCategoryBadge category={selectedCategory} />
          <span className="text-[10px] text-[var(--text-tertiary)]">{selected?.time}</span>
        </div>
      </div>

      {/* Flight category timeline — one cell per forecast hour */}
      <div className="flex gap-[2px] mb-3 overflow-hidden rounded" title="Forecast flight category by hour">
        {categories.map((category, idx) => (
          <button
            key={forecasts[idx].timestamp}
            onClick={() => onSelectIdx(idx)}
            className="flex-1 min-w-0 h-4 transition-opacity"
            style={{
              backgroundColor: category
                ? FLIGHT_CATEGORY_STYLES[category].color
                : 'var(--bg-tertiary)',
              opacity: idx === selectedIdx ? 1 : 0.5,
            }}
            title={`${forecasts[idx].time}${category ? ` — ${category}` : ''}`}
            aria-label={`Select ${forecasts[idx].time}${category ? `, ${category}` : ''}`}
          />
        ))}
      </div>

      <div ref={chartContainerRef} className="relative h-[180px] lg:h-[220px] w-full cursor-pointer">
        <Line
          ref={chartRef}
          data={chartData}
          options={options}
          plugins={[selectedLinePlugin]}
          onClick={handleClick}
        />
      </div>

      <div className="legend">
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#94a3b8' }}></div>
          Ceiling
        </div>
        <div className="legend-item">
          <div className="legend-dot" style={{ backgroundColor: '#1d9bf0' }}></div>
          Visibility
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
          <StatTile
            label="Ceiling"
            value={formatCeiling(selected.cig ?? null)}
            sub={selected.cig !== null && selected.cig !== undefined ? 'AGL' : 'no ceiling'}
            title="Forecast ceiling"
          />
          <StatTile
            label="Visibility"
            value={formatForecastVisibility(selected.vis)}
            title="Forecast surface visibility"
          />
          <StatTile
            label="Sky Cover"
            value={selectedCover ? `${selectedCover} ${selected.sky}%` : '—'}
            sub={selectedCover ? cloudCoverLabel(selectedCover) : null}
            title="Forecast total sky cover"
          />
          <StatTile
            label="Cloud Base"
            value={
              selected.cloudBase !== null && selected.cloudBase !== undefined
                ? `${selected.cloudBase.toLocaleString()} ft`
                : 'None'
            }
            sub="lowest layer"
            title="Lowest forecast cloud base, any coverage"
          />
          <StatTile
            label="Temp / Dew"
            value={
              typeof selected.temp === 'number' && typeof selected.dewp === 'number'
                ? `${selected.temp}° / ${selected.dewp}°F`
                : typeof selected.temp === 'number'
                  ? `${selected.temp}°F`
                  : '—'
            }
            sub={selectedHumidity !== null ? `${selectedHumidity}% RH` : null}
          />
          <StatTile
            label="Precip"
            value={typeof selected.pop === 'number' ? `${selected.pop}%` : '—'}
            sub={precipType ? `${precipType.label} ${precipType.prob}%` : null}
            title="Probability of precipitation"
          />
          <StatTile
            label="Thunder"
            value={typeof selected.tstm === 'number' ? `${selected.tstm}%` : '—'}
            accent={
              typeof selected.tstm === 'number' && selected.tstm >= 20 ? '#f59e0b' : undefined
            }
            title="Thunderstorm probability"
          />
          {hasCategoryProbs && (
            <div className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-color)] rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
                Cat. Risk
              </div>
              <div className="flex flex-col gap-0.5 mt-1">
                {categoryProbs.map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-[10px] font-bold"
                      style={{ color: FLIGHT_CATEGORY_STYLES[label].color }}
                    >
                      {label}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] tabular-nums">
                      {typeof value === 'number' ? `${value}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--text-tertiary)] text-center mt-3">
        Ceilings above 12,000 ft and visibility above 10 sm are shown at the top of the scale
      </p>
    </div>
  );
}
