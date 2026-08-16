type StatusBadgeProps = {
  label: string;
  tone?: "success" | "warning" | "info" | "default";
};

const toneClasses = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  info: "bg-blue-50 text-blue-700 ring-blue-100",
  default: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StatusBadge({ label, tone = "default" }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}
