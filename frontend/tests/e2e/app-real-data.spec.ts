import { test, expect, type Page } from '@playwright/test';

// Strict integration tests: the React app MUST consume the real IRCO backend.
// No lenient fallbacks — every assertion is exact. Backend on :3081, app on :5174.
const APP_BASE = 'http://localhost:5174';

const skipIntro = () => {
  sessionStorage.setItem('icorp-intro-done', 'true');
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(skipIntro);
});

/**
 * Sidebar navigation helper. The holographic hull rotates continuously and
 * framer-motion re-renders on hover/tap, so a press can land mid-animation
 * and be swallowed. Perform a real press-and-hold gesture, verify the button
 * actually became the active one (aria-current="page"), and click again the
 * way a persistent user would if the first press missed.
 */
const navClick = async (page: Page, testId: string) => {
  const nav = page.getByTestId(`nav-${testId}`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await nav.boundingBox();
    if (!box) throw new Error(`nav button ${testId} is not visible`);
    // Press on the icon/label zone (left part of the row), like a real user.
    // The exact geometric centre can fall outside Chromium's 3D hit-test
    // projection when preserve-3d + perspective are used (see frontdev.md §13.2).
    const x = box.x + Math.min(24, box.width / 4);
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    try {
      await expect(nav).toHaveAttribute('aria-current', 'page', { timeout: 1500 });
      return;
    } catch {
      // Press missed (3D hit-test seam) — press again.
    }
  }
  throw new Error(`nav button ${testId} did not activate after 4 presses`);
};

test('app issues real network calls to the IRCO dashboard API', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/dashboard')) calls.push(r.url());
  });
  await page.goto(APP_BASE);
  await expect(page.getByTestId('global-level-badge')).toBeVisible({ timeout: 15000 });
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.some((u) => u.includes('mode=demo'))).toBeTruthy();
  expect(calls.some((u) => u.includes('scenario=a01'))).toBeTruthy();
  expect(calls.some((u) => u.includes('day=1'))).toBeTruthy();
});

test('day 1 shows heart_rate = 62 from the backend (never the old hardcoded 68)', async ({ page }) => {
  await page.goto(APP_BASE);
  await expect(page.getByTestId('metric-heart-rate')).toHaveText('62', { timeout: 15000 });
  // No invented mission or crew identity anywhere.
  await expect(page.getByText('Apollo-7')).toHaveCount(0);
  await expect(page.getByText('Stafford')).toHaveCount(0);
  // Provenance pill reflects the API data_class, not a fake MEASURED_REAL claim.
  await expect(page.getByText('DATA: SYNTHETIC')).toBeVisible();
});

