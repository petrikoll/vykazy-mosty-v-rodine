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

  if (!supported) return null;

  const enableOrTest = async () => {
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
      const result = await api("/api/push/test", { method: "POST" });
      setMessage(result.sent > 0
        ? { type: "success", text: "Zkušební upozornění bylo odesláno." }
        : { type: "error", text: "Zařízení je přihlášené, ale upozornění se nepodařilo doručit." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button variant="secondary" className="px-2.5" disabled={busy} onClick={enableOrTest} title={enabled ? "Upozornění jsou zapnutá; kliknutím odešlete zkoušku" : "Zapnout upozornění i při zavřené aplikaci"} aria-label={enabled ? "Vyzkoušet upozornění" : "Zapnout upozornění"}>
      {enabled ? <BellRing size={16}/> : <Bell size={16}/>}<span className="ml-2 hidden xl:inline">{enabled ? "Upozornění zapnuta" : "Zapnout upozornění"}</span>
    </Button>
    {message && <div className={`fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`} role="status">{message.text}</div>}
  </>;
}
