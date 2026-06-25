import React, { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  calculateRoleMetrics,
  calculateTotalMetrics,
  getHolidaysCountForMonth,
} from "./workReportRules.mjs";
import { DEFAULT_ABSENCES, EMPLOYEE, PROJECTS, ROLES } from "./sulkovaConfig.mjs";
import {
  HOURS_TOLERANCE,
  balanceActivitiesToRequiredHours,
  clampActivityRows,
  createDefaultActivities,
  distributeActivitiesByWeights,
  getActivityHoursStatus,
  roundHours,
  sumActivityHours,
} from "./activityUtils.mjs";
import { recalculateAllReportActivities } from "./reportRecalc.mjs";

const TEMPLATE_FILE_URL = new URL("../data/ŠABLONA_Pracovní výkaz OPZ+.xlsx", import.meta.url).href;
const DRAFT_STORAGE_KEY = "opz-sulkova-generator-draft-v1";

const readDraft = () => {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
};

const formatNumber = (value, fractionDigits = 1) =>
  Number(value || 0).toLocaleString("cs-CZ", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

const formatHours = (value) => `${formatNumber(value, 2)} h`;
const pad = (value) => String(value).padStart(2, "0");
const PROJECT_PERIOD = {
  startYear: 2026,
  startMonth: 5,
  endYear: 2028,
  endMonth: 8,
};
const PROJECT_YEARS = Array.from(
  { length: PROJECT_PERIOD.endYear - PROJECT_PERIOD.startYear + 1 },
  (_, index) => PROJECT_PERIOD.startYear + index
);
const getProjectMonthsForYear = (year) => {
  const start = year === PROJECT_PERIOD.startYear ? PROJECT_PERIOD.startMonth : 1;
  const end = year === PROJECT_PERIOD.endYear ? PROJECT_PERIOD.endMonth : 12;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
const normalizeProjectPeriod = (period) => {
  const year = PROJECT_YEARS.includes(Number(period?.year)) ? Number(period.year) : PROJECT_PERIOD.startYear;
  const months = getProjectMonthsForYear(year);
  const month = months.includes(Number(period?.month)) ? Number(period.month) : months[0];
  return { month, year };
};
const getReportFilename = (period, report) =>
  `${period.year}-${pad(period.month)}__${report.project.shortName}__${report.role.exportRoleName}__${EMPLOYEE.exportName}.xlsx`;

const fallbackDistributeHours = (activities, targetHours) =>
  distributeActivitiesByWeights(
    activities.map((desc) => ({ desc, hours: 0 })),
    targetHours
  );

const enforceUnevenDistribution = (activities) => {
  if (activities.length < 2) return activities;
  const sorted = activities
    .map((activity, index) => ({ ...activity, index }))
    .sort((a, b) => Number(b.hours || 0) - Number(a.hours || 0));
  const top = sorted[0];
  const second = sorted[1];
  if (Number(top.hours || 0) <= 0 || Math.abs(Number(top.hours || 0) - Number(second.hours || 0)) >= 0.01) {
    return activities;
  }

  const donor = [...sorted].reverse().find((activity) => activity.index !== top.index && Number(activity.hours || 0) >= 0.01);
  if (!donor) return activities;

  const next = activities.map((activity) => ({ ...activity }));
  next[top.index].hours = roundHours(Number(next[top.index].hours || 0) + 0.01);
  next[donor.index].hours = Math.max(0, roundHours(Number(next[donor.index].hours || 0) - 0.01));
  return next;
};

const correctLastActivityToTarget = (activities, targetHours) => {
  if (activities.length === 0) return activities;
  const roundedActivities = activities.map((activity) => ({ ...activity, hours: roundHours(activity.hours) }));
  const diff = roundHours(targetHours - sumActivityHours(roundedActivities));
  const lastIndex = roundedActivities.length - 1;
  roundedActivities[lastIndex] = {
    ...roundedActivities[lastIndex],
    hours: Math.max(0, roundHours(Number(roundedActivities[lastIndex].hours || 0) + diff)),
  };
  return roundedActivities;
};

const normalize = (value) => String(value || "").trim();
const ROLE_ACCENTS = [
  {
    border: "border-l-4 border-l-[#2563EB]",
    summary: "bg-[#EFF6FF]",
    badge: "bg-[#2563EB] text-white",
  },
  {
    border: "border-l-4 border-l-[#059669]",
    summary: "bg-[#ECFDF5]",
    badge: "bg-[#059669] text-white",
  },
  {
    border: "border-l-4 border-l-[#D97706]",
    summary: "bg-[#FFFBEB]",
    badge: "bg-[#D97706] text-white",
  },
];
export default function App() {
  const restoredDraft = useMemo(() => readDraft(), []);
  const [period, setPeriod] = useState(() =>
    normalizeProjectPeriod(
      restoredDraft?.period || {
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      }
    )
  );
  const [absences, setAbsences] = useState(restoredDraft?.absences || DEFAULT_ABSENCES);
  const [reportActivities, setReportActivities] = useState(restoredDraft?.reportActivities || {});
  const [expandedReportIds, setExpandedReportIds] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totalFte = useMemo(() => ROLES.reduce((sum, role) => sum + Number(role.fte || 0), 0), []);
  const projectMonthsForSelectedYear = useMemo(() => getProjectMonthsForYear(period.year), [period.year]);

  useEffect(() => {
    setAbsences((previous) => ({
      ...previous,
      holiday: getHolidaysCountForMonth(period.month, period.year),
    }));
  }, [period.month, period.year]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ period, absences, reportActivities }));
    } catch {
      // Draft persistence is optional.
    }
  }, [period, absences, reportActivities]);

  useEffect(() => {
    setReportActivities((previous) =>
      recalculateAllReportActivities({
        roles: ROLES,
        period,
        absences,
        totalFte,
        activitiesByRole: previous,
        resetToDefaultText: false,
      })
    );
  }, [
    period.month,
    period.year,
    absences.vacation,
    absences.sickLeave,
    absences.otherObstacles,
    absences.otherObstaclesUnit,
    absences.doctorVisitHours,
    absences.holiday,
    totalFte,
  ]);

  const roleReports = useMemo(
    () =>
      ROLES.map((role) => {
        const project = PROJECTS[role.projectId];
        const roleMetrics = calculateRoleMetrics({
          role,
          positionDef: { id: role.positionId, name: role.positionName },
          month: period.month,
          year: period.year,
          absences,
          totalFte,
        });
        const targetWorkHours = Math.max(0, roleMetrics.maxHoursForRole - roleMetrics.totalAbsenceHours);
        const activities = clampActivityRows(reportActivities[role.id] || createDefaultActivities(role));
        const hoursStatus = getActivityHoursStatus(activities, targetWorkHours);
        const relevantHours = hoursStatus.sumActivitiesHours + roleMetrics.totalAbsenceHours;
        return { role, project, roleMetrics, targetWorkHours, activities, workedHours: hoursStatus.sumActivitiesHours, relevantHours, hoursDiff: hoursStatus.diff, hoursStatus };
      }),
    [period.month, period.year, absences, reportActivities, totalFte]
  );

  const totalMetrics = useMemo(
    () =>
      calculateTotalMetrics({
        roles: ROLES,
        positions: ROLES.map((role) => ({ id: role.positionId, name: role.positionName })),
        month: period.month,
        year: period.year,
        absences,
        activities: roleReports.flatMap((report) => report.activities),
        totalFte,
      }),
    [period.month, period.year, absences, roleReports, totalFte]
  );

  const callAi = async (promptText) => {
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promptText,
        systemInstruction:
          "Jsi asistent pro pracovní výkazy OPZ+. Vrať vždy pouze JSON pole objektů s klíči desc a hours. Nesmíš měnit texty dodaných činností ani přidávat nové.",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.details || payload.error || `AI endpoint vrátil HTTP ${response.status}`);
    }

    return response.json();
  };

  const generateActivitiesForReport = async (report) => {
    if (report.targetWorkHours <= 0) {
      return report.activities.map((activity) => ({ ...activity, hours: 0 }));
    }

    const currentActivities = clampActivityRows(report.activities).filter((activity) => normalize(activity.desc));
    if (currentActivities.length === 0) {
      return [{ desc: "", hours: report.targetWorkHours }];
    }
    const prompt = `Rozděl přesně ${report.targetWorkHours.toFixed(2)} hodin pouze mezi tyto aktuální činnosti výkazu.
Projekt: ${report.project.name}
Role: ${report.role.positionName}
Pravidla:
- nepřidávej žádnou další činnost,
- neměň texty činností,
- rozděl hodiny realisticky a nerovnoměrně,
- používej nejvýše dvě desetinná místa.
Činnosti:
${currentActivities.map((activity, index) => `${index + 1}. ${activity.desc}`).join("\n")}
Výstup jen JSON pole objektů {desc, hours}.`;

    let generated;
    try {
      generated = await callAi(prompt);
    } catch (aiError) {
      console.warn("AI generation failed, using deterministic fallback:", aiError);
      generated = fallbackDistributeHours(currentActivities.map((activity) => activity.desc), report.targetWorkHours);
    }

    const hoursByDesc = new Map(
      (Array.isArray(generated) ? generated : []).map((item) => [normalize(item.desc), Number(item.hours || 0)])
    );
    let activities = currentActivities.map((activity) => ({ ...activity, hours: Math.max(0, hoursByDesc.get(normalize(activity.desc)) || 0) }));

    if (activities.every((activity) => activity.hours === 0)) {
      activities = fallbackDistributeHours(currentActivities.map((activity) => activity.desc), report.targetWorkHours);
    }

    return correctLastActivityToTarget(enforceUnevenDistribution(activities), report.targetWorkHours);
  };

  const distributeAllReportsWithAi = async () => {
    setIsGenerating(true);
    setError("");
    setMessage("");
    try {
      const nextEntries = [];
      for (const report of roleReports) {
        const activities = await generateActivitiesForReport(report);
        nextEntries.push([report.role.id, balanceActivitiesToRequiredHours(activities, report.targetWorkHours)]);
      }
      setReportActivities((previous) => ({ ...previous, ...Object.fromEntries(nextEntries) }));
      setMessage("Hodiny byly rozděleny pro všechny výkazy.");
    } catch (aiError) {
      setError(aiError?.message || "Rozdělení hodin pro všechny výkazy selhalo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateActivity = (roleId, index, field, value) => {
    setReportActivities((previous) => {
      const role = ROLES.find((item) => item.id === roleId);
      const current = clampActivityRows(previous[roleId] || createDefaultActivities(role));
      const next = current.map((activity, activityIndex) =>
        activityIndex === index
          ? {
              ...activity,
              [field]: field === "hours" ? Number.parseFloat(value) || 0 : value,
            }
          : activity
      );
      return { ...previous, [roleId]: next };
    });
  };

  const addActivity = (roleId) => {
    setReportActivities((previous) => {
      const role = ROLES.find((item) => item.id === roleId);
      const current = clampActivityRows(previous[roleId] || createDefaultActivities(role));
      if (current.length >= 10) return previous;
      return { ...previous, [roleId]: [...current, { desc: "", hours: 0 }] };
    });
  };

  const removeActivity = (roleId, index) => {
    setReportActivities((previous) => {
      const role = ROLES.find((item) => item.id === roleId);
      const current = clampActivityRows(previous[roleId] || createDefaultActivities(role));
      if (current.length <= 1) return previous;
      return { ...previous, [roleId]: current.filter((_, activityIndex) => activityIndex !== index) };
    });
  };

  const resetRoleActivities = (roleId) => {
    const role = ROLES.find((item) => item.id === roleId);
    const report = roleReports.find((item) => item.role.id === roleId);
    const requiredWorkedHours = roundHours(report?.targetWorkHours || 0);
    setReportActivities((previous) => ({
      ...previous,
      [roleId]: distributeActivitiesByWeights(createDefaultActivities(role), requiredWorkedHours),
    }));
  };

  const resetAllActivities = () => {
    const next = recalculateAllReportActivities({
      roles: ROLES,
      period,
      absences,
      totalFte,
      activitiesByRole: {},
      resetToDefaultText: true,
    });
    setReportActivities(next);
    setMessage("Činnosti byly obnoveny na výchozí hodnoty a hodiny znovu rozděleny.");
    setError("");
  };

  const balanceRoleHours = (report) => {
    setReportActivities((previous) => {
      const current = clampActivityRows(previous[report.role.id] || createDefaultActivities(report.role));
      const next = balanceActivitiesToRequiredHours(current, report.targetWorkHours);
      return { ...previous, [report.role.id]: next };
    });
  };

  const balanceAllReports = () => {
    setReportActivities((previous) => {
      const next = {};
      for (const report of roleReports) {
        const current = clampActivityRows(previous[report.role.id] || createDefaultActivities(report.role));
        next[report.role.id] = balanceActivitiesToRequiredHours(current, report.targetWorkHours);
      }
      return { ...previous, ...next };
    });
    setError("");
    setMessage("Všechny výkazy byly dorovnány.");
  };

  const distributeRoleHoursWithAi = async (report) => {
    setIsGenerating(true);
    setError("");
    setMessage("");
    try {
      const activities = balanceActivitiesToRequiredHours(await generateActivitiesForReport(report), report.targetWorkHours);
      setReportActivities((previous) => ({ ...previous, [report.role.id]: activities }));
      setMessage(`AI rozdělila hodiny pro výkaz ${report.project.shortName} – ${report.role.positionName}.`);
    } catch (aiError) {
      setError(aiError?.message || "AI rozdělení hodin selhalo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const buildWorkbookBuffer = async (report, activities) => {
    const templateResponse = await fetch(TEMPLATE_FILE_URL);
    if (!templateResponse.ok) {
      throw new Error(`Šablonu se nepodařilo načíst (${templateResponse.status}).`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await templateResponse.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("V šabloně nebyl nalezen žádný list.");

    const setCell = (address, value) => {
      worksheet.getCell(address).value = value;
    };

    const monthEndDateText = `${pad(new Date(period.year, period.month, 0).getDate())}.${pad(period.month)}.${period.year}`;
    const workedHours = sumActivityHours(activities);
    const totalOverallHours = roundHours(workedHours + report.roleMetrics.totalAbsenceHours);

    setCell("G7", report.roleMetrics.totalFundHours);
    setCell("C7", report.project.name);
    setCell("C8", report.project.regNumber);
    setCell("G8", EMPLOYEE.globalFte);
    setCell("C9", EMPLOYEE.name);
    setCell("G9", "Pracovní smlouva");
    setCell("C10", report.role.positionName);
    setCell("C11", report.role.budgetCode);
    setCell("G11", report.roleMetrics.roleFte);
    setCell("C12", period.month);
    setCell("C13", period.year);
    setCell("G13", report.roleMetrics.roleFte);

    for (let index = 0; index < 10; index += 1) {
      const row = 17 + index;
      const activity = activities[index];
      setCell(`B${row}`, activity ? activity.desc : "");
      setCell(`G${row}`, activity ? Number(activity.hours || 0) : "");
    }

    setCell("G28", workedHours);
    setCell("G29", workedHours);
    setCell("G32", report.roleMetrics.absHours.vacation || 0);
    setCell("D32", report.roleMetrics.absHours.vacation || 0);
    setCell("G34", report.roleMetrics.absHours.sickLeave || 0);
    setCell("D34", report.roleMetrics.absHours.sickLeave || 0);
    setCell("G36", (report.roleMetrics.absHours.otherObstacles || 0) + (report.roleMetrics.absHours.doctorVisit || 0));
    setCell("D36", (report.roleMetrics.absHours.otherObstacles || 0) + (report.roleMetrics.absHours.doctorVisit || 0));
    setCell("G38", report.roleMetrics.absHours.holiday || 0);
    setCell("D38", report.roleMetrics.absHours.holiday || 0);
    setCell("G40", report.roleMetrics.maxHoursForRole || 0);
    setCell("G41", totalOverallHours || 0);
    setCell("C44", monthEndDateText);
    setCell("C45", monthEndDateText);

    return workbook.xlsx.writeBuffer();
  };

  const generateZip = async () => {
    setIsGenerating(true);
    setError("");
    setMessage("");

    try {
      if (Math.abs(totalFte - 1) > 0.0001) {
        throw new Error(`Součet úvazků není 1,0, ale ${formatNumber(totalFte, 2)}.`);
      }

      const zip = new JSZip();

      for (const report of roleReports) {
        const activities = clampActivityRows(report.activities);
        const buffer = await buildWorkbookBuffer(report, activities);
        const filename = getReportFilename(period, report);
        zip.file(filename, buffer);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${period.year}-${pad(period.month)}__vykazy__${EMPLOYEE.exportName}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMessage("ZIP se třemi výkazy byl vygenerován.");
    } catch (generationError) {
      setError(generationError?.message || "Generování ZIP selhalo.");
    } finally {
      setIsGenerating(false);
    }
  };

  const setAbsenceValue = (field, value) => {
    setAbsences((previous) => ({ ...previous, [field]: Number.parseFloat(value) || 0 }));
  };

  const isReady = !isGenerating && Math.abs(totalFte - 1) < 0.0001;
  const controlTotalRelevantHours = roleReports.reduce((sum, report) => sum + Number(report.relevantHours || 0), 0);

  return (
    <div className="min-h-screen bg-[#F3F6FA] p-4 text-[14px] text-[#0F172A] md:p-6">
      <main className="mx-auto max-w-[1080px] overflow-hidden rounded-[10px] border border-[#E2E8F0] bg-white shadow-sm">
        <header className="border-b border-[#CBD5E1] bg-[#1E3A8A] px-6 py-5 text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={30} />
              <div>
                <h1 className="text-[18px] font-bold">Generátor výkazů OPZ+ pro Martinu Pírkovou</h1>
                <p className="text-[13px] text-blue-100">Jednoúčelový export tří pracovních výkazů do XLSX ZIP.</p>
              </div>
            </div>
            <div className="rounded-md border border-blue-200/40 bg-white/10 px-3 py-2 text-[13px] font-semibold">
              Celkový úvazek: {formatNumber(totalFte, 2)}
            </div>
          </div>
        </header>

        <div className="space-y-4 p-5 md:p-6">
          {(error || message) && (
            <div className={`flex items-center gap-2 rounded-md border px-4 py-3 text-[14px] font-semibold ${error ? "border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]" : "border-green-200 bg-[#F0FDF4] text-[#16A34A]"}`}>
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              {error || message}
            </div>
          )}

          <section className="grid gap-4 rounded-[10px] border border-[#CBD5E1] bg-white p-5 md:grid-cols-[1fr_1fr_1fr]">
            <div>
              <label className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-[#475569]">
                <Calendar size={16} /> Měsíc
              </label>
              <select
                className="w-full rounded-md border border-[#CBD5E1] bg-white p-2.5 outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                value={period.month}
                onChange={(event) => setPeriod((previous) => normalizeProjectPeriod({ ...previous, month: Number.parseInt(event.target.value, 10) }))}
              >
                {projectMonthsForSelectedYear.map((month) => (
                  <option key={month} value={month}>
                    {month}. měsíc
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#475569]">Rok</label>
              <select
                className="w-full rounded-md border border-[#CBD5E1] bg-white p-2.5 outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                value={period.year}
                onChange={(event) => setPeriod((previous) => normalizeProjectPeriod({ ...previous, year: Number.parseInt(event.target.value, 10) }))}
              >
                {PROJECT_YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-md border border-[#E2E8F0] bg-white p-4 text-[14px]">
              <div className="font-semibold text-[#475569]">Fond měsíce</div>
              <div className="mt-1 text-[16px] font-bold text-[#0F172A]">{formatHours(totalMetrics.totalFundHours)}</div>
              <div className="text-[#475569]">Pracovní dny: {formatNumber(totalMetrics.workingDays, 0)} · placené svátky: {formatNumber(absences.holiday, 0)}</div>
            </div>
          </section>

          <section className="grid gap-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 md:grid-cols-5">
            <NumberField label="Dovolená" suffix="dní" value={absences.vacation} onChange={(value) => setAbsenceValue("vacation", value)} />
            <NumberField label="Nemocenská s náhradou" suffix="dní" value={absences.sickLeave} onChange={(value) => setAbsenceValue("sickLeave", value)} />
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#475569]">Ostatní překážky</label>
              <div className="mb-2 flex gap-1">
                {["days", "hours"].map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setAbsences((previous) => ({ ...previous, otherObstaclesUnit: unit }))}
                    className={`rounded px-2 py-1 text-[12px] font-semibold ${absences.otherObstaclesUnit === unit ? "border border-[#1D4ED8] bg-blue-50 text-[#1D4ED8]" : "border border-[#CBD5E1] bg-white text-[#475569]"}`}
                  >
                    {unit === "days" ? "Dny" : "Hodiny"}
                  </button>
                ))}
              </div>
              <NumberInput suffix={absences.otherObstaclesUnit === "days" ? "dní" : "h"} value={absences.otherObstacles} onChange={(value) => setAbsenceValue("otherObstacles", value)} />
            </div>
            <NumberField label="Návštěva lékaře" suffix="h" value={absences.doctorVisitHours} onChange={(value) => setAbsenceValue("doctorVisitHours", value)} />
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#475569]">Placené svátky</label>
              <NumberInput suffix="dní" value={absences.holiday} readOnly />
              <p className="mt-1 text-[12px] text-[#475569]">Doplněno automaticky.</p>
            </div>
          </section>

          <section className="rounded-[10px] border border-[#CBD5E1] bg-[#F0FDF4] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-[16px] font-bold text-[#0F172A]">Souhrn před exportem</h2>
                <p className="text-[14px] text-[#475569]">
                  Fond měsíce: {formatHours(totalMetrics.totalFundHours)} · Výkazy celkem: {formatHours(controlTotalRelevantHours)} · Nepřítomnosti celkem: {formatHours(totalMetrics.totalAbsenceHours)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={distributeAllReportsWithAi}
                  disabled={isGenerating}
                  className="rounded-md border border-[#1D4ED8] bg-white px-4 py-2.5 text-sm font-semibold text-[#1D4ED8] hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                >
                  {isGenerating ? "Generuji rozdělení..." : "vygenerovat rozdělení hodin AI"}
                </button>
                <button
                  type="button"
                  onClick={generateZip}
                  disabled={!isReady}
                  className={`rounded-md px-5 py-2.5 text-sm font-bold text-white ${isReady ? "bg-[#1D4ED8] hover:bg-[#1E3A8A]" : "cursor-not-allowed bg-slate-300"}`}
                >
                  Vygenerovat ZIP
                </button>
              </div>
            </div>
          </section>



          <details className="rounded-[10px] border border-[#E2E8F0] bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">Co bude v ZIPu</summary>
            <ul className="space-y-1 border-t border-slate-100 p-4 font-mono text-xs text-slate-700">
              {roleReports.map((report) => (
                <li key={`file-${report.role.id}`}>{getReportFilename(period, report)}</li>
              ))}
            </ul>
          </details>

          <section className="flex justify-end">
            <button
              type="button"
              onClick={resetAllActivities}
              className="rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-slate-50"
            >
              Obnovit činnosti a hodiny
            </button>
          </section>

          <section className="grid gap-3">
            {roleReports.map((report, index) => {
              const accent = ROLE_ACCENTS[index % ROLE_ACCENTS.length];
              const isExpanded = expandedReportIds.includes(report.role.id);
              return (
              <article
                key={report.role.id}
                className={`rounded-[10px] border border-[#E2E8F0] ${accent.border} bg-white`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedReportIds((previous) =>
                      previous.includes(report.role.id)
                        ? previous.filter((roleId) => roleId !== report.role.id)
                        : [...previous, report.role.id]
                    )
                  }
                  className={`block w-full cursor-pointer px-4 py-3 text-left ${accent.summary}`}
                >
                  <div className="flex min-h-[56px] flex-col gap-2 text-[14px] md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${accent.badge}`}>
                        {index + 1}
                      </span>
                      <div>
                        <div className="font-bold text-slate-900">{report.project.shortName} - {report.role.positionName}</div>
                        <div className="text-xs font-semibold text-slate-500">Pozice {index + 1} ze {roleReports.length}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-slate-600">
                      <span>{formatNumber(report.role.fte, 2)} úv.</span>
                      <span>fond {formatHours(report.roleMetrics.maxHoursForRole)}</span>
                      <span>činnosti {formatHours(report.workedHours)}</span>
                      <span className={`rounded px-2 py-1 text-xs font-bold ${report.hoursStatus.isBalanced ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {report.hoursStatus.isBalanced
                          ? "sedí"
                          : report.hoursDiff < 0
                            ? `chybí ${formatHours(Math.abs(report.hoursDiff))}`
                            : `překročeno o ${formatHours(report.hoursDiff)}`}
                      </span>
                      <span className="rounded border border-[#CBD5E1] bg-white px-2 py-1 text-xs font-semibold text-[#475569]">
                        {isExpanded ? "Skrýt činnosti" : "Upravit činnosti"}
                      </span>
                    </div>
                  </div>
                </button>
                {isExpanded && (
                <div className="space-y-3 border-t border-slate-100 p-4">
                  {Math.abs(report.hoursDiff) > HOURS_TOLERANCE && (
                    <div className={`flex flex-col gap-2 rounded border bg-white px-3 py-2 text-sm font-semibold md:flex-row md:items-center md:justify-between ${report.hoursDiff < 0 ? "border-orange-300 text-orange-800" : "border-red-300 text-red-800"}`}>
                      <span>
                        {report.hoursDiff < 0
                          ? `Chybí ${formatHours(Math.abs(report.hoursDiff))}`
                          : `Překročeno o ${formatHours(report.hoursDiff)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => balanceRoleHours(report)}
                        className="w-fit rounded bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50"
                      >
                        Dorovnat hodiny
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {report.activities.map((activity, index) => (
                      <div key={`${report.role.id}-${index}`} className="grid gap-2 rounded-md border border-[#E2E8F0] bg-white p-2.5 md:grid-cols-[32px_minmax(0,1fr)_120px_36px] md:items-start">
                        <div className="pt-2 text-center font-mono text-sm text-slate-400">{index + 1}.</div>
                        <textarea
                          value={activity.desc}
                          onChange={(event) => updateActivity(report.role.id, index, "desc", event.target.value)}
                          className="min-h-[68px] w-full resize-y rounded-md border border-[#CBD5E1] bg-white p-2 text-[14px] outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                          placeholder="Text činnosti"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={activity.hours || ""}
                            onChange={(event) => updateActivity(report.role.id, index, "hours", event.target.value)}
                            className="w-full rounded-md border border-[#CBD5E1] bg-white p-2 pr-8 text-right text-[14px] outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                          />
                          <span className="absolute right-2 top-2 text-sm font-semibold text-slate-400">h</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeActivity(report.role.id, index)}
                          disabled={report.activities.length <= 1}
                          className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          title="Smazat činnost"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addActivity(report.role.id)}
                      disabled={report.activities.length >= 10}
                      className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus size={16} /> Přidat činnost
                    </button>
                    <button
                      type="button"
                      onClick={() => resetRoleActivities(report.role.id)}
                      className="rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-slate-50"
                    >
                      Obnovit činnosti výkazu
                    </button>
                  </div>

                  <details className="rounded-md border border-[#E2E8F0] bg-[#F8FAFC]">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#475569]">Pokročilé možnosti</summary>
                    <div className="flex flex-wrap gap-2 border-t border-[#E2E8F0] p-3">
                      <button
                        type="button"
                        onClick={() => distributeRoleHoursWithAi(report)}
                        disabled={isGenerating}
                        className="flex items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                        Navrhnout rozdělení AI
                      </button>
                      <button
                        type="button"
                        onClick={() => balanceRoleHours(report)}
                        className="rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm font-semibold text-[#475569] hover:bg-slate-50"
                      >
                        Dorovnat hodiny
                      </button>
                    </div>
                  </details>
                </div>
                )}
              </article>
              );
            })}
          </section>

        </div>
      </main>
    </div>
  );
}

function NumberField({ label, suffix, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      <NumberInput suffix={suffix} value={value} onChange={onChange} />
    </div>
  );
}

function NumberInput({ suffix, value, onChange, readOnly = false }) {
  return (
    <div className="relative">
      <input
        type="number"
        step="0.01"
        min="0"
        readOnly={readOnly}
        className={`w-full rounded border border-slate-300 bg-white p-2 pr-12 text-right outline-none focus:ring-2 focus:ring-[#1D4ED8] ${readOnly ? "text-slate-500" : ""}`}
        value={value || ""}
        onChange={(event) => onChange?.(event.target.value)}
      />
      <span className="absolute right-3 top-2 font-bold text-slate-400">{suffix}</span>
    </div>
  );
}
