'use client';

interface StatTileProps {
  label: string;
  value: string;
  sub?: string | null;
  title?: string;
  accent?: string;
}

// Compact labelled value used by the conditions panels
export default function StatTile({ label, value, sub, title, accent }: StatTileProps) {
  return (
    <div
      className="bg-[var(--bg-tertiary)]/60 border border-[var(--border-color)] rounded-lg px-3 py-2"
      title={title}
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] font-medium">
        {label}
      </div>
      <div
        className="font-mono text-sm tabular-nums mt-0.5"
        style={{ color: accent ?? 'var(--text-primary)' }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[var(--text-tertiary)] tabular-nums">{sub}</div>
      )}
    </div>
  );
}
