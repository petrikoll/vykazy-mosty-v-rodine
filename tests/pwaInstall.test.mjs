import assert from "node:assert/strict";
import { getInstallPlatform, isInstallHidden, isStandalone } from "../src/pwaInstall.mjs";

assert.equal(getInstallPlatform("Mozilla/5.0 Firefox/143.0"), "firefox-desktop");
assert.equal(getInstallPlatform("Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0"), "firefox-android");
assert.equal(getInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "ios");
assert.equal(getInstallPlatform("Mozilla/5.0 Chrome/140.0"), "generic");

const standaloneWindow = { matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" }) };
const browserWindow = { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null } };
const rememberedWindow = { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => "true" } };

assert.equal(isStandalone(standaloneWindow, {}), true);
assert.equal(isStandalone(browserWindow, {}), false);
assert.equal(isInstallHidden(standaloneWindow, {}), true);
assert.equal(isInstallHidden(browserWindow, {}), false);
assert.equal(isInstallHidden(rememberedWindow, {}), true);

console.log("PWA install tests passed.");
