import React, { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { api, jsonBody } from "../api.mjs";
import { Button } from "./Common.jsx";

function applicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export default function PushNotificationButton({ employeeId }) {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [test, setTest] = useState(null);

  useEffect(() => {
    let active = true;
    if (!supported) return undefined;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => { if (active) setEnabled(Boolean(subscription)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [employeeId, supported]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(null), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!showTest || test?.state !== "scheduled") return undefined;
    const timer = window.setInterval(() => {
      api("/api/push/test").then(result => setTest(result.test)).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [showTest, test?.state]);

  if (!supported) return null;

  const enableOrTest = async (delayed = false) => {
    setBusy(true);
    try {
      if (!enabled) {
        const config = await api("/api/push/config");
        if (!config.configured || !config.publicKey) throw new Error("Server ještě nemá nastavené klíče pro upozornění.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Povolte upozornění v nastavení prohlížeče.");
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey),
        });
        await api("/api/push/subscriptions", { method: "POST", body: jsonBody(subscription.toJSON()) });
        setEnabled(true);
      }
      // Register even an existing browser subscription for the current employee.
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("Nejprve povolte upozornění na tomto zařízení.");
      if (enabled) await api("/api/push/subscriptions", { method: "POST", body: jsonBody(subscription.toJSON()) });
      const result = await api("/api/push/test", { method: "POST", body: jsonBody({ delayed }) });
      if (delayed) { setTest(result.test); return; }
      setMessage(result.sent > 0
        ? { type: "success", text: "Odesláno push službě. Ověřte, že se oznámení skutečně zobrazilo." }
        : { type: "error", text: "Zařízení je přihlášené, ale upozornění se nepodařilo doručit." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button variant="header" compact disabled={busy} onClick={() => setShowTest(value => !value)} title="Nastavení a zkouška upozornění" aria-label={enabled ? "Vyzkoušet upozornění" : "Zapnout upozornění"} aria-expanded={showTest}>
      <span className="relative inline-flex">
        {enabled ? <BellRing size={15}/> : <Bell size={15}/>}
        <span className={`absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-300" : "bg-amber-300"}`} aria-hidden="true"/>
      </span>
      <span className="ml-1.5 hidden xl:inline">Upozornění</span>
    </Button>
    {showTest && <div className="fixed right-3 top-20 z-[80] w-[min(360px,calc(100vw-24px))] rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-800 shadow-xl" role="region" aria-label="Zkouška upozornění">
      <div className="mb-2 flex items-center justify-between"><strong>Upozornění</strong><button type="button" onClick={() => setShowTest(false)} aria-label="Zavřít nastavení upozornění" className="px-2 py-1">✕</button></div>
      <p className="mb-3 text-xs leading-5">Zkoušku při zavřené aplikaci odešleme za 20 sekund. Zavřete všechna okna portálu, ale nevypínejte počítač ani prohlížeč. Příjem závisí také na nastavení oznámení systému.</p>
      <div className="flex flex-wrap gap-2"><Button compact variant="secondary" disabled={busy} onClick={() => enableOrTest(false)}>{enabled ? "Zkouška ihned" : "Povolit a vyzkoušet"}</Button><Button compact disabled={busy || !enabled || test?.state === "scheduled"} onClick={() => enableOrTest(true)}>Zkouška za 20 sekund</Button></div>
      {test && <p className="mt-3 text-xs" role="status">{test.state === "scheduled" ? "Zkouška je připravená. Nyní zavřete okno aplikace." : test.state === "sent" ? "Push služba oznámení přijala. Skutečné zobrazení prosím ověřte na zařízení." : "Odeslání se nepodařilo. Zkuste znovu zapnout upozornění."}</p>}
    </div>}
    {message && <div className={`fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`} role="status">{message.text}</div>}
  </>;
}
