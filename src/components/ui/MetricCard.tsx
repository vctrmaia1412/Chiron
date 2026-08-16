import Link from "next/link";

type MetricCardProps = {
  value: string;
  label: string;
  tone?: "emerald" | "slate" | "amber" | "blue";
  href?: string;
};

const toneClasses = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
};

export function MetricCard({ value, label, tone = "emerald", href }: MetricCardProps) {
  const trendGlyph = tone === "amber" ? "↗" : tone === "blue" ? "•" : tone === "slate" ? "–" : "↗";

  const content = (
    <div className="h-full rounded-2xl border border-slate-200 bg-white p-3 transition-colors duration-200 hover:border-emerald-200 hover:bg-emerald-50/30 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ring-1 sm:h-9 sm:w-9 ${toneClasses[tone]}`}>
          <span className="text-[11px] font-semibold sm:text-xs">{trendGlyph}</span>
        </span>
        {href ? <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400">Ver</span> : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{value}</div>
      <div className="mt-1 text-[11px] font-medium text-slate-600 sm:text-sm">{label}</div>
    </div>
  );

  if (!href) return content;

  return <Link href={href}>{content}</Link>;
}
