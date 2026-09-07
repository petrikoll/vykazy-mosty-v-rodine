// Isolated API fixtures. No real account, Sheet or Drive is modified.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const config = await import('../src/projectConfig.mjs');
  const employees = [
    ['manager', 'Garant Testový', 'manager', ['expert-guarantor', 'mediator']],
    ['director', 'Vedoucí Testová', 'director', ['service-manager']],
    ['worker', 'Psycholog Testový', 'worker', ['psychologist']],
    ['peer', 'Peer Testový', 'worker', ['peer-consultant']],
    ['pm', 'Projektový Testový', 'project_manager', []],
  ].map(([id, name, appRole, ids]) => ({ id, name, appRole, active: true, assignments: ids.map(positionId => ({ id: `${id}-${positionId}`, positionId })) }));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const id of ['manager', 'peer', 'worker']) {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 960 } });
      await context.addInitScript(() => localStorage.setItem('mosty-portal-session-v1', 'fixture-only'));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const portal = { employee: employees.find(p => p.id === id), employees, collaborators: employees,
        workReports: [], methodologyAnswers: [], employeeEvaluations: [],
        educationPlans: employees.map(e => ({ id: `plan-${e.id}`, employeeId: e.id, year: 2026, status: 'approved', plannedActivities: [] })),
        educationRecords: [],
        meetings: [{ id: 'meeting', date: '2026-09-01', status: 'archived', createdBy: 'director', participantIds: ['manager'], tasks: [] }],
        supervisions: [{ id: 'supervision', date: '2026-09-01', participantIds: ['manager'], participantNames: ['Garant Testový'], type: 'team', hours: 2 }],
        google: { sheetsConfigured: true, driveConfigured: true, driveConnected: true } };
      await page.route('**/api/**', route => {
        assert.equal(route.request().method(), 'GET', 'no writes in this UI check');
        const data = { '/api/config': { project: config.PROJECT, positions: config.POSITIONS, keyActivities: config.KEY_ACTIVITIES }, '/api/setup/status': { needsSetup: false }, '/api/auth/options': employees, '/api/portal': portal, '/api/push/config': { configured: false } };
        return route.fulfill({ json: data[new URL(route.request().url()).pathname] || {} });
      });
      await page.goto('http://127.0.0.1:5176/', { waitUntil: 'networkidle' });
      const nav = page.getByRole('navigation');
      await nav.waitFor();
      const navigate = name => nav.getByRole('button', { name, exact: true }).click();
      if (id === 'manager') {
        await navigate('Pracovníci a nastavení');
        await page.getByRole('button', { name: 'Upravit pracovníka', exact: true }).first().click();
        assert(await page.getByRole('button', { name: 'Smazat pracovníka', exact: true }).isVisible());
        await navigate('Porady');
        assert(await page.getByRole('button', { name: 'Smazat', exact: true }).isVisible());
        assert.equal(await page.getByRole('button', { name: 'Opravit zápis', exact: true }).count(), 0, 'deletion access does not grant editing archived meetings');
        await navigate('Supervize');
        assert(await page.getByRole('button', { name: 'Smazat', exact: true }).isVisible());
        await navigate('Vzdělávání');
        await page.getByRole('button', { name: 'Vzdělávací plány týmu', exact: true }).click();
        const body = page.locator('main table tbody');
        assert.equal(await body.locator('tr').count(), 2, 'only guarantor and HPP direct worker appear');
        assert.equal(await body.getByText('Peer Testový', { exact: true }).count(), 0);
        assert.equal(await body.getByText('Vedoucí Testová', { exact: true }).count(), 0);
        assert.equal(await body.getByRole('button', { name: 'Smazat plán', exact: true }).count(), 2);
        await page.getByRole('button', { name: 'Uskutečněné vzdělávání', exact: true }).click();
        await page.getByRole('button', { name: /Zapsat absolvované vzdělávání/ }).click();
        assert.equal(await page.getByRole('combobox', { name: 'Pracovník', exact: true }).locator('option').count(), 2);
      } else {
        assert.equal(await nav.getByRole('button', { name: 'Pracovníci a nastavení', exact: true }).count(), 0);
        assert.equal(await nav.getByRole('button', { name: 'Vzdělávání', exact: true }).count(), id === 'worker' ? 1 : 0);
        if (id === 'peer') assert.equal(await page.getByRole('button', { name: 'Vzdělávací plán', exact: true }).count(), 0);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Guarantor settings/deletion, unchanged archived-meeting editing, eligible education lists and worker navigation passed. No API writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
