import React, { useState } from "react";
import { ExternalLink, Eye, UploadCloud } from "lucide-react";
import { api, jsonBody, openApiFilePreview } from "../api.mjs";
import { Button, Card, Field, Input, Notice, Select, useTimedNotice } from "./Common.jsx";

export default function SignedReportUpload({ onRefresh, driveFolderUrl = "", canOpenDrive = false, title = "Hromadné nahrání podepsaných výkazů", subtitle = "Nahrajte jeden či více PDF nebo ZIP. Aplikace rozdělí stránky a navrhne přiřazení; u stejného výkazu lze spojit více stran." }) {
  const [notice, setNotice] = useTimedNotice();
  const [busy, setBusy] = useState(false);
  const [bundles, setBundles] = useState([]);
  const [inputKey, setInputKey] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [mappings, setMappings] = useState({});
  const [savedReports, setSavedReports] = useState([]);

  const analyze = async () => {
    if (!bundles.length) return;
    setBusy(true); setNotice(null); setAnalysis(null); setSavedReports([]);
    try {
      const body = new FormData();
      bundles.forEach((bundle) => body.append("bundles", bundle));
      const result = await api("/api/signed-reports/analyze", { method: "POST", body });
      setAnalysis(result);
      setMappings(Object.fromEntries(result.candidates.map((item) => [item.id, item.reportId || ""])));
      setNotice({ type: "info", text: `${bundles.length === 1 ? "Soubor byl zpracován" : `${bundles.length} souborů bylo zpracováno`}. Zkontrolujte přiřazení každé stránky před uložením.` });
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const commit = async () => {
    setBusy(true); setNotice(null);
    try {
      const selected = Object.entries(mappings).filter(([, reportId]) => reportId).map(([candidateId, reportId]) => ({ candidateId, reportId }));
      if (!selected.length) throw new Error("Přiřaďte alespoň jednu stránku k výkazu.");
      const result = await api("/api/signed-reports/commit", { method: "POST", body: jsonBody({ importId: analysis.importId, mappings: selected }) });
      setSavedReports(result.reports || []);
      setAnalysis(null); setBundles([]); setMappings({}); setInputKey((value) => value + 1);
      setNotice({ type: "success", text: "Podepsané výkazy byly zařazeny a archivovány." });
      await onRefresh();
    } catch (error) { setNotice({ type: "error", text: error.message }); } finally { setBusy(false); }
  };

  const preview = async (report) => {
    setNotice(null);
    try {
      await openApiFilePreview(`/api/work-reports/${report.id}/signed-file`);
    } catch (error) { setNotice({ type: "error", text: error.message }); }
  };

  const driveAction = canOpenDrive && driveFolderUrl
    ? <a className="inline-flex min-h-9 shrink-0 items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50" href={driveFolderUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5" size={16}/>Otevřít celý Disk</a>
    : null;

  return <Card title={title} subtitle={subtitle} actions={driveAction}>
    <Notice notice={notice} className="mb-4"/>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field label="Jeden či více PDF nebo ZIP"><Input key={inputKey} type="file" multiple accept=".pdf,.zip,application/pdf,application/zip" onChange={(event) => setBundles(Array.from(event.target.files || []))}/>{bundles.length > 0 && <div className="mt-1 text-xs font-semibold text-slate-500">Vybráno souborů: {bundles.length}</div>}</Field><Button disabled={busy || !bundles.length} onClick={analyze}><UploadCloud className="mr-1 inline" size={16}/>Rozdělit a rozpoznat</Button></div>
    {analysis && <div className="mt-5 space-y-3"><div className="font-bold">Kontrola přiřazení ({analysis.candidates.length} stran/souborů)</div>{analysis.candidates.map((candidate) => <div key={candidate.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_2fr]"><div><strong>{candidate.sourceName}</strong><div className="text-xs text-slate-500">strana {candidate.pageNumber} · {candidate.method === "gemini" ? "rozpoznáno Gemini" : candidate.method === "filename" ? "podle názvu" : "nepřiřazeno"} · jistota {Math.round(Number(candidate.confidence || 0) * 100)} %</div></div><Select value={mappings[candidate.id] || ""} onChange={(event) => setMappings((current) => ({ ...current, [candidate.id]: event.target.value }))}><option value="">Nezařazovat / vybrat ručně</option>{analysis.expectedReports.map((report) => <option key={report.id} value={report.id}>{report.month}/{report.year} · {report.employeeName} · {report.positionName}</option>)}</Select></div>)}<Button variant="success" disabled={busy} onClick={commit}>Potvrdit a uložit na Google Drive</Button></div>}
    {savedReports.length > 0 && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="mb-2 text-sm font-bold text-emerald-900">Uložené podepsané výkazy</div><div className="flex flex-wrap gap-2">{savedReports.map((report) => <Button key={report.id} variant="secondary" disabled={busy} onClick={() => preview(report)}><Eye className="mr-1.5 inline" size={16}/>Náhled: {report.employeeName} · {report.positionName}</Button>)}</div></div>}
  </Card>;
}
