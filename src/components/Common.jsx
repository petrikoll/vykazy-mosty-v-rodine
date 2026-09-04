import React, { useEffect, useId, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { confirmUnsavedChanges } from "../unsavedChanges.jsx";

export function useTimedNotice(initialValue = null, delay = 3000) {
  const [notice, setNotice] = useState(initialValue);
  useEffect(() => {
    if (!notice || !["success", "ok", "info"].includes(notice.type)) return undefined;
    const currentNotice = notice;
    const timer = window.setTimeout(() => {
      setNotice((current) => current === currentNotice ? null : current);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [notice, delay]);
  return [notice, setNotice];
}

export const Notice = ({ notice, className = "" }) => {
  if (!notice) return null;
  const colors = notice.type === "error"
    ? "border-red-200 bg-red-50 text-red-700"
    : notice.type === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : notice.type === "info"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <div className={`rounded-lg border p-3 text-sm font-semibold ${colors} ${className}`} role={notice.type === "error" ? "alert" : "status"}>{notice.text}</div>;
};

export const Field = ({ label, children, hint }) => (
  <label className="block text-xs font-semibold text-slate-700">
    <span className="mb-1 block leading-4">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] font-normal leading-4 text-slate-500">{hint}</span>}
  </label>
);

export const Input = (props) => (
  <input {...props} className={`min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${props.className || ""}`} />
);

export const Textarea = ({ compact = false, className = "", ...props }) => (
  <textarea {...props} className={`${compact ? "min-h-10" : "min-h-20"} w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${className}`} />
);

export const Select = (props) => (
  <select {...props} className={`min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${props.className || ""}`} />
);

export const Button = ({ variant = "primary", compact = false, className = "", ...props }) => {
  const variants = {
    primary: "bg-blue-700 text-white hover:bg-blue-800",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
    header: "border border-white/20 bg-white/10 text-white hover:bg-white/20",
  };
  const sizing = compact ? "min-h-8 px-2.5 py-1 text-xs" : "min-h-9 px-3 py-1.5 text-sm";
  return <button {...props} className={`${sizing} rounded-md font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} />;
};

export function Card({ title, subtitle, actions, children, className = "", tone = "slate", collapsible = false, defaultOpen = false, plain = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const id = useId();
  const open = !collapsible || expanded;
  const tones = {
    slate: { border: "border-slate-300", header: "border-slate-200 bg-slate-100/80" },
    blue: { border: "border-blue-300", header: "border-blue-200 bg-blue-50" },
    green: { border: "border-emerald-300", header: "border-emerald-200 bg-emerald-50" },
  };
  const colors = tones[tone] || tones.slate;
  if (plain) return <>{children}</>;
  return <section aria-labelledby={title ? `${id}-title` : undefined} className={`min-w-0 rounded-xl border bg-white shadow-sm ${colors.border} ${className}`}>
    {(title || actions) && <div className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${open ? "rounded-t-xl border-b" : "rounded-xl"} ${colors.header}`}>
      <div className="min-w-0 flex-1">
        {title && <h2 id={`${id}-title`} className="text-sm font-bold text-slate-900 sm:text-base">
          {collapsible ? <button type="button" className="flex min-h-8 w-full items-center gap-2 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setExpanded((value) => !value)}>
            <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}/>
            <span>{title}</span>
            <span className="ml-auto shrink-0 text-xs font-semibold text-blue-700">{open ? "Skrýt" : "Rozbalit"}</span>
          </button> : title}
        </h2>}
        {subtitle && open && <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>}
    <div id={`${id}-body`} hidden={!open} className="p-3">{children}</div>
  </section>;
}

export const SectionTabs = ({ items, value, onChange, label }) => <div role="group" aria-label={label} className="flex gap-1 rounded-xl border border-slate-300 bg-blue-50 p-1 shadow-sm">
  {items.map((item) => <button key={item.value} type="button" aria-pressed={value === item.value} onClick={() => { if (item.value !== value && confirmUnsavedChanges()) onChange(item.value); }} className={`min-h-9 min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 sm:px-3 sm:text-sm ${value === item.value ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-blue-100"}`}>{item.label}</button>)}
</div>;

export const StatusBadge = ({ status }) => {
  const labels = {
    draft: "Koncept", submitted: "Předáno", ready_for_signature: "Připraveno k podpisu", returned: "Vráceno k opravě",
    approved: "Schváleno", printed: "Vytištěno", signed_archived: "Podepsáno a archivováno",
    closed: "Uzavřeno", missing_evaluation: "Nezahájeno",
    archived: "Archivováno", missing: "Nepředáno", missing_plan: "Plán nezaložen",
  };
  const colors = {
    draft: "bg-slate-100 text-slate-700", submitted: "bg-amber-100 text-amber-800", ready_for_signature: "bg-blue-100 text-blue-800",
    returned: "bg-red-100 text-red-700", approved: "bg-emerald-100 text-emerald-700",
    closed: "bg-emerald-100 text-emerald-700", missing_evaluation: "bg-slate-100 text-slate-600",
    printed: "bg-blue-100 text-blue-700", signed_archived: "bg-violet-100 text-violet-700",
    archived: "bg-violet-100 text-violet-700", missing: "bg-slate-100 text-slate-600",
    missing_plan: "bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${colors[status] || colors.draft}`}>{labels[status] || status}</span>;
};

export const Empty = ({ children }) => <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{children}</p>;

export function Modal({ title, subtitle, onClose, children, className = "max-w-6xl" }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => { if (event.key === "Escape" && confirmUnsavedChanges()) onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={title} onMouseDown={() => { if (confirmUnsavedChanges()) onClose(); }}>
    <div className={`flex max-h-[calc(100vh-1.5rem)] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl sm:max-h-[calc(100vh-2.5rem)] ${className}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3">
        <div><h2 className="text-lg font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}</div>
        <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => { if (confirmUnsavedChanges()) onClose(); }} aria-label="Zavřít"><X size={20}/></button>
      </div>
      <div className="overflow-y-auto p-3 sm:p-4">{children}</div>
    </div>
  </div>;
}
