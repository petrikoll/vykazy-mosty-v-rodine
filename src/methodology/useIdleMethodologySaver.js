import { useEffect, useRef, useState } from "react";
import { createIdleTracker } from "./idleTracker.mjs";
import { METHODOLOGY_DEFER_RETRY_MS, METHODOLOGY_IDLE_TIMEOUT_MS } from "./quizConfig.mjs";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "pointerdown"];

function shouldDeferOverlay() {
  return document.visibilityState !== "visible"
    || !document.hasFocus()
    || document.body.dataset.criticalOperation === "true"
    || Boolean(document.querySelector('[role="dialog"]:not([data-methodology-saver="true"])'));
}

export function useIdleMethodologySaver() {
  const [visible, setVisible] = useState(false);
  const trackerRef = useRef(null);

  useEffect(() => {
    const tracker = createIdleTracker({
      timeoutMs: METHODOLOGY_IDLE_TIMEOUT_MS,
      deferRetryMs: METHODOLOGY_DEFER_RETRY_MS,
      shouldDefer: shouldDeferOverlay,
      onIdle: () => setVisible(true),
      onClose: () => setVisible(false),
    });
    trackerRef.current = tracker;
    let lastActivityAt = 0;
    const activity = () => {
      const timestamp = Date.now();
      if (timestamp - lastActivityAt < 350) return;
      lastActivityAt = timestamp;
      tracker.recordActivity();
    };
    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, activity, { passive: true }));
    document.addEventListener("scroll", activity, { passive: true, capture: true });
    window.addEventListener("focus", activity);
    document.addEventListener("visibilitychange", activity);
    tracker.start();
    return () => {
      tracker.stop();
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, activity));
      document.removeEventListener("scroll", activity, { capture: true });
      window.removeEventListener("focus", activity);
      document.removeEventListener("visibilitychange", activity);
      trackerRef.current = null;
    };
  }, []);

  return {
    visible,
    close: () => trackerRef.current?.closeOverlay(),
  };
}
