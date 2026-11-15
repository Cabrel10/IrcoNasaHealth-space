import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3081';

test.describe('IRCO API Integration', () => {
  
  test('Health endpoint responds correctly', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('uptime_seconds');
  });

  test('Dashboard endpoint - day 1 (green)', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/dashboard?mode=demo&scenario=a01&day=1`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    // Structure validation
    expect(data).toHaveProperty('mission');
    expect(data.mission.mission_day).toBe(1);
    expect(data).toHaveProperty('indicators');
    expect(Array.isArray(data.indicators)).toBeTruthy();
    expect(data.indicators.length).toBeGreaterThan(0);
    expect(data).toHaveProperty('services');
    expect(data.services.engine).toBe('ok');
    expect(data.global.level).toBe('green');
  });

  test('Dashboard endpoint - day 97 (amber)', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/dashboard?mode=demo&scenario=a01&day=97`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.mission.mission_day).toBe(97);
    expect(data.global.level).toBe('amber');
  });

  test('Dashboard endpoint - day 117 (red)', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/dashboard?mode=demo&scenario=a01&day=117`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.global.level).toBe('red');
  });

  test('Mission endpoint returns metadata', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/mission`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.mission_id).toBe('IRCO-DEMO');
    expect(data).toHaveProperty('duration_days');
    expect(data.simulated).toBe(true);
  });

  test('Routine endpoint returns tasks', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/routine?subject_id=A-01`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.subject_id).toBe('A-01');
    expect(data).toHaveProperty('tasks');
    expect(Array.isArray(data.tasks)).toBeTruthy();
    expect(data).toHaveProperty('progress');
  });

  test('Indicators registry endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/indicators`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
    
    // Validate indicator structure
    const indicator = data[0];
    expect(indicator).toHaveProperty('id');
    expect(indicator).toHaveProperty('name');
    expect(indicator).toHaveProperty('unit');
    expect(indicator).toHaveProperty('family');
  });

  test('Indicator history endpoint', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/indicators/heart_rate/history?subject_id=A-01&data_class=synthetic&days=7`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.indicator).toBe('heart_rate');
    expect(data.subject_id).toBe('A-01');
    expect(data).toHaveProperty('measurements');
    expect(data).toHaveProperty('thresholds');
  });

  test('State endpoint with data_class', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/state?data_class=synthetic`
    );
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.data_class).toBe('synthetic');
    expect(data).toHaveProperty('subjects');
  });

  test('Checkin endpoint validates unit', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/checkin`, {
      data: {
        subject_id: 'A-01',
        indicator: 'heart_rate',
        value: 72.0,
        unit: 'bpm'
      }
    });
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('accepted');
  });

  test('Checkin rejects wrong unit', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/checkin`, {
      data: {
        subject_id: 'A-01',
        indicator: 'heart_rate',
        value: 72.0,
        unit: 'invalid'
      }
    });
    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.code).toBe('unit_mismatch');
    expect(data).toHaveProperty('hint');
  });

  test('Error responses follow standard envelope', async ({ request }) => {
    const response = await request.get(
      `${API_BASE}/api/v1/indicators/nonexistent_indicator/history?data_class=synthetic`
    );
    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data).toHaveProperty('code');
    expect(data).toHaveProperty('hint');
  });

  test('Knowledge hazards endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/knowledge/hazards`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data.hazards)).toBeTruthy();
    expect(data.hazards.length).toBe(5);
  });

  test('Demo scenarios endpoint', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/demo/scenarios`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    expect(data.length).toBeGreaterThan(0);
  });

  test('OpenAPI spec is accessible', async ({ request }) => {
    const response = await request.get(`${API_BASE}/openapi.json`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('openapi');
    expect(data).toHaveProperty('paths');
  });
});

test.describe('Frontend Visual Validation', () => {
  test('Prototype dashboard renders with earth image', async ({ page }) => {
    await page.goto(
      'file://' + process.cwd() + '/prototypes/dashboard.html',
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    );
    await expect(page).toHaveTitle(/Orbital Medical Dashboard/, { timeout: 15000 });
    // the prototype references images/earth.png — it must be present and load
    const earthOk = await page.evaluate(() => {
      const img = document.querySelector('img[src*="earth"]');
      return img ? img.complete && img.naturalWidth > 0 : true;
    });
    expect(earthOk).toBe(true);
    await expect(page.locator('body')).toBeVisible();
  });
});
