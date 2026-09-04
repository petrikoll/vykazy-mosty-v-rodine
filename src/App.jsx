import React, { useEffect, useState } from "react";
import { BookOpenCheck, BriefcaseBusiness, CalendarDays, ClipboardList, GraduationCap, KeyRound, LayoutDashboard, LogOut, Settings2, ShieldCheck, X } from "lucide-react";
import { api, jsonBody, getToken, setToken } from "./api.mjs";
import { Button, Card, Field, Input, Select, useTimedNotice } from "./components/Common.jsx";
import Education from "./components/Education.jsx";
import Settings from "./components/Settings.jsx";
import ManagerEducation from "./components/ManagerEducation.jsx";
import ManagerReports from "./components/ManagerReports.jsx";
import Meetings from "./components/Meetings.jsx";
import Supervisions from "./components/Supervisions.jsx";
import WorkReports from "./components/WorkReports.jsx";
import PortalDashboard from "./components/PortalDashboard.jsx";

const NAV_GROUPS = [
  { label: "Přehled", items: [{ id: "dashboard", label: "Přehled úkolů", icon: LayoutDashboard }] },
  { label: "Projekt", items: [{ id: "reports", label: "Výkazy práce", icon: ClipboardList }] },
  { label: "Lidé a rozvoj", items: [
    { id: "education", label: "Vzdělávání", icon: GraduationCap },
    { id: "supervisions", label: "Supervize", icon: ShieldCheck },
  ] },
  { label: "Spolupráce", items: [{ id: "meetings", label: "Porady", icon: BookOpenCheck }] },
];

function AuthScreen({ setup, setupCodeRequired, options, onAuthenticated }) {
  const [form, setForm] = useState({ name: "", employeeId: options[0]?.id || "", pin: "", globalFte: 0.2, setupCode: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!form.employeeId && options[0]?.id) setForm((value) => ({ ...value, employeeId: options[0].id })); }, [options, form.employeeId]);

  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = setup
        ? await api("/api/setup/bootstrap", { method: "POST", body: jsonBody({ name: form.name, globalFte: Number(form.globalFte), setupCode: form.setupCode }) })
        : await api("/api/auth/login", { method: "POST", body: jsonBody({ employeeId: form.employeeId, pin: form.pin }) });
      setToken(result.token); await onAuthenticated();
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  };

  return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
    <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
      <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-blue-800 p-3 text-white"><BriefcaseBusiness size={28}/></div><div><h1 className="text-xl font-bold text-slate-900">Mosty v rodině</h1><p className="text-sm text-slate-500">Personální a projektový portál</p></div></div>
      <h2 className="text-lg font-bold">{setup ? "První nastavení" : "Přihlášení"}</h2>
      <p className="mb-5 mt-1 text-sm text-slate-500">{setup ? "Založte první osobní účet Odborného garanta. Dočasný PIN bude 0000." : "Vyberte své jméno a zadejte osobní PIN. Projektová pozice se při přihlášení nevybírá."}</p>
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      <form className="space-y-4" onSubmit={submit}>
        {setup ? <><Field label="Jméno Odborného garanta"><Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/></Field><Field label="Celkový úvazek u zaměstnavatele"><Input type="number" min="0" step="0.01" value={form.globalFte} onChange={(e) => setForm((f) => ({ ...f, globalFte: e.target.value }))}/></Field>{setupCodeRequired && <Field label="Instalační kód" hint="Tajný kód nastavený při nasazení aplikace"><Input required type="password" value={form.setupCode} onChange={(e) => setForm((f) => ({ ...f, setupCode: e.target.value }))}/></Field>}</> : <><Field label="Jméno pracovníka"><Select required value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label="PIN" hint="Výchozí PIN je 0000"><Input required type="password" inputMode="numeric" pattern="[0-9]{4,10}" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}/></Field></>}
        <Button className="w-full py-3" disabled={busy}>{busy ? "Ověřuji…" : setup ? "Založit portál" : "Přihlásit"}</Button>
      </form>
    </main>
  </div>;
}

