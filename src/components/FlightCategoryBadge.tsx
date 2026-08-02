'use client';

import { FlightCategory, FLIGHT_CATEGORY_STYLES } from '@/lib/weather';

interface FlightCategoryBadgeProps {
  category: FlightCategory | null;
  size?: 'sm' | 'md';
}

export default function FlightCategoryBadge({
  category,
  size = 'md',
}: FlightCategoryBadgeProps) {
  if (!category) {
    return (
      <span className="text-xs text-[var(--text-tertiary)] font-mono">—</span>
    );
  }

  const { color, description } = FLIGHT_CATEGORY_STYLES[category];
  const sizeClasses =
    size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      title={description}
      className={`inline-flex items-center gap-1.5 rounded-full font-bold tracking-wide ${sizeClasses}`}
      style={{
        color,
        backgroundColor: `${color}1f`,
        border: `1px solid ${color}59`,
      }}
    >
      <span
        className="rounded-full"
        style={{
          backgroundColor: color,
          width: size === 'sm' ? 5 : 6,
          height: size === 'sm' ? 5 : 6,
        }}
      />
      {category}
    </span>
  );
}
