'use client';

import { CloudLayer } from '@/lib/types';
import {
  cloudCoverLabel,
  cloudCoverOktas,
  formatCloudLayer,
  isCeilingLayer,
} from '@/lib/weather';

interface SkyDiagramProps {
  clouds: CloudLayer[];
  // Feet AGL of an indefinite ceiling (vertical visibility), if reported
  vertVis?: number | null;
  // Label shown when there are no layers to draw
  clearLabel?: string;
  height?: number;
}

// Compress the vertical axis so low layers — the ones that matter for
// approaches — get more room than high cirrus.
function altitudeToOffset(altitudeFt: number, ceilingFt: number): number {
  const ratio = Math.min(1, Math.max(0, altitudeFt / ceilingFt));
  return Math.sqrt(ratio);
}

// Number of slots a layer band is divided into; filling `oktas / 8` of them
// spreads the gaps evenly so coverage reads at a glance.
const BAND_SLOTS = 16;

function bandSlots(oktas: number): boolean[] {
  const filled = Math.round((oktas / 8) * BAND_SLOTS);
  return Array.from(
    { length: BAND_SLOTS },
    (_, i) =>
      Math.floor(((i + 1) * filled) / BAND_SLOTS) > Math.floor((i * filled) / BAND_SLOTS)
  );
}

export default function SkyDiagram({
  clouds,
  vertVis = null,
  clearLabel = 'Sky clear',
  height = 176,
}: SkyDiagramProps) {
  const layers = clouds
    .filter((layer) => typeof layer.base === 'number')
    .sort((a, b) => (a.base ?? 0) - (b.base ?? 0));

  const highestBase = layers.length ? (layers[layers.length - 1].base ?? 0) : 0;
  // Round the top of the scale up so the highest layer never touches the edge
  const scaleTop = Math.max(3000, Math.ceil((highestBase * 1.25) / 1000) * 1000);

  // Gridlines at meaningful decision altitudes
  const gridAltitudes = [1000, 3000, 10000].filter((alt) => alt < scaleTop);

  return (
    <div
      className="relative w-full rounded-lg overflow-hidden border border-[var(--border-color)]"
      style={{
        height,
        background: 'linear-gradient(to bottom, #0b1b2b 0%, #12293d 60%, #16344a 100%)',
      }}
    >
      {/* Altitude gridlines */}
      {gridAltitudes.map((alt) => {
        const bottom = altitudeToOffset(alt, scaleTop) * 100;
        return (
          <div
            key={alt}
            className="absolute left-0 right-0 border-t border-dashed border-white/10"
            style={{ bottom: `${bottom}%` }}
          >
            <span className="absolute left-1 bottom-[1px] text-[9px] text-[var(--text-tertiary)] tabular-nums">
              {alt >= 1000 ? `${alt / 1000}k` : alt}
            </span>
          </div>
        );
      })}

      {/* Vertical visibility (indefinite ceiling) shown as a hazy block */}
      {typeof vertVis === 'number' && (
        <div
          className="absolute left-0 right-0 bottom-0 bg-purple-400/20"
          style={{ height: `${altitudeToOffset(vertVis, scaleTop) * 100}%` }}
        >
          <span className="absolute left-2 top-1 text-[10px] font-mono text-purple-200">
            VV {vertVis.toLocaleString()} ft
          </span>
        </div>
      )}

      {/* Cloud layers */}
      {layers.map((layer, idx) => {
        const base = layer.base ?? 0;
        const bottom = altitudeToOffset(base, scaleTop) * 100;
        const oktas = cloudCoverOktas(layer.cover);
        const ceiling = isCeilingLayer(layer.cover);
        return (
          <div
            key={`${layer.cover}-${base}-${idx}`}
            className="absolute left-0 right-0 flex items-center"
            style={{ bottom: `${bottom}%`, height: 14, marginBottom: -7 }}
            title={`${cloudCoverLabel(layer.cover)} at ${base.toLocaleString()} ft AGL`}
          >
            {/* Gaps between the puffs are the uncovered sky */}
            <div className="flex-1 flex gap-[2px] pl-8 items-center">
              {bandSlots(oktas).map((isFilled, slot) => (
                <div
                  key={slot}
                  className="flex-1 rounded-full"
                  style={{
                    height: ceiling ? 7 : 5,
                    backgroundColor: isFilled
                      ? ceiling
                        ? 'rgba(226, 232, 240, 0.72)'
                        : 'rgba(148, 176, 205, 0.5)'
                      : 'transparent',
                  }}
                />
              ))}
            </div>
            <span
              className={`ml-2 mr-1 font-mono text-[10px] tabular-nums whitespace-nowrap ${
                ceiling ? 'text-[var(--text-primary)] font-bold' : 'text-[var(--text-secondary)]'
              }`}
            >
              {formatCloudLayer(layer)}
            </span>
          </div>
        );
      })}

      {layers.length === 0 && typeof vertVis !== 'number' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-[var(--text-secondary)]">{clearLabel}</span>
        </div>
      )}

      {/* Ground */}
      <div className="absolute left-0 right-0 bottom-0 h-[6px] bg-[#1f3d2e] border-t border-emerald-500/40" />
    </div>
  );
}
