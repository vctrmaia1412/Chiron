import { CalendarClock, FileText, Syringe, Weight } from "lucide-react";
import { useApp } from "@/context/AppContext";

const tagIcons = {
  Consulta: CalendarClock,
  Exame: FileText,
  Vacina: Syringe,
  Peso: Weight,
  Receita: FileText,
  Documento: FileText,
  Atendimento: CalendarClock,
};

export function Timeline({ patientId }: { patientId?: string }) {
  const { timelines } = useApp();
  const events = patientId ? timelines.filter((event) => event.patientId === patientId) : timelines;

  return (
    <div className="relative border-l border-slate-200 pl-6">
      {events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Nenhum evento registrado.</div>
      ) : events.map((event) => {
        const Icon = tagIcons[event.tag] ?? CalendarClock;
        return (
          <div key={event.id} className="relative mb-8 last:mb-0">
            <div className="absolute -left-[29px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-4 border-white bg-emerald-500" />
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{event.date}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">{event.title}</div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  <Icon className="h-3.5 w-3.5" />
                  {event.tag}
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{event.detail}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                <span>{event.doctor}</span>
                {event.anexos ? <span>{event.anexos} anexos</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
