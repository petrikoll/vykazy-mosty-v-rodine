import React, { useMemo, useState } from "react";
import { confirmUnsavedChanges, useGuardedState } from "../unsavedChanges.jsx";
import { ExternalLink, HardDrive, Link2, Pencil, Save, Settings as SettingsIcon, Trash2, Unplug, Users, X } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { Button, Card, Field, Input, Notice, Select, useTimedNotice } from "./Common.jsx";

const roleLabel = (role) => role === "manager"
  ? "Odborný garant"
  : role === "director"
    ? "Vedoucí služby/programu"
    : role === "project_manager"
      ? "Projektový manažer"
      : "Pracovník";

function PositionChoices({ positions, selectedIds, onToggle, lockedIds = [], hoursById = {}, onHoursChange, remainingHoursById = {} }) {
  if (!positions.length) return <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">Žádná volná pozice pro tento typ účtu.</p>;
  return <div className="grid gap-2 md:grid-cols-2">{positions.map((position) => {
    const selected = selectedIds.includes(position.id);
    const hourly = position.allocationType === "hours";
    const available = remainingHoursById[position.id] ?? position.monthlyHours;
    return <div key={position.id} className={`rounded-lg border p-2.5 text-sm ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
      <label className="flex cursor-pointer items-start gap-2">
        <input className="mt-0.5" type="checkbox" checked={selected} disabled={lockedIds.includes(position.id)} onChange={() => onToggle(position.id)}/>
        <span><strong>{position.name}</strong><span className="ml-2 text-slate-500">{hourly ? `${position.contractType} · max. ${position.monthlyHours} h/měsíc` : position.allocationType === "fte" ? `${position.fte} úv.` : "bez měsíčního výkazu"}</span></span>
      </label>
      {hourly && <div className="mt-2 flex flex-wrap items-center gap-2 pl-6"><span className="whitespace-nowrap text-xs text-slate-600">Přiřadit</span><div className="w-24"><Input aria-label={`Hodiny měsíčně pro ${position.name}`} type="number" min="0.01" max={available} step="0.01" value={selected ? (hoursById[position.id] ?? "") : ""} disabled={!selected} onChange={(event) => onHoursChange(position.id, event.target.value)}/></div><span className="text-xs text-slate-600">h/měsíc · zde max. {available} h</span></div>}
    </div>;
  })}</div>;
}

export default function Settings({ portal, positions, onRefresh }) {
  const [employeeForm, setEmployeeForm, resetEmployeeForm] = useGuardedState({ name: "", globalFte: 1, appRole: "worker", positionIds: [], positionHours: {} });
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName, resetEditName] = useGuardedState("");
  const [editPositionIds, setEditPositionIds, resetEditPositionIds] = useGuardedState([]);
  const [editPositionHours, setEditPositionHours, resetEditPositionHours] = useGuardedState({});
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const assignablePositions = useMemo(() => positions.filter((item) => item.active !== false && item.reportRequired), [positions]);
  const managedEmployees = portal.employees.filter((item) => item.id !== portal.employee.id
    && item.active !== false
    && item.appRole !== "director");
  const occupiedPositionIds = (excludedEmployeeId = "") => new Set(portal.employees
    .filter((item) => item.active !== false && item.id !== excludedEmployeeId)
    .flatMap((item) => (item.assignments || []).map((assignment) => assignment.positionId)));
  const hoursRemaining = (position, excludedEmployeeId = "") => {
    const assigned = portal.employees.filter((item) => item.active !== false && item.id !== excludedEmployeeId)
      .flatMap((item) => item.assignments || [])
      .filter((assignment) => assignment.positionId === position.id)
      .reduce((sum, assignment) => sum + Number(assignment.monthlyHours ?? position.monthlyHours ?? 0), 0);
    return Math.max(0, Math.round((Number(position.monthlyHours || 0) - assigned) * 100) / 100);
  };
  const positionsForRole = (appRole, excludedEmployeeId = "") => {
    if (appRole === "project_manager") return [];
    const occupied = occupiedPositionIds(excludedEmployeeId);
    return assignablePositions.filter((position) => position.id !== "service-manager"
      && (appRole === "manager" || position.id !== "expert-guarantor")
      && (position.allocationType === "hours" && ["DPP", "DPČ"].includes(position.contractType)
        ? hoursRemaining(position, excludedEmployeeId) > 0 || portal.employees.some((employee) => employee.id === excludedEmployeeId && (employee.assignments || []).some((assignment) => assignment.positionId === position.id))
        : !occupied.has(position.id)));
  };
  const managerPositionOccupied = occupiedPositionIds().has("expert-guarantor");

  const buildAssignments = (positionIds, hoursById, excludedEmployeeId = "") => positionIds.map((positionId) => {
    const position = assignablePositions.find((item) => item.id === positionId);
    if (!position) throw new Error("Vybraná projektová pozice již není dostupná.");
    if (position.allocationType !== "hours") return { positionId };
    const monthlyHours = Number(hoursById[positionId]);
    if (!Number.isFinite(monthlyHours) || monthlyHours <= 0 || monthlyHours > hoursRemaining(position, excludedEmployeeId) || Math.abs(monthlyHours * 100 - Math.round(monthlyHours * 100)) > 0.000001) {
      throw new Error(`U pozice „${position.name}“ nastavte nejvýše ${hoursRemaining(position, excludedEmployeeId)} h/měsíc (maximálně dvě desetinná místa).`);
    }
    return { positionId, monthlyHours };
  });

  const toggleNewPosition = (id) => setEmployeeForm((form) => {
    const selected = form.positionIds.includes(id);
    const position = assignablePositions.find((item) => item.id === id);
    return {
      ...form,
      positionIds: selected ? form.positionIds.filter((item) => item !== id) : [...form.positionIds, id],
      positionHours: !selected && position?.allocationType === "hours"
        ? { ...form.positionHours, [id]: form.positionHours[id] ?? hoursRemaining(position) }
        : form.positionHours,
    };
  });

  const addEmployee = async () => {
    setBusy(true); setNotice(null);
    try {
      await api("/api/employees", { method: "POST", body: jsonBody({
        name: employeeForm.name,
        globalFte: Number(employeeForm.globalFte),
        appRole: employeeForm.appRole,
        assignments: buildAssignments(employeeForm.positionIds, employeeForm.positionHours),
      }) });
      resetEmployeeForm({ name: "", globalFte: 1, appRole: "worker", positionIds: [], positionHours: {} });
      setNotice({ type: "success", text: `${roleLabel(employeeForm.appRole)} byl založen s dočasným PINem 1111.` });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const startEditing = (employee) => {
    if (!confirmUnsavedChanges()) return;
    setEditingId(employee.id);
    resetEditName(employee.name);
    resetEditPositionIds((employee.assignments || [])
      .filter((assignment) => positions.some((position) => position.id === assignment.positionId && position.reportRequired))
      .map((assignment) => assignment.positionId));
    resetEditPositionHours(Object.fromEntries((employee.assignments || [])
      .filter((assignment) => positions.some((position) => position.id === assignment.positionId && position.allocationType === "hours"))
      .map((assignment) => [assignment.positionId, assignment.monthlyHours ?? positions.find((position) => position.id === assignment.positionId)?.monthlyHours])));
    setNotice(null);
  };

  const toggleEditedPosition = (id) => {
    if (!editPositionIds.includes(id)) {
      const position = assignablePositions.find((item) => item.id === id);
      if (position?.allocationType === "hours") setEditPositionHours((current) => ({ ...current, [id]: current[id] ?? hoursRemaining(position, editingId) }));
    }
    setEditPositionIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const saveEmployee = async (employee) => {
    setBusy(true); setNotice(null);
    try {
      const currentAssignments = new Map((employee.assignments || []).map((assignment) => [assignment.positionId, assignment]));
      await api(`/api/employees/${employee.id}`, { method: "PATCH", body: jsonBody({
        name: editName.trim(),
        assignments: buildAssignments(editPositionIds, editPositionHours, employee.id)
          .map((assignment) => ({ ...(currentAssignments.get(assignment.positionId) || {}), ...assignment })),
      }) });
      setEditingId("");
      resetEditName("");
      resetEditPositionIds([]);
      resetEditPositionHours({});
      setNotice({ type: "success", text: `Údaje pracovníka ${editName.trim()} byly uloženy.` });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const deleteEmployee = async (employee) => {
    if (!window.confirm(`Opravdu odstranit pracovníka ${employee.name}? Přihlášení bude zrušeno a jeho pozice se uvolní. Pokud nemá žádné záznamy, bude smazán úplně.`)) return;
    setBusy(true); setNotice(null);
    try {
      const result = await api(`/api/employees/${employee.id}`, { method: "DELETE" });
      setEditingId(""); resetEditName(""); resetEditPositionIds([]); resetEditPositionHours({});
      setNotice({ type: "success", text: result.archived
        ? `Pracovník ${employee.name} byl odstraněn z aktivních účtů. Jeho dřívější evidence zůstala zachovaná.`
        : `Pracovník ${employee.name} byl úplně odstraněn.` });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const changeRole = (appRole) => setEmployeeForm((form) => ({
    ...form,
    appRole,
    positionIds: appRole === "project_manager"
      ? []
      : appRole === "manager"
      ? (managerPositionOccupied ? [] : ["expert-guarantor"])
      : form.positionIds.filter((positionId) => positionId !== "expert-guarantor"),
  }));

  const connectDrive = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api("/api/google-drive/connect", { method: "POST" });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setNotice({ type: "error", text: error.message });
      setBusy(false);
    }
  };

  const disconnectDrive = async () => {
    if (!window.confirm("Odpojit Google Drive? Již uložené soubory na Disku zůstanou zachované.")) return;
    setBusy(true); setNotice(null);
    try {
      await api("/api/google-drive/connect", { method: "DELETE" });
      setNotice({ type: "success", text: "Google Drive byl odpojen. Již uložené soubory zůstaly zachované." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  return <fieldset disabled={busy} className="min-w-0 space-y-3">
    <Notice notice={notice}/>

    <Card title="Seznam pracovníků a pozic" subtitle="Pozice lze kdykoli doplnit nebo odebrat. Přihlášení zůstává stále pod jedním jménem.">
      {!managedEmployees.length ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Zatím není založen žádný další pracovník.</p> : <div className="grid gap-2">
        {managedEmployees.map((employee) => <section key={employee.id} className={`rounded-lg border px-3 py-2.5 ${editingId === employee.id ? "border-blue-300 bg-blue-50/40" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0"><strong className="text-sm">{employee.name}</strong><div className="mt-0.5 text-xs text-slate-500">{[...new Set([roleLabel(employee.appRole), ...(employee.assignments || []).map((assignment) => {
              const position = positions.find((item) => item.id === assignment.positionId && item.reportRequired);
              return position ? `${position.name}${position.allocationType === "hours" ? ` (${assignment.monthlyHours ?? position.monthlyHours} h/měsíc)` : ""}` : "";
            })].filter(Boolean))].join(" · ")}</div></div>
            {editingId === employee.id
              ? <Button compact variant="secondary" disabled={busy} onClick={() => { if (!confirmUnsavedChanges()) return; setEditingId(""); resetEditName(""); resetEditPositionIds([]); resetEditPositionHours({}); }}><X className="mr-1 inline" size={16}/>Zrušit</Button>
              : <Button compact variant="secondary" disabled={busy} onClick={() => startEditing(employee)}><Pencil className="mr-1 inline" size={16}/>Upravit pracovníka</Button>}
          </div>
          {editingId === employee.id && <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="mb-3 max-w-md"><Field label="Jméno pracovníka"><Input value={editName} onChange={(event) => setEditName(event.target.value)}/></Field></div>
            <div className="mb-2 text-xs font-bold text-slate-700">Projektové pozice</div>
            <PositionChoices positions={positionsForRole(employee.appRole, employee.id)} selectedIds={editPositionIds} lockedIds={employee.appRole === "manager" ? ["expert-guarantor"] : []} onToggle={toggleEditedPosition} hoursById={editPositionHours} onHoursChange={(id, value) => setEditPositionHours((current) => ({ ...current, [id]: value }))} remainingHoursById={Object.fromEntries(assignablePositions.filter((position) => position.allocationType === "hours").map((position) => [position.id, hoursRemaining(position, employee.id)]))}/>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Button disabled={busy || !editName.trim() || (employee.appRole !== "project_manager" && !editPositionIds.length)} onClick={() => saveEmployee(employee)}><Save className="mr-1 inline" size={16}/>Uložit pracovníka</Button><Button variant="danger" disabled={busy} onClick={() => deleteEmployee(employee)}><Trash2 className="mr-1 inline" size={16}/>Smazat pracovníka</Button></div>
          </div>}
        </section>)}
      </div>}
    </Card>

    <Card title="Přidat pracovníka" tone="blue" collapsible subtitle="Založte osobní účet a přiřaďte projektové pozice." actions={<SettingsIcon size={22} className="text-blue-700"/>}>
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="Jméno pracovníka"><Input value={employeeForm.name} onChange={(event) => setEmployeeForm((form) => ({ ...form, name: event.target.value }))}/></Field>
        <Field label="Typ účtu"><Select value={employeeForm.appRole} onChange={(event) => changeRole(event.target.value)}><option value="worker">Pracovník</option><option value="manager" disabled={managerPositionOccupied}>Odborný garant{managerPositionOccupied ? " · již obsazeno" : ""}</option><option value="project_manager">Projektový manažer · bez výkazu a vzdělávacího plánu</option></Select></Field>
        <Field label="Celkový úvazek u zaměstnavatele"><Input type="number" min="0" step="0.1" value={employeeForm.globalFte} onChange={(event) => setEmployeeForm((form) => ({ ...form, globalFte: event.target.value }))}/></Field>
      </div>
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Dočasný PIN nového účtu je 1111.</strong> Přihlášení probíhá podle jména a pracovník si PIN následně změní sám.</div>
      <div className="mt-3"><div className="mb-2 text-sm font-bold text-slate-700">Projektové pozice</div><PositionChoices positions={positionsForRole(employeeForm.appRole)} selectedIds={employeeForm.positionIds} lockedIds={employeeForm.appRole === "manager" ? ["expert-guarantor"] : []} onToggle={toggleNewPosition} hoursById={employeeForm.positionHours} onHoursChange={(id, value) => setEmployeeForm((form) => ({ ...form, positionHours: { ...form.positionHours, [id]: value } }))} remainingHoursById={Object.fromEntries(assignablePositions.filter((position) => position.allocationType === "hours").map((position) => [position.id, hoursRemaining(position)]))}/><p className="mt-2 text-xs text-slate-500">Hodinovou pozici DPP/DPČ lze rozdělit mezi více pracovníků. Součet přidělených hodin nesmí překročit projektový měsíční limit; ostatní pozice zůstávají jedinečné.</p></div>
      <Button className="mt-3" disabled={busy || !employeeForm.name.trim() || (employeeForm.appRole !== "project_manager" && !employeeForm.positionIds.length)} onClick={addEmployee}><Users className="mr-2 inline" size={17}/>Přidat pracovníka</Button>
    </Card>

    <Card title={portal.google.driveConnected ? "Google Disk · připojeno" : "Připojení Google Disku"} collapsible defaultOpen={!portal.google.driveConnected} subtitle="Google účet připojí Vedoucí služby/programu pouze jednou. Odborný garant potom může ukládat výkazy do stejného archivu bez dalšího přihlášení." actions={<HardDrive size={22} className="text-blue-700"/>}>
      {portal.google.driveConnected ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div><div className="font-bold text-emerald-900">Google Drive je připojený</div><div className="mt-1 text-sm text-emerald-800">Účet: {portal.google.driveAccountEmail}</div><div className="mt-1 text-xs text-emerald-700">Aplikace sama vytváří podsložky podle roku, měsíce a pracovníka.</div></div>
        <div className="flex flex-wrap gap-2">{portal.google.driveFolderUrl && <a className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100" href={portal.google.driveFolderUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2" size={16}/>Otevřít složku</a>}<Button variant="secondary" disabled={busy || portal.employee.appRole === "manager"} onClick={disconnectDrive}><Unplug className="mr-2" size={16}/>Odpojit</Button></div>
      </div> : <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <div className="font-bold text-blue-950">Cílový účet: {portal.google.driveAllowedEmail || "není nastaven"}</div>
        <p className="mt-1 text-sm text-blue-900">Po připojení aplikace sama založí složku „Mosty v rodině – podepsané výkazy“. Není potřeba ji ručně vytvářet ani sdílet se servisním účtem.</p>
        {!portal.google.driveOAuthConfigured && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Nejdříve je potřeba v Google Cloud doplnit OAuth klienta. Aplikace je na něj již připravená.</p>}
        <Button className="mt-3" disabled={busy || portal.employee.appRole === "manager" || !portal.google.driveOAuthConfigured} onClick={connectDrive}><Link2 className="mr-2" size={16}/>{busy ? "Připravuji přihlášení…" : "Připojit Google Drive"}</Button>
      </div>}
    </Card>
  </fieldset>;
}
