// All API writes are mocked. This does not modify the live Sheet or Drive.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const config = await fetch("http://127.0.0.1:5174/api/config").then(r => r.json());
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: "block", locale: "cs-CZ" });
  await context.addInitScript(() => localStorage.setItem("mosty-portal-session-v1", "fixture-only"));
  const page = await context.newPage();
  const leader = { id: "leader", name: "Vedoucí Testová", appRole: "director", active: true, assignments: [] };
  const worker = { id: "worker", name: "Jana Testová", appRole: "worker", active: true, assignments: [] };
  const portal = { employee: leader, employees: [leader, worker], collaborators: [leader, worker],
    educationPlans: [{ id: "plan", employeeId: "worker", year: 2026, status: "approved", goals: "Původní cíl", plannedActivities: [] }],
    educationRecords: [], employeeEvaluations: [], workReports: [], supervisions: [], methodologyAnswers: [],
    meetings: [{ id: "meeting", date: "2026-09-01", status: "submitted", notes: "Zkušební porada", tasks: [{ id: "task", text: "Ověřit podklady", ownerIds: ["leader"], deadline: "2026-09-20", status: "open" }] }],
    google: { sheetsConfigured: true, driveConfigured: true },
  };
  let failSave = true;
  let accept = false;
  const dialogs = [], errors = [], requests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => { dialogs.push(dialog.type()); await (accept ? dialog.accept() : dialog.dismiss()); });
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === "GET") {
      const data = { "/api/config": config, "/api/setup/status": { needsSetup: false }, "/api/auth/options": [leader, worker], "/api/portal": portal, "/api/push/config": { configured: false } };
      assert(url.pathname in data, url.pathname);
      return route.fulfill({ json: data[url.pathname] });
    }
    requests.push(url.pathname);
    if (failSave) return route.fulfill({ status: 503, json: { error: "Zkušební výpadek ukládání" } });
    if (url.pathname === "/api/meetings") {
      return route.fulfill({ json: { meeting: { id: "saved-fixture", date: "2026-09-05", status: "draft" } } });
    }
    return route.fulfill({ json: {} });
  });
  try {
    await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
    await page.locator(".splash-screen").waitFor({ state: "detached" });
    const nav = name => page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
    // Task solution is retained when leaving is cancelled, even after a failed save.
    await page.getByRole("button", { name: "Vyřídit", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Jak byl úkol vyřízen?" }).fill("Zkušební řešení");
    await nav("Porady");
    assert.equal(dialogs.at(-1), "confirm");
    assert.equal(await page.getByRole("textbox", { name: "Jak byl úkol vyřízen?" }).inputValue(), "Zkušební řešení");
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true }))), true);
    await page.reload({ timeout: 10000 }).catch(() => undefined);
    assert.equal(dialogs.at(-1), "beforeunload", "browser reload asks before discarding a draft");
    assert.equal(await page.getByRole("textbox", { name: "Jak byl úkol vyřízen?" }).inputValue(), "Zkušební řešení");
    accept = true; await nav("Porady"); accept = false;
    await page.getByRole("button", { name: "Vytvořit zápis", exact: true }).click();
    const notes = page.getByRole("textbox", { name: "Zápis", exact: false });
    await notes.fill("Text nesmí zmizet při chybě ani při odmítnutí odchodu.");
    await page.getByRole("button", { name: "Zpět do archivu", exact: true }).click();
    assert(await notes.isVisible());
    await page.getByRole("button", { name: /Uložit koncept/ }).click();
    await page.getByRole("alert").filter({ hasText: "Zkušební výpadek" }).waitFor();
    assert.match(await notes.inputValue(), /nesmí zmizet/);
    await nav("Vzdělávání");
    assert(await notes.isVisible());
    failSave = false;
    await page.getByRole("button", { name: /Uložit koncept/ }).click();
    await page.getByRole("button", { name: "Vytvořit zápis", exact: true }).waitFor();
    const previousDialogs = dialogs.length;
    await nav("Vzdělávání");
    assert.equal(dialogs.length, previousDialogs, "successful save clears leave warning");
    await page.getByRole("button", { name: "Vzdělávací plány týmu", exact: true }).click();
    await page.getByRole("button", { name: "Otevřít plán", exact: true }).last().click();
    await page.getByRole("dialog").getByRole("textbox", { name: "V čem se potřebuji v tomto roce rozvíjet?" }).fill("Neuložený cíl");
    await page.keyboard.press("Escape");
    assert(await page.getByRole("dialog").isVisible());
    await page.getByRole("dialog").getByRole("button", { name: "Zavřít", exact: true }).click();
    assert(await page.getByRole("dialog").isVisible());
    accept = true; await page.keyboard.press("Escape"); accept = false;
    await page.getByRole("button", { name: "Uskutečněné vzdělávání", exact: true }).click();
    const add = page.getByRole("region", { name: /Zapsat absolvované vzdělávání/ });
    await add.getByRole("button", { name: /Zapsat absolvované vzdělávání/ }).click();
    await add.getByRole("textbox", { name: "Název", exact: true }).fill("Neuložený kurz");
    const person = add.getByRole("combobox", { name: "Pracovník", exact: true });
    await person.selectOption("leader");
    assert.equal(await person.inputValue(), "worker");
    assert.equal(await add.getByRole("textbox", { name: "Název", exact: true }).inputValue(), "Neuložený kurz");
    accept = true; await nav("Pracovníci a nastavení"); accept = false;
    await page.getByRole("button", { name: "Upravit pracovníka", exact: true }).first().click();
    const name = page.getByRole("textbox").first();
    await name.fill("Změněné jméno");
    await page.getByRole("button", { name: "Zrušit", exact: true }).click();
    assert.equal(await name.inputValue(), "Změněné jméno");
    accept = true; await nav("Přehled úkolů"); accept = false;
    assert.equal(await page.locator('script[src*="cdn.tailwindcss"]').count(), 0);
    assert.equal(await page.locator("aside").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(23, 37, 84)");
    fs.mkdirSync(path.resolve("artifacts/release-safety"), { recursive: true });
    await page.screenshot({ path: path.resolve("artifacts/release-safety/local-css-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.resolve("artifacts/release-safety/local-css-mobile.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("Release UI: guarded navigation/close/Escape, failure retention, successful save reset, worker switch, local CSS, mobile passed. API writes mocked:", requests.length);
  } finally { accept = true; await context.close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
