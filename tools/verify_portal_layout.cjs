// Visual/interaction check: every API response is isolated; no real records are used or written.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('artifacts/portal-layout');
const employees = [
  ['leader', 'Silvie Malíková', 'director', ['service-manager']],
  ['guarantor', 'Mgr. Martina Pírková', 'manager', ['expert-guarantor', 'case-manager']],
  ['worker', 'Iva Holcová', 'worker', ['peer-consultant']],
  ['worker2', 'Mgr. Jana Sedlářová', 'worker', ['psychologist']],
  ['pm', 'Petr Laštovica', 'project_manager', []],
].map(([id, name, appRole, positions]) => ({ id, name, appRole, active: true, globalFte: 1, assignments: positions.map(positionId => ({ id: `${id}-${positionId}`, positionId })) }));
const plans = employees.filter(e => e.appRole !== 'project_manager').map(employee => ({
  id: `plan-${employee.id}`, employeeId: employee.id, year: 2026, status: 'approved',
  goals: 'Rozvoj odborných dovedností v práci s rodinou.', needs: 'Průběžná odborná příprava.', needSources: ['job_requirements'],
  plannedActivities: [{ id: `activity-${employee.id}`, topic: 'Komunikace s rodinou v náročných situacích', accreditationNumber: 'AKR-2026-01', format: 'course', plannedDate: 'Q3', hours: 16, estimatedCost: 4800, status: 'planned' }],
  evaluation: 'Kurz byl absolvován a poznatky využíváme v praxi.', planDate: '2026-01-08', evaluationDate: '2026-12-15',
}));
const records = [employees[2], employees[3]].map(employee => ({ id: `record-${employee.id}`, employeeId: employee.id, employeeName: employee.name, title: 'Komunikace s rodinou v náročných situacích', provider: 'Vzdělávací centrum – zkušební data', dateFrom: '2026-09-01', dateTo: '2026-09-02', timeFrom: '09:00', timeTo: '17:00', format: 'Prezenční', hours: 16, plannedActivityId: `activity-${employee.id}`, plannedActivityTitle: 'Komunikace s rodinou', driveFileId: 'fixture-file' }));
const meetings = [
  { id: 'meeting-a', date: '2026-09-02', status: 'archived', createdBy: 'leader', createdByName: 'Silvie Malíková', participantIds: employees.map(e => e.id), participantNames: employees.map(e => e.name), notes: 'Tým se domluvil na přípravě příštího vzdělávání a společné supervize. Ověříme termíny a předáme podklady.\n\nToto jsou pouze zkušební údaje pro kontrolu zobrazení.', tasks: [
    { id: 'task-a', text: 'Ověřit termín společné supervize.', ownerIds: ['worker'], deadline: '2026-09-15', status: 'open' },
    { id: 'task-b', text: 'Doplnit podklady pro kurz.', ownerIds: ['guarantor'], deadline: '2026-09-05', status: 'completed', completedAt: '2026-09-04T09:00:00Z', completedByName: 'Mgr. Martina Pírková', completionText: 'Podklady jsou hotové. Poskytovatel potvrdil termín i cenu.\nDalší informace jsme předali celému týmu.', completionRecipientNames: ['Silvie Malíková'], completionRecipientIds: ['leader'] },
  ] },
  { id: 'meeting-b', date: '2026-09-04', status: 'draft', createdBy: 'leader', participantIds: ['leader'], participantNames: ['Silvie Malíková'], notes: 'Rozpracovaný zápis.', tasks: [] },
];

