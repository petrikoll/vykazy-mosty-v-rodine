import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import questions from "../methodology/quizQuestions.generated.json" with { type: "json" };
import { METHODOLOGY_TEXTS, QUIZ_SERIES_SIZES } from "../methodology/quizConfig.mjs";
import {
  calculateQuizStats,
  calculateSeriesSummary,
  hasLevelUp,
  isAnswerCorrect,
  selectQuizQuestions,
} from "../methodology/quizServices.mjs";
import { useIdleMethodologySaver } from "../methodology/useIdleMethodologySaver.js";
import FrogMascot from "./FrogMascot.jsx";

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function Progress({ stats }) {
  const label = `${stats.coveredCount} z ${stats.questionCount} různých otázek`;
  return <div>
    <div className="mb-1.5 flex justify-between gap-3 text-xs font-semibold text-slate-600"><span>Projití celé databanky</span><span>{label}</span></div>
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Projití celé databanky" aria-valuemin="0" aria-valuemax={stats.questionCount} aria-valuenow={stats.coveredCount} aria-valuetext={label}>
      <div className="h-full rounded-full bg-orange-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${stats.progress}%` }}/>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-600">{stats.nextLevel
      ? `Další ocenění: ${stats.nextLevel.label} — alespoň ${stats.nextLevel.minQuestions} různých otázek a ${stats.nextLevel.min} % správně.`
      : stats.questionCount ? "Celá databanka projita. Nejvyšší ocenění vyžaduje nejméně 90 % správně." : "Databanka zatím neobsahuje aktivní otázky."}</p>
  </div>;
}

