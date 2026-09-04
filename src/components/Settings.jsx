import React, { useMemo, useState } from "react";
import { ExternalLink, HardDrive, Link2, Pencil, Save, Settings as SettingsIcon, Trash2, Unplug, Users, X } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { Button, Card, Field, Input, Notice, Select, useTimedNotice } from "./Common.jsx";

const roleLabel = (role) => role === "manager" ? "Odborný garant" : "Pracovník";

function PositionChoices({ positions, selectedIds, onToggle, lockedIds = [] }) {
  if (!positions.length) return <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">Žádná volná pozice pro tento typ účtu.</p>;
  return <div className="grid gap-2 md:grid-cols-2">{positions.map((position) => <label key={position.id} className={`cursor-pointer rounded-lg border p-2.5 text-sm ${selectedIds.includes(position.id) ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
    <input className="mr-2" type="checkbox" checked={selectedIds.includes(position.id)} disabled={lockedIds.includes(position.id)} onChange={() => onToggle(position.id)}/>
    <strong>{position.name}</strong>
    <span className="ml-2 text-slate-500">{position.allocationType === "hours" ? `${position.monthlyHours} h/měsíc` : position.allocationType === "fte" ? `${position.fte} úv.` : "bez měsíčního výkazu"}</span>
  </label>)}</div>;
}

export default function Settings({ portal, positions, onRefresh }) {
  const [employeeForm, setEmployeeForm] = useState({ name: "", globalFte: 1, appRole: "worker", positionIds: [] });
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editPositionIds, setEditPositionIds] = useState([]);
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const assignablePositions = useMemo(() => positions.filter((item) => item.active !== false && item.reportRequired), [positions]);
  const managedEmployees = portal.employees.filter((item) => item.id !== portal.employee.id && item.active !== false);
  const occupiedPositionIds = (excludedEmployeeId = "") => new Set(portal.employees
    .filter((item) => item.active !== false && item.id !== excludedEmployeeId)
    .flatMap((item) => (item.assignments || []).map((assignment) => assignment.positionId)));
  const positionsForRole = (appRole, excludedEmployeeId = "") => {
    const occupied = occupiedPositionIds(excludedEmployeeId);
    return assignablePositions.filter((position) => position.id !== "service-manager"
      && (appRole === "manager" || position.id !== "expert-guarantor")
      && !occupied.has(position.id));
  };
  const managerPositionOccupied = occupiedPositionIds().has("expert-guarantor");

  const toggleNewPosition = (id) => setEmployeeForm((form) => ({
    ...form,
    positionIds: form.positionIds.includes(id) ? form.positionIds.filter((item) => item !== id) : [...form.positionIds, id],
  }));

  const addEmployee = async () => {
    setBusy(true); setNotice(null);
    try {
      await api("/api/employees", { method: "POST", body: jsonBody({
        name: employeeForm.name,
        globalFte: Number(employeeForm.globalFte),
        appRole: employeeForm.appRole,
        assignments: employeeForm.positionIds.map((positionId) => ({ positionId })),
      }) });
      setEmployeeForm({ name: "", globalFte: 1, appRole: "worker", positionIds: [] });
      setNotice({ type: "success", text: `${roleLabel(employeeForm.appRole)} byl založen s dočasným PINem 0000.` });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  const startEditing = (employee) => {
    setEditingId(employee.id);
    setEditName(employee.name);
    setEditPositionIds((employee.assignments || [])
      .filter((assignment) => positions.some((position) => position.id === assignment.positionId && position.reportRequired))
      .map((assignment) => assignment.positionId));
    setNotice(null);
  };

  const toggleEditedPosition = (id) => setEditPositionIds((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id]);

  const saveEmployee = async (employee) => {
    setBusy(true); setNotice(null);
    try {
      const currentAssignments = new Map((employee.assignments || []).map((assignment) => [assignment.positionId, assignment]));
      await api(`/api/employees/${employee.id}`, { method: "PATCH", body: jsonBody({
        name: editName.trim(),
        assignments: editPositionIds.map((positionId) => currentAssignments.get(positionId) || { positionId }),
      }) });
      setEditingId("");
      setEditName("");
      setEditPositionIds([]);
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
      setEditingId(""); setEditName(""); setEditPositionIds([]);
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
    positionIds: appRole === "manager"
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

  return <div className="space-y-4">
    <Notice notice={notice}/>

    <Card title="Archiv podepsaných výkazů" subtitle="Google účet připojí Vedoucí služby/programu pouze jednou. Odborný garant potom může ukládat výkazy do stejného archivu bez dalšího přihlášení." actions={<HardDrive size={22} className="text-blue-700"/>}>
      {portal.google.driveConnected ? <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div><div className="font-bold text-emerald-900">Google Drive je připojený</div><div className="mt-1 text-sm text-emerald-800">Účet: {portal.google.driveAccountEmail}</div><div className="mt-1 text-xs text-emerald-700">Aplikace sama vytváří podsložky podle roku, měsíce a pracovníka.</div></div>
        <div className="flex flex-wrap gap-2">{portal.google.driveFolderUrl && <a className="inline-flex items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100" href={portal.google.driveFolderUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2" size={16}/>Otevřít složku</a>}<Button variant="secondary" disabled={busy} onClick={disconnectDrive}><Unplug className="mr-2" size={16}/>Odpojit</Button></div>
      </div> : <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="font-bold text-blue-950">Cílový účet: {portal.google.driveAllowedEmail || "není nastaven"}</div>
        <p className="mt-1 text-sm text-blue-900">Po připojení aplikace sama založí složku „Mosty v rodině – podepsané výkazy“. Není potřeba ji ručně vytvářet ani sdílet se servisním účtem.</p>
        {!portal.google.driveOAuthConfigured && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Nejdříve je potřeba v Google Cloud doplnit OAuth klienta. Aplikace je na něj již připravená.</p>}
        <Button className="mt-3" disabled={busy || !portal.google.driveOAuthConfigured} onClick={connectDrive}><Link2 className="mr-2" size={16}/>{busy ? "Připravuji přihlášení…" : "Připojit Google Drive"}</Button>
      </div>}
    </Card>

    <Card title="Nastavení pracovníků" subtitle="Tuto část vidí pouze Vedoucí služby/programu. Zde zakládá osobní účty a přiřazuje k nim jednu nebo více projektových pozic." actions={<SettingsIcon size={22} className="text-blue-700"/>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Jméno pracovníka"><Input value={employeeForm.name} onChange={(event) => setEmployeeForm((form) => ({ ...form, name: event.target.value }))}/></Field>
        <Field label="Typ účtu"><Select value={employeeForm.appRole} onChange={(event) => changeRole(event.target.value)}><option value="worker">Pracovník</option><option value="manager" disabled={managerPositionOccupied}>Odborný garant{managerPositionOccupied ? " · již obsazeno" : ""}</option></Select></Field>
        <Field label="Celkový úvazek u zaměstnavatele"><Input type="number" min="0" step="0.1" value={employeeForm.globalFte} onChange={(event) => setEmployeeForm((form) => ({ ...form, globalFte: event.target.value }))}/></Field>
      </div>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Dočasný PIN nového účtu je 0000.</strong> Přihlášení probíhá podle jména a pracovník si PIN následně změní sám.</div>
      <div className="mt-4"><div className="mb-2 text-sm font-bold text-slate-700">Volné projektové pozice</div><PositionChoices positions={positionsForRole(employeeForm.appRole)} selectedIds={employeeForm.positionIds} lockedIds={employeeForm.appRole === "manager" ? ["expert-guarantor"] : []} onToggle={toggleNewPosition}/><p className="mt-2 text-xs text-slate-500">Pozice, které už má přiřazené jiný aktivní pracovník, se zde nenabízejí.</p></div>
      <Button className="mt-4" disabled={busy || !employeeForm.name.trim() || !employeeForm.positionIds.length} onClick={addEmployee}><Users className="mr-2 inline" size={17}/>Přidat pracovníka</Button>
    </Card>

    <Card title="Pracovníci a jejich pozice" subtitle="Pozice lze kdykoli doplnit nebo odebrat. Přihlášení zůstává stále pod jedním jménem.">
      {!managedEmployees.length ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Zatím není založen žádný další pracovník.</p> : <div className="grid gap-3">
        {managedEmployees.map((employee) => <section key={employee.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><strong>{employee.name}</strong><div className="mt-1 text-sm text-slate-500">{roleLabel(employee.appRole)} · {(employee.assignments || []).map((assignment) => positions.find((position) => position.id === assignment.positionId && position.reportRequired)?.name).filter(Boolean).join(", ") || "bez pozice s výkazem"}</div></div>
            {editingId === employee.id
              ? <Button variant="secondary" disabled={busy} onClick={() => { setEditingId(""); setEditName(""); setEditPositionIds([]); }}><X className="mr-1 inline" size={16}/>Zrušit</Button>
              : <Button variant="secondary" disabled={busy} onClick={() => startEditing(employee)}><Pencil className="mr-1 inline" size={16}/>Upravit pracovníka</Button>}
          </div>
          {editingId === employee.id && <div className="mt-3 border-t border-slate-200 pt-3">
            <div className="mb-3 max-w-md"><Field label="Jméno pracovníka"><Input value={editName} onChange={(event) => setEditName(event.target.value)}/></Field></div>
            <div className="mb-2 text-xs font-bold text-slate-700">Projektové pozice</div>
            <PositionChoices positions={positionsForRole(employee.appRole, employee.id)} selectedIds={editPositionIds} lockedIds={employee.appRole === "manager" ? ["expert-guarantor"] : []} onToggle={toggleEditedPosition}/>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><Button disabled={busy || !editName.trim() || !editPositionIds.length} onClick={() => saveEmployee(employee)}><Save className="mr-1 inline" size={16}/>Uložit pracovníka</Button><Button variant="danger" disabled={busy} onClick={() => deleteEmployee(employee)}><Trash2 className="mr-1 inline" size={16}/>Smazat pracovníka</Button></div>
          </div>}
        </section>)}
      </div>}
    </Card>
  </div>;
}
