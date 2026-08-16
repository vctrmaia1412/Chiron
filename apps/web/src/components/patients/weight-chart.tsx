'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatWeight } from '@/lib/format';

interface WeightPoint {
  id: string;
  measuredAt: string;
  weightKg: string;
}

/**
 * Curva de peso em SVG puro. Sem biblioteca de gráfico: são poucos pontos e
 * o que importa é a tendência, legível também em 320 px.
 */
export function WeightChart({ patientId }: { patientId: string }) {
  const { data } = useQuery({
    queryKey: ['patient-weights', patientId],
    queryFn: () => api.get<{ items: WeightPoint[] }>(`/patients/${patientId}/weights`),
    select: (result) =>
      [...result.items]
        .map((item) => ({ ...item, value: Number(item.weightKg) }))
        .filter((item) => Number.isFinite(item.value) && item.value > 0)
        .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()),
  });

  const points = data ?? [];
  if (points.length < 2) return null;

  const width = 280;
  const height = 64;
  const padding = 4;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || max * 0.1 || 1;

  const coords = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / span) * (height - padding * 2);
    return { x, y, point };
  });

  const path = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ');
  const area = `${path} L${coords[coords.length - 1]!.x.toFixed(1)},${height} L${coords[0]!.x.toFixed(1)},${height} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last.value - first.value;
  const deltaPercent = (delta / first.value) * 100;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolução de peso: ${formatWeight(first.value)} em ${formatDate(first.measuredAt)} para ${formatWeight(last.value)} em ${formatDate(last.measuredAt)}`}
      >
        <path d={area} fill="var(--brand-soft)" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((coord) => (
          <circle key={coord.point.id} cx={coord.x} cy={coord.y} r="2" fill="var(--brand)" />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[12px] text-[var(--ink-3)]">
        <span>{formatDate(first.measuredAt)}</span>
        <span
          className={
            Math.abs(deltaPercent) < 3
              ? 'text-[var(--ink-3)]'
              : delta > 0
                ? 'text-[var(--warning)]'
                : 'text-[var(--info)]'
          }
        >
          {delta > 0 ? '+' : ''}
          {formatWeight(Math.abs(delta))} ({deltaPercent > 0 ? '+' : ''}
          {deltaPercent.toFixed(1)}%)
        </span>
        <span>{formatDate(last.measuredAt)}</span>
      </div>
    </div>
  );
}
