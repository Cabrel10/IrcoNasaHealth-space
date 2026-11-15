import { test, expect } from '@playwright/test';

// Strict integration tests: the React app MUST consume the real IRCO backend.
// No lenient fallbacks — every assertion is exact. Backend on :3081, app on :5174.
const APP_BASE = 'http://localhost:5174';

const skipIntro = () => {
  sessionStorage.setItem('icorp-intro-done', 'true');
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(skipIntro);
});

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

test('no_data indicators are never rendered as 0', async ({ page }) => {
  await page.goto(APP_BASE);
  // Day 1: SpO₂, body temperature, blood pressure have no backend values.
  await expect(page.getByTestId('kpi-spo2')).toHaveText('NO DATA', { timeout: 15000 });
  await expect(page.getByTestId('kpi-temp')).toHaveText('NO DATA');
  await expect(page.getByTestId('metric-blood-pressure')).toHaveText('NO DATA');
  // Sanity: the numeric "0" must not appear as any metric value.
  await expect(page.getByTestId('metric-heart-rate')).not.toHaveText('0');
  await expect(page.getByTestId('metric-spo2')).not.toHaveText('0');
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
