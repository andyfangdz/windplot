'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { ForecastDataPoint } from '@/lib/types';
import { Runway } from '@/app/actions';

interface ForecastDirectionChartProps {
  forecasts: ForecastDataPoint[];
  runways: Runway[];
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
}

interface TooltipData {
  x: number;
  y: number;
  time: string;
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  temp: number | null | undefined;
  pop: number | null | undefined;
  isGust: boolean;
}

const RUNWAY_COLORS = ['#ffcc00', '#00ff88', '#ff6b6b', '#a78bfa'];

// Represents a group of parallel runways (or a single runway)
interface RunwayGroup {
  trueHdg: number;
  highLabel: string; // e.g., "22L/R" or "22"
  lowLabel: string;  // e.g., "04L/R" or "04"
  legendLabel: string; // e.g., "04L/R/22L/R" or "04/22"
}

// Group parallel runways and create combined labels
function groupRunways(runways: Runway[]): RunwayGroup[] {
  // Group runways by heading (within 1 degree tolerance)
  const groups: { hdg: number; runways: Runway[] }[] = [];

  runways.forEach((rw) => {
    const normalizedHdg = Math.round(rw.trueHdg);
    const existingGroup = groups.find((g) => Math.abs(g.hdg - normalizedHdg) <= 1);
    if (existingGroup) {
      existingGroup.runways.push(rw);
    } else {
      groups.push({ hdg: normalizedHdg, runways: [rw] });
    }
  });

  // Convert groups to RunwayGroup with combined labels
  return groups.map((group) => {
    const rwList = group.runways;
    // Use the average heading for the group
    const avgHdg = rwList.reduce((sum, rw) => sum + rw.trueHdg, 0) / rwList.length;

    if (rwList.length === 1) {
      // Single runway - use original labels
      const rw = rwList[0];
      return {
        trueHdg: avgHdg,
        highLabel: rw.high,
        lowLabel: rw.low,
        legendLabel: `${rw.low}/${rw.high}`,
      };
    }

    // Multiple parallel runways - extract numbers and unique suffixes
    const highNum = rwList[0].high.replace(/[LRC]$/, '');
    const lowNum = rwList[0].low.replace(/[LRC]$/, '');

    // Get unique suffixes, sorted L/C/R
    const suffixes = [...new Set(rwList.map((rw) => rw.high.replace(/^\d+/, '')))]
      .sort((a, b) => {
        const order: Record<string, number> = { L: 0, C: 1, R: 2 };
        return (order[a] ?? 3) - (order[b] ?? 3);
      });
    const suffixStr = suffixes.join('/');

    return {
      trueHdg: avgHdg,
      highLabel: `${highNum}${suffixStr}`,
      lowLabel: `${lowNum}${suffixStr}`,
      legendLabel: `${lowNum}/${highNum} ${suffixStr}`,
    };
  });
}

