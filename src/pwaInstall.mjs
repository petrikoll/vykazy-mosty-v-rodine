const INSTALL_STORAGE_KEY = "mosty-pwa-installed";

let deferredInstallPrompt = null;
const listeners = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function isStandalone(windowObject = globalThis.window, navigatorObject = globalThis.navigator) {
  return Boolean(
    windowObject?.matchMedia?.("(display-mode: standalone)")?.matches
    || windowObject?.matchMedia?.("(display-mode: fullscreen)")?.matches
    || navigatorObject?.standalone,
  );
}

export function getInstallPlatform(userAgent = globalThis.navigator?.userAgent || "") {
  if (/firefox/i.test(userAgent)) return /android/i.test(userAgent) ? "firefox-android" : "firefox-desktop";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "generic";
}

export function isInstallHidden(windowObject = globalThis.window, navigatorObject = globalThis.navigator) {
  if (isStandalone(windowObject, navigatorObject)) return true;
  try {
    return windowObject?.localStorage?.getItem(INSTALL_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredInstallPrompt = null;
  notifyListeners();
}

export function rememberInstalled(windowObject = globalThis.window) {
  try { windowObject?.localStorage?.setItem(INSTALL_STORAGE_KEY, "true"); } catch { /* Storage may be unavailable. */ }
  clearDeferredInstallPrompt();
}

export function subscribeToInstallState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    notifyListeners();
  });

  window.addEventListener("appinstalled", () => rememberInstalled(window));
}
