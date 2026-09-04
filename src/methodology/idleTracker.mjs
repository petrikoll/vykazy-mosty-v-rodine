export function createIdleTracker({
  timeoutMs,
  deferRetryMs = 15000,
  onIdle,
  onClose,
  shouldDefer = () => false,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timer = null;
  let overlayActive = false;
  let stopped = false;

  const clear = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = (delay = timeoutMs) => {
    if (stopped || overlayActive) return;
    clear();
    timer = setTimer(() => {
      timer = null;
      if (stopped || overlayActive) return;
      if (shouldDefer()) {
        schedule(deferRetryMs);
        return;
      }
      overlayActive = true;
      onIdle();
    }, delay);
  };

  return {
    start() { stopped = false; schedule(); },
    recordActivity() { if (!overlayActive && !stopped) schedule(); },
    closeOverlay() {
      if (!overlayActive) return;
      overlayActive = false;
      onClose?.();
      schedule();
    },
    stop() { stopped = true; clear(); },
    isOverlayActive() { return overlayActive; },
  };
}