function ChangePinDialog({ onClose, onChanged }) {
  const [form, setForm] = useState({ currentPin: "", newPin: "", confirmation: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (form.newPin !== form.confirmation) {
      setError("Nový PIN a jeho potvrzení se neshodují.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/change-pin", { method: "POST", body: jsonBody({ currentPin: form.currentPin, newPin: form.newPin }) });
      await onChanged();
      onClose();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="change-pin-title">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="change-pin-title" className="text-lg font-bold">Změnit osobní PIN</h2><p className="mt-1 text-sm text-slate-500">PIN má 4 až 10 číslic a patří vašemu osobnímu účtu bez ohledu na počet pozic.</p></div><button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" type="button" onClick={onClose} aria-label="Zavřít"><X size={20}/></button></div>
      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Současný PIN"><Input required type="password" inputMode="numeric" pattern="[0-9]{4,10}" autoComplete="current-password" value={form.currentPin} onChange={(e) => setForm((value) => ({ ...value, currentPin: e.target.value }))}/></Field>
        <Field label="Nový PIN"><Input required type="password" inputMode="numeric" pattern="[0-9]{4,10}" autoComplete="new-password" value={form.newPin} onChange={(e) => setForm((value) => ({ ...value, newPin: e.target.value }))}/></Field>
        <Field label="Nový PIN znovu"><Input required type="password" inputMode="numeric" pattern="[0-9]{4,10}" autoComplete="new-password" value={form.confirmation} onChange={(e) => setForm((value) => ({ ...value, confirmation: e.target.value }))}/></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Zavřít</Button><Button disabled={busy}>{busy ? "Ukládám…" : "Změnit PIN"}</Button></div>
      </form>
    </div>
  </div>;
}

export default function App() {
  const [driveNotice] = useTimedNotice(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("googleDrive") === "connected") return { type: "success", text: "Google Drive byl připojen a archivní složka byla vytvořena." };
    if (params.get("googleDrive") === "error") return { type: "error", text: params.get("reason") || "Google Drive se nepodařilo připojit." };
    return null;
  });
  const [setup, setSetup] = useState(false);
  const [setupCodeRequired, setSetupCodeRequired] = useState(false);
  const [options, setOptions] = useState([]);
  const [config, setConfig] = useState(null);
  const [portal, setPortal] = useState(null);
  const [active, setActive] = useState(() => new URLSearchParams(window.location.search).has("googleDrive") ? "settings" : "dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showPinChange, setShowPinChange] = useState(false);

  const refresh = async () => {
    try {
      const data = await api("/api/portal"); setPortal(data); setError("");
    } catch (requestError) {
      if (requestError.status === 401) { setToken(""); setPortal(null); }
      else setError(requestError.message);
    }
  };

  const boot = async () => {
    setLoading(true);
    try {
      const [setupStatus, projectConfig, loginOptions] = await Promise.all([
        api("/api/setup/status"), api("/api/config"), api("/api/auth/options"),
      ]);
      setSetup(setupStatus.needsSetup); setSetupCodeRequired(Boolean(setupStatus.setupCodeRequired)); setConfig(projectConfig); setOptions(loginOptions);
      if (getToken() && !setupStatus.needsSetup) await refresh();
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    boot();
    if (new URLSearchParams(window.location.search).has("googleDrive")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* Session may already be gone. */ }
    setToken(""); setPortal(null); setActive("dashboard"); await boot();
  };

  if (loading || !config) return <div className="flex min-h-screen items-center justify-center bg-slate-100 font-semibold text-slate-600">Načítám portál…</div>;
  if (!portal) return <AuthScreen setup={setup} setupCodeRequired={setupCodeRequired} options={options} onAuthenticated={async () => { await refresh(); setSetup(false); }} />;

  const employee = portal.employee;
  const navGroups = employee.appRole === "director"
    ? [...NAV_GROUPS, { label: "Správa", items: [{ id: "settings", label: "Pracovníci a nastavení", icon: Settings2 }] }]
    : NAV_GROUPS;
  const ownPlans = portal.educationPlans.filter((item) => item.employeeId === employee.id);
  const ownEducation = portal.educationRecords.filter((item) => item.employeeId === employee.id);
  const ownEvaluations = portal.employeeEvaluations.filter((item) => item.employeeId === employee.id);
  const ownReports = portal.workReports.filter((item) => item.employeeId === employee.id);

  const roleLabel = employee.appRole === "manager" ? "Odborný garant" : employee.appRole === "director" ? "Vedoucí služby/programu" : "Pracovník";
  const currentPeriod = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(new Date());

  return <div className="min-h-screen bg-slate-100 text-slate-900">
    {showPinChange && <ChangePinDialog onClose={() => setShowPinChange(false)} onChanged={refresh}/>}
    <div className="mx-auto min-h-screen max-w-[1440px] lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="bg-blue-950 px-3 py-3 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-3 lg:py-4">
        <div className="mb-2 flex items-center gap-3 px-2 lg:mb-5"><div className="rounded-xl bg-white/10 p-2.5"><BriefcaseBusiness size={24}/></div><div><h1 className="font-bold">Mosty v rodině</h1><p className="text-xs text-blue-200">Personální portál</p></div></div>
        <nav className="no-scrollbar flex flex-nowrap gap-1 overflow-x-auto pb-1 lg:block lg:overflow-visible lg:pb-0" aria-label="Hlavní nabídka">{navGroups.map((group) => <div key={group.label} className="contents lg:mb-4 lg:block">
          <div className="hidden px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-blue-300 lg:block">{group.label}</div>
          {group.items.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold transition lg:mb-1 lg:w-full ${active === item.id ? "bg-white text-blue-900" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}><Icon size={17}/><span>{item.label}</span></button>; })}
        </div>)}</nav>
        <div className="mt-auto hidden border-t border-white/15 px-2 pt-4 text-[11px] text-blue-200 lg:block">{config.project.regNumber}</div>
      </aside>
      <section className="min-w-0">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-blue-800 bg-blue-900 px-4 py-2 text-white shadow-md sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold capitalize text-blue-100"><CalendarDays size={16}/>{currentPeriod}</div>
          <div className="flex items-center gap-2"><div className="mr-1 hidden text-right sm:block"><div className="text-sm font-bold text-white">{employee.name}</div><div className="text-xs text-blue-200">{roleLabel}</div></div><Button variant="secondary" className="px-2.5" onClick={() => setShowPinChange(true)} aria-label="Změnit PIN"><KeyRound size={16}/><span className="ml-2 hidden md:inline">Změnit PIN</span></Button><Button variant="secondary" className="px-2.5" onClick={logout} aria-label="Odhlásit"><LogOut size={16}/><span className="ml-2 hidden md:inline">Odhlásit</span></Button></div>
        </header>
        <main className="p-3 sm:p-5">
        {driveNotice && <div className={`mb-4 rounded-lg border p-3 text-sm font-semibold ${driveNotice.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{driveNotice.text}</div>}
        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
        {employee.pinMustChange && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span><strong>Používáte dočasný PIN 0000.</strong> Nastavte si vlastní.</span><Button variant="secondary" className="min-h-8 py-1 text-xs" onClick={() => setShowPinChange(true)}><KeyRound size={14}/><span className="ml-1.5">Změnit PIN</span></Button></div>}
        {!portal.google.sheetsConfigured && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Google Sheet je připravený, ale aplikace zatím nemá servisní účet.</strong> Do jeho doplnění se záznamy bezpečně ukládají do místní databáze.</div>}
        {active !== "dashboard" && portal.google.sheetsConfigured && !portal.google.driveConfigured && <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"><strong>Google Sheet je připojený.</strong> Google Drive se připojí jednou v Nastavení.</div>}
        {active === "dashboard" && <PortalDashboard portal={portal} positions={config.positions} project={config.project} onNavigate={setActive}/>}
        {active === "reports" && (["manager", "director"].includes(employee.appRole)
          ? <ManagerReports portal={portal} positions={config.positions} project={config.project} onRefresh={refresh}/>
          : <WorkReports employee={employee} positions={config.positions} project={config.project} reports={ownReports} onRefresh={refresh}/>)}
        {active === "education" && (["manager", "director"].includes(employee.appRole)
          ? <ManagerEducation portal={portal} positions={config.positions} project={config.project} onRefresh={refresh}/>
          : <Education employee={employee} actor={employee} employees={portal.employees} positions={config.positions} project={config.project} plans={ownPlans} records={ownEducation} evaluations={ownEvaluations} onRefresh={refresh} readOnly/>)}
        {active === "supervisions" && <Supervisions employee={employee} employees={portal.employees} records={portal.supervisions} onRefresh={refresh}/>}
        {active === "meetings" && <Meetings employee={employee} employees={portal.employees} meetings={portal.meetings} project={config.project} onRefresh={refresh}/>}
        {active === "settings" && employee.appRole === "director" && <Settings portal={portal} positions={config.positions} onRefresh={refresh}/>}
        </main>
      </section>
    </div>
  </div>;
}