test('demo cockpit shows no NO DATA card (all 18 indicators are filled)', async ({ page }) => {
  await page.goto(`${APP_BASE}/?day=117`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('RED', { timeout: 15000 });
  // The demo scenario fills every registry indicator: nothing may render as
  // NO DATA or "···" once the dashboard has loaded.
  await expect(page.getByText('NO DATA')).toHaveCount(0);
  await expect(page.getByText('···')).toHaveCount(0);
});

test('crew health evidence cards show the real environment series (no UNAVAILABLE)', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${APP_BASE}/?day=117`);
  await navClick(page, 'crew-health');
  const xray = page.getByTestId('evidence-xray_flux_short');
  await expect(xray).toBeVisible({ timeout: 15000 });
  // xray_flux_short is now part of the synthetic demo (unit W/m2) and the
  // card must show a real number, never UNAVAILABLE or a fabricated 0.
  await expect(xray).toContainText('W/m2');
  await expect(xray).not.toContainText('UNAVAILABLE');
  await expect(xray).not.toContainText(/^0$/);
});

test('day 1 vital KPIs now carry the real backend series (never NO DATA by default)', async ({ page }) => {
  await page.goto(APP_BASE);
  await expect(page.getByTestId('kpi-spo2')).toHaveText('98', { timeout: 15000 });
  await expect(page.getByTestId('kpi-temp')).toHaveText('36.6');
  await expect(page.getByTestId('metric-blood-pressure')).toHaveText('118/76');
});

test('global vigilance badge comes from global.level (day 1 = green)', async ({ page }) => {
  await page.goto(APP_BASE);
  await expect(page.getByTestId('global-level-badge')).toHaveText('GREEN', { timeout: 15000 });
  await expect(page.getByTestId('mission-id')).toContainText('IRCO-DEMO');
});

test('deep-link day=97 shows amber level and the real backend value 65.2', async ({ page }) => {
  await page.goto(`${APP_BASE}/?day=97`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('AMBER', { timeout: 15000 });
  await expect(page.getByTestId('metric-heart-rate')).toHaveText('65.2');
  await expect(page.getByTestId('day-label')).toHaveText(/Day\s*97/i);
});

test('deep-link day=117 shows red level', async ({ page }) => {
  await page.goto(`${APP_BASE}/?day=117`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('RED', { timeout: 15000 });
});

test('day navigation refetches from the API', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/dashboard')) calls.push(r.url());
  });
  await page.goto(APP_BASE);
  await expect(page.getByTestId('global-level-badge')).toBeVisible({ timeout: 15000 });
  const before = calls.length;
  await page.getByTestId('day-next').click();
  await expect(page.getByTestId('day-label')).toHaveText(/Day\s*2/i);
  expect(calls.length).toBeGreaterThan(before);
});

test('Medical Alerts view renders the real red-day alert and triggered rules', async ({ page }) => {
  test.setTimeout(60000);
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/dashboard')) calls.push(r.url());
  });
  await page.goto(`${APP_BASE}/?day=117`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('RED', { timeout: 15000 });
  await navClick(page, 'medical-alerts');

  // The single active alert comes from the API, with its real id.
  const alert = page.getByTestId('alert-demo-a01-day-117');
  await expect(alert).toBeVisible({ timeout: 15000 });
  await expect(alert).toContainText('HR_PERSISTENT_003');
  await expect(alert).toContainText('SPO2_THRESHOLD_001');
  // Traceability section mirrors dashboard.triggered_rules (the rule id also
  // appears inside the alert card, hence .first()).
  await expect(page.getByText('HR_TREND_002').first()).toBeVisible();
  // Provenance: the view must have refetched from the API.
  expect(calls.some((u) => u.includes('day=117'))).toBeTruthy();
});

test('Medical Alerts view shows a nominal day with no invented alert', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(`${APP_BASE}/?day=1`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('GREEN', { timeout: 15000 });
  await navClick(page, 'medical-alerts');
  await expect(page.getByText('Aucune alerte active')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('alert-demo-a01-day-117')).toHaveCount(0);
});

test('History & Reports view loads real per-indicator series from /history', async ({ page }) => {
  test.setTimeout(90000);
  const historyCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/indicators/')) historyCalls.push(r.url());
  });
  // Day 97+: the history endpoint holds 30 measurements per indicator.
  await page.goto(`${APP_BASE}/?day=97`);
  await expect(page.getByTestId('global-level-badge')).toHaveText('AMBER', { timeout: 15000 });
  await navClick(page, 'history-reports');

  const heartRow = page.getByTestId('history-heart-rate');
  await expect(heartRow).toBeVisible({ timeout: 20000 });
  // Last value at day 97 = heart_rate 65.2; samples = 30 per the API.
  await expect(page.getByTestId('history-value-heart-rate')).toHaveText('65.2');
  await expect(heartRow).toContainText('30');
  // Provenance: every row must be fetched from the real history endpoint.
  expect(historyCalls.some((u) => u.includes('/history'))).toBeTruthy();
  expect(historyCalls.length).toBeGreaterThan(5);
});

test('History & Reports view fills every row from /history (no NO DATA)', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto(APP_BASE);
  await expect(page.getByTestId('global-level-badge')).toBeVisible({ timeout: 15000 });
  await navClick(page, 'history-reports');

  const xrayRow = page.getByTestId('history-xray');
  await expect(xrayRow).toBeVisible({ timeout: 20000 });
  // xray_flux_short is part of the demo now: its row shows a number with at
  // least one sample, and the whole view contains no NO DATA cell.
  await expect(page.getByTestId('history-value-xray')).not.toHaveText('NO DATA');
  await expect(page.getByTestId('history-value-xray')).toHaveText(/^\d/);
  await expect(page.getByText('NO DATA')).toHaveCount(0);
  // Day 1 has one seeded sample for heart_rate — never a fabricated 0.
  await expect(page.getByTestId('history-value-heart-rate')).toHaveText('62');
});

test('anatomical heart-rate callout displays API telemetry and its data_class', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(APP_BASE);
  
  await navClick(page, 'crew-health');
  const heartCallout = page.getByTestId('callout-heart');
  await expect(heartCallout).toBeVisible({ timeout: 25000 });
  await expect(heartCallout).toContainText(/62\s*BPM/i);
  await expect(heartCallout).toContainText(/SYNTHETIC/i);
  
  // Verify no hardcoded crew data appears
  await expect(page.getByText('Apollo-7')).toHaveCount(0);
  
  await expect(page.getByText(/Schéma illustratif/i)).toBeVisible();
});

test('mission demo sequence 1 → 97 → 117 → 124 remains API-backed across three replays', async ({ page }) => {
  test.setTimeout(120000);
  const sequence = [
    { day: 1, level: 'GREEN', heartRate: '62' },
    { day: 97, level: 'AMBER', heartRate: '65.2' },
    { day: 117, level: 'RED', heartRate: '96.9' },
    { day: 124, level: 'RED', heartRate: '108' },
  ];

  for (let replay = 0; replay < 3; replay += 1) {
    for (const step of sequence) {
      await page.goto(`${APP_BASE}/?day=${step.day}`);
      await expect(page.getByTestId('global-level-badge')).toHaveText(step.level, {
        timeout: 15000,
      });
      await expect(page.getByTestId('metric-heart-rate')).toHaveText(step.heartRate);
      await expect(page.getByText('DATA: SYNTHETIC')).toBeVisible();
    }
  }
});