async function verify(browser, config, role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'cs-CZ', serviceWorkers: 'block' });
  await context.addInitScript(() => localStorage.setItem('mosty-portal-session-v1', 'layout-fixture'));
  const page = await context.newPage();
  page.on('dialog', async dialog => dialog.accept()); // Intentional navigation away from fixture drafts.
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  const employee = employees.find(e => e.appRole === role);
  const portal = {
    employee, employees, collaborators: employees, educationPlans: plans, educationRecords: records,
    employeeEvaluations: [], methodologyAnswers: [], meetings,
    workReports: employees.slice(1, 4).flatMap(owner => owner.assignments.map(assignment => ({
      id: `report-${assignment.id}`, employeeId: owner.id, employeeName: owner.name, assignmentId: assignment.id, positionId: assignment.positionId,
      positionName: config.positions.find(p => p.id === assignment.positionId).name, month: 9, year: 2026,
      status: owner.appRole === 'manager' ? 'submitted' : 'approved', submittedAt: '2026-09-04T10:00:00Z', workedHours: 32, absenceHours: 0, activities: [{ desc: 'Odborná práce s rodinou a příprava podkladů.', hours: 32 }],
    }))),
    supervisions: [{ id: 'supervision-a', date: '2026-09-03', type: 'team', timeFrom: '09:00', timeTo: '11:00', hours: 2, supervisor: 'Zkušební supervizor', participantIds: employees.map(e => e.id), participantNames: employees.map(e => e.name) }],
    google: { sheetsConfigured: true, driveConfigured: true, driveConnected: true, driveOAuthConfigured: true, driveAccountEmail: 'test@example.com' },
  };
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() !== 'GET') { writes.push(request.url()); return route.fulfill({ status: 403, json: { error: 'Verification blocks writes.' } }); }
    const responses = { '/api/config': config, '/api/setup/status': { needsSetup: false }, '/api/auth/options': employees, '/api/portal': portal, '/api/push/config': { configured: false } };
    const url = new URL(request.url());
    assert.ok(url.pathname in responses, `Unexpected read: ${url.pathname}`);
    return route.fulfill({ json: responses[url.pathname] });
  });
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.locator('.splash-screen').waitFor({ state: 'detached' });
  const nav = label => page.getByRole('navigation', { name: 'Hlavní nabídka' }).getByRole('button', { name: label, exact: true }).click();
  async function capture(name) {
    for (const [size, width, height] of [['desktop', 1440, 960], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${role}/${name}/${size}: ${overflow}px overflow`);
      await page.screenshot({ path: path.join(output, `${role}-${name}-${size}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.setViewportSize({ width: 1440, height: 960 });
    assert.deepEqual(errors, []);
  }
  await nav('Výkazy práce');
  await capture('reports');
  if (role !== 'worker') {
    const upload = page.getByRole('region', { name: /Hromadné nahrání podepsaných výkazů/ });
    const disclosure = upload.getByRole('button', { name: /Hromadné nahrání/ });
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
    await disclosure.focus(); await page.keyboard.press('Enter');
    await upload.locator('input[type=file]').setInputFiles({ name: 'Zkušební výkaz.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-fixture') });
    await disclosure.click(); await disclosure.click();
    assert.equal(await upload.locator('input[type=file]').evaluate(e => e.files[0].name), 'Zkušební výkaz.pdf');
    await capture('upload');
    if (role !== 'project_manager') { await page.getByRole('button', { name: 'Můj výkaz', exact: true }).click(); await capture('own-report'); }
  }
  await nav('Vzdělávání');
  await capture('education');
  if (role !== 'worker') {
    await page.getByRole('button', { name: 'Vzdělávací plány týmu', exact: true }).click();
    await capture('plans');
    await page.getByRole('button', { name: 'Otevřít plán', exact: true }).first().click();
    await capture('plan-dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true }).click();
    await page.getByRole('button', { name: 'Roční vyhodnocení', exact: true }).first().click();
    await capture('evaluation-dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true }).click();
    await page.getByRole('button', { name: 'Uskutečněné vzdělávání', exact: true }).click();
    await capture('education-records');
    const add = page.getByRole('region', { name: /Zapsat absolvované vzdělávání/ });
    const toggle = add.getByRole('button', { name: /Zapsat absolvované vzdělávání/ });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    await add.getByRole('textbox', { name: 'Název', exact: true }).fill('Rozpracovaný kurz');
    await toggle.click(); await toggle.click();
    assert.equal(await add.getByRole('textbox', { name: 'Název', exact: true }).inputValue(), 'Rozpracovaný kurz');
    await capture('education-form');
  } else {
    assert.equal(await page.getByRole('button', { name: 'Uložit záznam', exact: true }).count(), 0);
  }
  await nav('Supervize'); await capture('supervisions');
  if (role !== 'worker') {
    await page.getByRole('button', { name: 'Přidat supervizi', exact: true }).click();
    await capture('supervision-form');
    await page.getByRole('button', { name: 'Zpět na přehled', exact: true }).click();
  }
  await nav('Porady'); await capture('meetings');
  await page.getByRole('button', { name: 'Zobrazit zápis', exact: true }).last().click();
  const result = page.getByRole('dialog').locator('details');
  assert.equal(await result.getAttribute('open'), null);
  await result.locator('summary').click();
  assert.notEqual(await result.getAttribute('open'), null);
  await capture('meeting-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Zavřít', exact: true }).first().click();
  if (role !== 'worker') {
    await page.getByRole('button', { name: 'Vytvořit zápis', exact: true }).click();
    await capture('meeting-form');
    await page.getByRole('button', { name: 'Dashboard týmu', exact: true }).click(); await capture('team-dashboard');
  }
  if (['director', 'project_manager'].includes(role)) {
    await nav('Pracovníci a nastavení'); await capture('settings');
    const add = page.getByRole('region', { name: /Přidat pracovníka/ });
    await add.getByRole('button', { name: /Přidat pracovníka.*Rozbalit/ }).click();
    await capture('settings-add');
    await page.getByRole('button', { name: 'Upravit pracovníka', exact: true }).first().click();
    await capture('settings-edit');
  }
  assert.deepEqual(errors, []); assert.deepEqual(writes, []);
  console.log(`${role}: all pages, disclosures, retained forms, desktop/mobile, read-only permissions passed; no API writes.`);
  await context.close();
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const config = await fetch('http://127.0.0.1:5174/api/config').then(response => response.json());
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { for (const role of (process.env.LAYOUT_ROLES?.split(',') || ['director', 'worker', 'manager', 'project_manager'])) await verify(browser, config, role); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