function LongTermStats({ stats, compact = false }) {
  return <div className={compact ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Aktuální úroveň</div>
      <div className="mt-1 text-xl font-black text-blue-950">{stats.level.label}</div>
      <div className="mt-1 text-xs text-blue-800">Ocenění zohledňuje počet různých otázek i správnost odpovědí.</div>
    </div>
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-orange-800">Úspěšnost napříč otázkami</div>
      <div className="mt-1 text-xl font-black text-slate-950">{stats.answerCount ? `${stats.percent} %` : "—"}</div>
      <div className="mt-1 text-xs text-slate-600">{stats.correct} správně z {stats.scoringCount} probraných otázek. Počítá se poslední odpověď na každou otázku.</div>
    </div>
  </div>;
}

function SaverIntro({ history, onStart }) {
  const stats = useMemo(() => calculateQuizStats(history), [history]);
  return <div className="methodology-layout">
    <div className="methodology-copy">
      <p className="methodology-eyebrow">{METHODOLOGY_TEXTS.eyebrow}</p>
      <h1 className="methodology-title">{METHODOLOGY_TEXTS.title}</h1>
      <p className="methodology-lead">{METHODOLOGY_TEXTS.intro}</p>
      <LongTermStats stats={stats}/>
      <div className="mt-4"><Progress stats={stats}/></div>
      {(stats.strongest || stats.weakest) && <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {stats.strongest && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><strong>Silná oblast:</strong> {stats.strongest.topic}</div>}
        {stats.weakest && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><strong>K zopakování:</strong> {stats.weakest.topic}</div>}
      </div>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="methodology-primary" type="button" onClick={() => onStart(QUIZ_SERIES_SIZES.standard)}>Dát si 3 otázky <ChevronRight size={18}/></button>
        <button className="methodology-secondary" type="button" onClick={() => onStart(QUIZ_SERIES_SIZES.quick)}>Jen jednu rychlovku</button>
      </div>
    </div>
    <div className="methodology-mascot-wrap"><FrogMascot variant="intro" className="methodology-mascot"/><p>Šanon připraven. Metodika taky.</p></div>
  </div>;
}

function QuizQuestion({ question, index, total, selectedId, onSelect, onConfirm, busy, error }) {
  return <div className="mx-auto max-w-4xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2"><span className="methodology-chip">{question.topic}</span><span className="methodology-chip methodology-chip--orange">{question.difficulty}</span></div>
      <strong className="text-sm text-blue-950">{total === 1 ? "Rychlovka · jedna otázka" : `Otázka ${index + 1} ze ${total} v této sérii`}</strong>
    </div>
    <h1 className="text-balance text-2xl font-black leading-tight text-blue-950 sm:text-3xl">{question.question}</h1>
    <fieldset className="mt-7 space-y-3">
      <legend className="sr-only">Vyberte jednu odpověď</legend>
      {question.answers.map((answer) => <button key={answer.id} type="button" className={`methodology-answer ${selectedId === answer.id ? "methodology-answer--selected" : ""}`} aria-pressed={selectedId === answer.id} onClick={() => onSelect(answer.id)}>
        <span className="methodology-answer-dot" aria-hidden="true">{selectedId === answer.id && <Check size={16}/>}</span><span>{answer.text}</span>
      </button>)}
    </fieldset>
    {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}
    <div className="mt-6 flex justify-end"><button className="methodology-primary" type="button" disabled={!selectedId || busy} onClick={onConfirm}>{busy ? "Ukládám…" : "Potvrdit odpověď"}</button></div>
  </div>;
}

function QuizFeedback({ question, answer, isLast, onContinue }) {
  const correctAnswer = question.answers.find((item) => item.id === question.correctAnswerId);
  return <div className="mx-auto max-w-4xl">
    <div className={`rounded-2xl border p-5 ${answer.correct ? "border-emerald-300 bg-emerald-50" : "border-orange-300 bg-orange-50"}`}>
      <div className={`text-2xl font-black ${answer.correct ? "text-emerald-800" : "text-orange-900"}`}>{answer.correct ? "✓ Správně" : "✕ Tentokrát ne"}</div>
      <p className="mt-1 text-sm text-slate-700">{answer.correct ? "Žába uznale kývá. Tohle sedí." : "Nic se neděje. Od toho je to opáčko."}</p>
    </div>
    {!answer.correct && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm"><strong>Správná odpověď:</strong><p className="mt-1 leading-6">{correctAnswer?.text}</p></div>}
    <div className="mt-4 rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-blue-950">Proč?</h2>
      <p className="mt-2 leading-7 text-slate-700">{question.explanation}</p>
      <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600"><strong>Zdroj v metodice:</strong> {question.source}</p>
    </div>
    <div className="mt-6 flex justify-end"><button className="methodology-primary" type="button" onClick={onContinue}>{isLast ? "Výsledek" : "Další otázka"} <ChevronRight size={18}/></button></div>
  </div>;
}

function QuizResult({ answers, fullHistory, onAgain, onClose }) {
  const series = calculateSeriesSummary(answers);
  const stats = calculateQuizStats(fullHistory);
  return <div className="methodology-layout">
    <div className="methodology-copy">
      <p className="methodology-eyebrow">Hotovo</p>
      <h1 className="methodology-title">{series.correct} / {series.total}</h1>
      <p className="methodology-lead">Tato série: <strong>{series.percent} %</strong>. Dlouhodobý výsledek zůstává oddělený níže.</p>
      <LongTermStats stats={stats}/>
      <div className="mt-4"><Progress stats={stats}/></div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {series.strongest && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"><strong>Dnešní silná oblast:</strong> {series.strongest.topic}</div>}
        {(series.weakest || stats.weakest) && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><strong>K zopakování:</strong> {(series.weakest || stats.weakest).topic}</div>}
      </div>
      <div className="mt-6 flex flex-wrap gap-3"><button className="methodology-primary" type="button" onClick={onAgain}>Další 3 otázky</button><button className="methodology-secondary" type="button" onClick={onClose}>Zavřít</button></div>
    </div>
    <div className="methodology-mascot-wrap"><FrogMascot variant="result" className="methodology-mascot"/><p>Mapa slabších míst je nejlepší zkratka k jistotě.</p></div>
  </div>;
}

function LevelUp({ stats, onContinue }) {
  const highest = stats.level.key === "methodology-nerd";
  return <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
    <p className="methodology-eyebrow">{METHODOLOGY_TEXTS.levelUp}</p>
    <FrogMascot variant="level" className="my-2 w-full max-w-[280px]"/>
    <h1 className="text-4xl font-black uppercase tracking-tight text-blue-950 sm:text-5xl">{stats.level.label}</h1>
    <p className="mt-4 text-lg text-slate-700">{highest ? "Metodiku nečteš. Metodika čte tebe." : "Metodika už před tebou začíná mít respekt."}</p>
    <button className="methodology-primary mt-7" type="button" onClick={onContinue}>Pokračovat <ChevronRight size={18}/></button>
  </div>;
}

function MethodologySaverOverlay({ employee, history, onClose, onAnswerSaved }) {
  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const initialHistoryRef = useRef(history);
  const [stage, setStage] = useState("intro");
  const [series, setSeries] = useState([]);
  const [seriesId, setSeriesId] = useState("");
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [sessionAnswers, setSessionAnswers] = useState([]);
  const [localHistory, setLocalHistory] = useState(history);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showLevelUp, setShowLevelUp] = useState(false);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const backgroundSiblings = [...(containerRef.current?.parentElement?.children || [])]
      .filter((element) => element !== containerRef.current)
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));
    backgroundSiblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";
    window.setTimeout(() => containerRef.current?.querySelector(focusableSelector)?.focus(), 0);
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const focusables = [...(containerRef.current?.querySelectorAll(focusableSelector) || [])];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", trapFocus);
      backgroundSiblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
      previousFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    window.setTimeout(() => containerRef.current?.querySelector("main button, main [tabindex]")?.focus(), 0);
  }, [stage, index]);

  const start = (count) => {
    initialHistoryRef.current = localHistory;
    setSeries(selectQuizQuestions({ questions, history: localHistory, count }));
    setSeriesId(globalThis.crypto?.randomUUID?.() || `SER-${Date.now()}`);
    setIndex(0); setSelectedId(""); setSessionAnswers([]); setFeedback(null); setError(""); setShowLevelUp(false); setStage("question");
  };
  const currentQuestion = series[index];
  const confirm = async () => {
    if (!selectedId || !currentQuestion) return;
    setBusy(true); setError("");
    try {
      const result = await api("/api/methodology-answers", { method: "POST", body: jsonBody({ questionId: currentQuestion.id, selectedAnswerId: selectedId, seriesId }) });
      const answer = result.answer || {
        questionId: currentQuestion.id,
        selectedAnswerId: selectedId,
        correct: isAnswerCorrect(currentQuestion, selectedId),
        topic: currentQuestion.topic,
        timestamp: new Date().toISOString(),
      };
      setFeedback(answer);
      setSessionAnswers((items) => [...items, answer]);
      setLocalHistory((items) => [...items, answer]);
      onAnswerSaved(answer);
      setStage("feedback");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };
  const continueAfterFeedback = () => {
    if (index < series.length - 1) {
      setIndex((value) => value + 1); setSelectedId(""); setFeedback(null); setError(""); setStage("question");
      return;
    }
    const upgraded = hasLevelUp(initialHistoryRef.current, localHistory);
    setShowLevelUp(upgraded);
    setStage(upgraded ? "level" : "result");
  };

  return <div ref={containerRef} className="methodology-overlay" role="dialog" aria-modal="true" aria-label="Metodický spořič" data-methodology-saver="true">
    <button type="button" className="methodology-close" onClick={onClose} aria-label="Zavřít metodický spořič"><X size={18}/> Zavřít</button>
    <main className="methodology-panel">
      {stage === "intro" && <SaverIntro history={localHistory} onStart={start}/>} 
      {stage === "question" && currentQuestion && <QuizQuestion question={currentQuestion} index={index} total={series.length} selectedId={selectedId} onSelect={setSelectedId} onConfirm={confirm} busy={busy} error={error}/>} 
      {stage === "feedback" && currentQuestion && feedback && <QuizFeedback question={currentQuestion} answer={feedback} isLast={index === series.length - 1} onContinue={continueAfterFeedback}/>} 
      {stage === "level" && showLevelUp && <LevelUp stats={calculateQuizStats(localHistory)} onContinue={() => setStage("result")}/>} 
      {stage === "result" && <QuizResult answers={sessionAnswers} fullHistory={localHistory} onAgain={() => start(QUIZ_SERIES_SIZES.standard)} onClose={onClose}/>} 
    </main>
    <div className="methodology-user" aria-hidden="true">{employee.name}</div>
  </div>;
}

export default function MethodologySaver({ employee, history = [], onAnswerSaved }) {
  const idle = useIdleMethodologySaver();
  return idle.visible ? <MethodologySaverOverlay employee={employee} history={history} onClose={idle.close} onAnswerSaved={onAnswerSaved}/> : null;
}
