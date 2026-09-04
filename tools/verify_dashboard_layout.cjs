// Local visual check with isolated API fixtures; no personnel records are written.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const output = path.resolve('artifacts/dashboard-layout');
const employees = [
  { id: 'leader', name: 'Silvie Malíková', appRole: 'director', assignments: [{ id: 'leader-position', positionId: 'service-lead' }] },
  { id: 'worker', name: 'Iva Holcová', appRole: 'worker', assignments: [{ id: 'worker-position', positionId: 'peer' }] },
  { id: 'project-manager', name: 'Petr Laštovica', appRole: 'project_manager', assignments: [] },
];
const config = {
  project: { name: 'Mosty v rodině', startDate: '2026-01-01', endDate: '2028-12-31' },
  positions: [
    { id: 'service-lead', name: 'Vedoucí služby/programu', reportRequired: true },
    { id: 'peer', name: 'Peer konzultant', reportRequired: true },
  ],
};

async function verify(browser, employee) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'cs-CZ', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failCompletion = true;
  let completionCount = 0;
  const meetings = [{
    id: 'fixture-meeting', date: '2026-09-02', status: 'archived',
    tasks: [
      { id: 'task-1', text: 'Připravit podklady pro příští poradu a doplnit termíny plánovaných aktivit.', ownerIds: [employee.id], deadline: '2026-09-09', status: 'open' },
      { id: 'task-2', text: 'Ověřit možnosti spolupráce s návaznými službami a předat týmu kontakty i doporučený postup pro společná setkání.', ownerIds: [employee.id, 'worker'], deadline: '2026-09-15', status: 'open' },
      { id: 'completed-1', text: 'Doplnit podklady k plánovanému vzdělávání.', status: 'completed', completedByName: 'Mgr. Martina Pírková', completedAt: '2026-09-04T12:30:00Z', completionRecipientIds: ['leader', 'worker'], completionText: 'Podklady jsou doplněné a předané ke kontrole.\nTermín školení byl potvrzen, osvědčení dodáme po jeho absolvování.\nKontakt a další postup jsme ověřili u poskytovatele.' },
      { id: 'private-completed', text: 'Řešení určené jinému příjemci', status: 'completed', completionRecipientIds: ['someone-else'], completionText: 'Nesmí být vidět.' },
    ],
  }];
  const portal = () => ({ employee, employees, collaborators: employees, meetings, educationPlans: [], educationRecords: [], employeeEvaluations: [], workReports: [], supervisions: [], methodologyAnswers: [], google: { driveConnected: true } });
  await context.addInitScript(() => localStorage.setItem('mosty-portal-session-v1', 'local-ui-fixture'));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/complete') && request.method() === 'PATCH') {
      completionCount += 1;
      const body = request.postDataJSON();
      assert.equal(body.completionText, 'Podklady jsou připravené.');
      assert.deepEqual(body.recipientIds, ['leader']);
      if (failCompletion) return route.fulfill({ status: 500, json: { error: 'Zkušební chyba uložení' } });
      Object.assign(meetings[0].tasks[0], { status: 'completed', completionText: body.completionText, completionRecipientIds: body.recipientIds, completedByName: employee.name, completedAt: new Date().toISOString() });
      return route.fulfill({ json: { success: true } });
    }
    assert.equal(request.method(), 'GET', `Unexpected write: ${request.method()} ${url.pathname}`);
    const responses = {
      '/api/setup/status': { needsSetup: false },
      '/api/config': config,
      '/api/auth/options': employees,
      '/api/portal': portal(),
      '/api/push/config': { configured: false },
    };
    if (!(url.pathname in responses)) throw new Error(`Unexpected API request: ${url.pathname}`);
    return route.fulfill({ json: responses[url.pathname] });
  });
  await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.locator('.splash-screen').waitFor({ state: 'detached' });
  const pending = page.getByRole('region', { name: 'Úkoly k vyřízení', exact: true });
  const reminders = page.getByRole('region', { name: 'Ostatní připomenutí', exact: true });
  await pending.waitFor();
  assert.equal(await pending.locator('article').count(), 2);
  assert.equal(await pending.getByText(/vzdělávací plán/).count(), 0);
  assert.equal(await reminders.count(), 1);
  assert.equal(await page.getByText('Řešení určené jinému příjemci', { exact: true }).count(), 0);
  if (employee.appRole === 'project_manager') {
    assert.equal(await reminders.getByText(/plány nejsou založeny/).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Doručená řešení úkolů' }).count(), 0);
  } else {
    const results = page.getByRole('region', { name: 'Doručená řešení úkolů' });
    const result = results.locator('details').first();
    assert.equal(await result.getAttribute('open'), null);
    await result.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.notEqual(await result.getAttribute('open'), null);
    assert.equal(await result.locator('p').isVisible(), true);
    await page.keyboard.press('Enter');
    assert.equal(await result.getAttribute('open'), null);
  }
  await page.screenshot({ path: path.join(output, `${employee.id}-desktop.png`), fullPage: true });
  const firstTask = pending.locator('article').first();
  const resolve = firstTask.getByRole('button', { name: 'Vyřídit', exact: true });
  await resolve.click();
  assert.equal(await resolve.getAttribute('aria-expanded'), 'true');
  const submit = firstTask.getByRole('button', { name: 'Splnit úkol a odeslat', exact: true });
  assert.equal(await submit.isDisabled(), true);
  await firstTask.getByRole('textbox', { name: 'Jak byl úkol vyřízen?' }).fill('Podklady jsou připravené.');
  await firstTask.getByRole('checkbox', { name: 'Silvie Malíková', exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await pending.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${employee.id}-mobile-form.png`), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow on mobile');
  await submit.click();
  await firstTask.getByRole('alert').waitFor();
  assert.equal(await firstTask.getByRole('textbox').inputValue(), 'Podklady jsou připravené.');
  failCompletion = false;
  await submit.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby] article').length === 1);
  assert.equal(await pending.locator('article').count(), 1);
  assert.equal(completionCount, 2);
  assert.deepEqual(errors, []);
  console.log(`${employee.appRole}: grouping, recipient visibility, disclosure, mobile layout, completion and retry passed.`);
  await context.close();
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { for (const employee of employees) await verify(browser, employee); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