export default function ForecastDirectionChart({
  forecasts,
  runways,
  selectedIdx,
  onSelectIdx,
}: ForecastDirectionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const pointsRef = useRef<{ x: number; y: number; data: ForecastDataPoint; isGust: boolean; idx: number }[]>([]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 35;

    // Find max speed for scaling
    let maxSpeed = 0;
    forecasts.forEach((d) => {
      if (d.wspd && d.wspd > maxSpeed) maxSpeed = d.wspd;
      if (d.wgst && d.wgst > maxSpeed) maxSpeed = d.wgst;
    });
    const scaleMax = Math.ceil(maxSpeed / 5) * 5 || 25;

    ctx.clearRect(0, 0, width, height);

    // Draw speed rings
    const ringSteps = [5, 10, 15, 20, 25, 30].filter((s) => s <= scaleMax);
    ringSteps.forEach((speed) => {
      const r = (speed / scaleMax) * maxRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Speed label
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#8899a6';
      ctx.textAlign = 'center';
      ctx.fillText(`${speed}kt`, centerX, centerY - r - 4);
    });

    // Draw direction lines and labels
    const directions = [
      { label: 'N', angle: 0 },
      { label: 'NE', angle: 45 },
      { label: 'E', angle: 90 },
      { label: 'SE', angle: 135 },
      { label: 'S', angle: 180 },
      { label: 'SW', angle: 225 },
      { label: 'W', angle: 270 },
      { label: 'NW', angle: 315 },
    ];

    directions.forEach((d) => {
      const rad = ((d.angle - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + maxRadius * Math.cos(rad), centerY + maxRadius * Math.sin(rad));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Label
      const labelR = maxRadius + 18;
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#10b981'; // Green for forecast
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        d.label,
        centerX + labelR * Math.cos(rad),
        centerY + labelR * Math.sin(rad)
      );
    });

    // Draw runway lines (grouped for parallel runways)
    const runwayGroups = groupRunways(runways);
    runwayGroups.forEach((group, i) => {
      const color = RUNWAY_COLORS[i % RUNWAY_COLORS.length];
      const hdgRad = ((group.trueHdg - 90) * Math.PI) / 180;
      const oppRad = hdgRad + Math.PI;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(
        centerX + maxRadius * Math.cos(hdgRad),
        centerY + maxRadius * Math.sin(hdgRad)
      );
      ctx.lineTo(
        centerX + maxRadius * Math.cos(oppRad),
        centerY + maxRadius * Math.sin(oppRad)
      );
      ctx.stroke();

      // Runway labels at approach ends
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      const labelOffset = maxRadius + 28;
      ctx.fillText(
        group.highLabel,
        centerX + labelOffset * Math.cos(hdgRad),
        centerY + labelOffset * Math.sin(hdgRad)
      );
      ctx.fillText(
        group.lowLabel,
        centerX + labelOffset * Math.cos(oppRad),
        centerY + labelOffset * Math.sin(oppRad)
      );
      ctx.restore();
    });

    // Plot forecast observations and track points for tooltips
    const points: { x: number; y: number; data: ForecastDataPoint; isGust: boolean; idx: number }[] = [];

    forecasts.forEach((d, idx) => {
      if (d.wdir === null) return;
      const rad = ((d.wdir - 90) * Math.PI) / 180;

      const isSelected = idx === selectedIdx;
      // Calculate opacity based on time (fade out further forecasts), but keep selected visible
      const opacity = isSelected ? 1 : Math.max(0.3, 1 - (idx / forecasts.length) * 0.7);

      // Plot sustained wind
      if (d.wspd) {
        const r = (d.wspd / scaleMax) * maxRadius;
        const x = centerX + r * Math.cos(rad);
        const y = centerY + r * Math.sin(rad);
        const dotRadius = isSelected ? 8 : 4;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
        } else {
          ctx.fillStyle = `rgba(16, 185, 129, ${opacity})`; // Green for forecast
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        points.push({ x, y, data: d, isGust: false, idx });
      }

      // Plot gust
      if (d.wgst) {
        const r = (d.wgst / scaleMax) * maxRadius;
        const x = centerX + r * Math.cos(rad);
        const y = centerY + r * Math.sin(rad);
        const dotRadius = isSelected ? 8 : 4;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
        } else {
          ctx.fillStyle = `rgba(245, 158, 11, ${opacity})`; // Amber for forecast gusts
          ctx.fill();
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();
        points.push({ x, y, data: d, isGust: true, idx });
      }
    });

    pointsRef.current = points;
  }, [forecasts, runways, selectedIdx]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hitRadius = 12;

    // Find closest point
    let closest: typeof pointsRef.current[0] | null = null;
    let minDist = hitRadius;

    for (const point of pointsRef.current) {
      const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = point;
      }
    }

    if (closest) {
      setTooltip({
        x: closest.x,
        y: closest.y,
        time: closest.data.time,
        wdir: closest.data.wdir,
        wspd: closest.data.wspd,
        wgst: closest.data.wgst,
        temp: closest.data.temp,
        pop: closest.data.pop,
        isGust: closest.isGust,
      });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  const handleClick = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hitRadius = 15;

    // Find closest point
    let closest: typeof pointsRef.current[0] | null = null;
    let minDist = hitRadius;

    for (const point of pointsRef.current) {
      const dist = Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = point;
      }
    }

    if (closest) {
      onSelectIdx(closest.idx);
    }
  }, [onSelectIdx]);

  useEffect(() => {
    drawChart();
    window.addEventListener('resize', drawChart);
    return () => window.removeEventListener('resize', drawChart);
  }, [drawChart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('click', handleClick);
    };
  }, [handleMouseMove, handleMouseLeave, handleClick]);

  // Format direction as cardinal
  const formatDirection = (deg: number | null) => {
    if (deg === null) return '—';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  };

  // Get grouped runways for legend
  const runwayGroups = groupRunways(runways);

  return (
    <div className="chart-section h-full">
      <div className="chart-title">Forecast Wind Direction</div>
      <div className="h-[280px] relative">
        <canvas ref={canvasRef} className="w-full h-full cursor-pointer" />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-3 py-2.5 rounded-lg text-sm"
            style={{
              left: Math.min(tooltip.x + 12, 280),
              top: tooltip.y - 60,
              backgroundColor: 'rgba(17, 26, 36, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="font-semibold text-white mb-1">{tooltip.time}</div>
            <div className="text-[var(--text-secondary)] text-xs space-y-0.5">
              <div>Direction: {tooltip.wdir}&deg; ({formatDirection(tooltip.wdir)})</div>
              {tooltip.wspd && <div>Wind: {tooltip.wspd} kt</div>}
              {tooltip.wgst && <div className="text-[#f59e0b]">Gust: {tooltip.wgst} kt</div>}
              {tooltip.temp !== null && tooltip.temp !== undefined && (
                <div>Temp: {tooltip.temp}&deg;F</div>
              )}
              {tooltip.pop !== null && tooltip.pop !== undefined && tooltip.pop > 0 && (
                <div>Precip: {tooltip.pop}%</div>
              )}
            </div>
          </div>
        )}
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
      {runwayGroups.length > 0 && (
        <div className="runway-legend">
          {runwayGroups.map((group, i) => (
            <span
              key={group.legendLabel}
              className="runway-tag"
              style={{ borderLeftColor: RUNWAY_COLORS[i % RUNWAY_COLORS.length] }}
            >
              {group.legendLabel}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
