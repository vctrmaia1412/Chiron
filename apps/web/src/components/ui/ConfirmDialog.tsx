"use client";

import { useEffect } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, description, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="text-xl font-semibold text-slate-900">{title}</div>
        <div className="mt-2 text-sm text-slate-600">{description}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">Cancelar</button>
          <button type="button" onClick={onConfirm} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white">Confirmar</button>
        </div>
      </div>
    </div>
  );
}
