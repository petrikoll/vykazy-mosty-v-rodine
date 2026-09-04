// Fixture-only browser check: no real employee records or API writes.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const questions = require('../src/methodology/quizQuestions.generated.json');

(async () => {
  const projectConfig = await import('../src/projectConfig.mjs');
  const config = { project: projectConfig.PROJECT, positions: projectConfig.POSITIONS, keyActivities: projectConfig.KEY_ACTIVITIES };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const count of [10, 60]) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        localStorage.setItem('mosty-portal-session-v1', 'fixture-only');
        document.hasFocus = () => true;
      });
      const page = await context.newPage();
      await page.clock.install();
      const employee = { id: 'fixture', name: 'Jana Testová', appRole: 'worker', active: true, assignments: [] };
      const history = questions.slice(0, count).map((q, i) => ({ id: `answer-${i}`, questionId: q.id, timestamp: new Date(2026, 0, 1, 0, i).toISOString(), correct: true, topic: q.topic }));
      const portal = { employee, employees: [employee], collaborators: [employee], educationPlans: [], educationRecords: [], employeeEvaluations: [], workReports: [], supervisions: [], meetings: [], methodologyAnswers: history, google: {} };
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => {
        assert.equal(route.request().method(), 'GET', 'this check never writes data');
        const data = { '/api/config': config, '/api/setup/status': { needsSetup: false }, '/api/auth/options': [employee], '/api/portal': portal, '/api/push/config': { configured: false } };
        const key = new URL(route.request().url()).pathname;
        assert(key in data, key);
        return route.fulfill({ json: data[key] });
      });
      await page.goto(process.env.QUIZ_TEST_URL || 'http://127.0.0.1:5176/', { waitUntil: 'networkidle' });
      await page.clock.fastForward(4000);
      await page.getByRole('navigation').waitFor();
      await page.clock.fastForward(185000);
      const overlay = page.getByRole('dialog', { name: 'Metodický spořič' });
      await overlay.waitFor();
      assert.equal(await overlay.getByRole('progressbar').getAttribute('aria-valuenow'), String(count));
      assert.equal(await overlay.getByRole('progressbar').getAttribute('aria-valuemax'), '60');
      await overlay.getByText(`${count} z 60 různých otázek`, { exact: true }).waitFor();
      await overlay.getByText(count === 10 ? 'Nováček' : 'Šprt metodiky', { exact: true }).waitFor();
      fs.mkdirSync('artifacts/methodology-progress', { recursive: true });
      await page.screenshot({ path: `artifacts/methodology-progress/${count}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `artifacts/methodology-progress/${count}-mobile.png`, fullPage: true });
      await overlay.getByRole('button', { name: 'Dát si 3 otázky' }).click();
      await overlay.getByText('Otázka 1 ze 3 v této sérii', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('Quiz UI: 10/60 and 60/60 progress, awards, series label and mobile layout passed. No API writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
