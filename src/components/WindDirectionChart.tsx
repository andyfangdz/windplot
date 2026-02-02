'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { WindDataPoint } from '@/lib/types';
import { Runway } from '@/app/actions';

interface WindDirectionChartProps {
  observations: WindDataPoint[];
  runways: Runway[];
}

interface TooltipData {
  x: number;
  y: number;
  time: string;
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  isGust: boolean;
}

const RUNWAY_COLORS = ['#ffcc00', '#00ff88', '#ff6b6b', '#a78bfa'];

export default function WindDirectionChart({
  observations,
  runways,
}: WindDirectionChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const pointsRef = useRef<{ x: number; y: number; data: WindDataPoint; isGust: boolean }[]>([]);

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
    observations.forEach((d) => {
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
      ctx.fillStyle = '#1d9bf0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        d.label,
        centerX + labelR * Math.cos(rad),
        centerY + labelR * Math.sin(rad)
      );
    });

    // Draw runway lines
    runways.forEach((rw, i) => {
      const color = RUNWAY_COLORS[i % RUNWAY_COLORS.length];
      const hdgRad = ((rw.trueHdg - 90) * Math.PI) / 180;
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
        rw.high,
        centerX + labelOffset * Math.cos(hdgRad),
        centerY + labelOffset * Math.sin(hdgRad)
      );
      ctx.fillText(
        rw.low,
        centerX + labelOffset * Math.cos(oppRad),
        centerY + labelOffset * Math.sin(oppRad)
      );
      ctx.restore();
    });

    // Plot wind observations and track points for tooltips
    const points: { x: number; y: number; data: WindDataPoint; isGust: boolean }[] = [];
    
    observations.forEach((d) => {
      if (d.wdir === null) return;
      const rad = ((d.wdir - 90) * Math.PI) / 180;

      // Plot sustained wind
      if (d.wspd) {
        const r = (d.wspd / scaleMax) * maxRadius;
        const x = centerX + r * Math.cos(rad);
        const y = centerY + r * Math.sin(rad);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(29, 155, 240, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#1d9bf0';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        points.push({ x, y, data: d, isGust: false });
      }

      // Plot gust
      if (d.wgst) {
        const r = (d.wgst / scaleMax) * maxRadius;
        const x = centerX + r * Math.cos(rad);
        const y = centerY + r * Math.sin(rad);
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(249, 24, 128, 0.7)';
        ctx.fill();
        ctx.strokeStyle = '#f91880';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        points.push({ x, y, data: d, isGust: true });
      }
    });
    
    pointsRef.current = points;
  }, [observations, runways]);

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
        isGust: closest.isGust,
      });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

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
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  // Format direction as cardinal
  const formatDirection = (deg: number | null) => {
    if (deg === null) return '—';
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
  };

  return (
    <div className="chart-section">
      <div className="chart-title">🧭 Wind Direction & Speed</div>
      <div className="h-[280px] relative">
        <canvas ref={canvasRef} className="w-full h-full" />
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg text-sm"
            style={{
              left: Math.min(tooltip.x + 12, 280),
              top: tooltip.y - 60,
              backgroundColor: 'rgba(25, 39, 52, 0.95)',
              border: '1px solid #38444d',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <div className="font-semibold text-white mb-1">{tooltip.time}</div>
            <div className="text-[#8899a6] text-xs space-y-0.5">
              <div>Direction: {tooltip.wdir}° ({formatDirection(tooltip.wdir)})</div>
              {tooltip.wspd && <div>Wind: {tooltip.wspd} kt</div>}
              {tooltip.wgst && <div className="text-[#f91880]">Gust: {tooltip.wgst} kt</div>}
            </div>
          </div>
        )}
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
      {runways.length > 0 && (
        <div className="runway-legend">
          {runways.map((rw, i) => (
            <span
              key={`${rw.low}/${rw.high}`}
              className="runway-tag"
              style={{ borderLeftColor: RUNWAY_COLORS[i % RUNWAY_COLORS.length] }}
            >
              {rw.low}/{rw.high}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
