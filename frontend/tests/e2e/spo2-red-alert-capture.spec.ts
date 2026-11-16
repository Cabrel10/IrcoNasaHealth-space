import { test, expect } from '@playwright/test';

/**
 * Capture visuelle de l'alerte SpO₂ rouge au jour 117 (scénario A-01)
 * avec détails : valeur 90.4%, vigilance RED, règle SPO2_THRESHOLD_001 déclenchée
 */

test.describe('SpO₂ Red Alert Evidence — Day 117', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/?day=117');
    await page.waitForLoadState('networkidle');
  });

  test('capture SpO₂ card showing 90.4% with SYNTHETIC badge and RED vigilance', async ({ page }) => {
    // Attendre que les données API soient chargées
    await page.waitForSelector('[data-testid="kpi-spo2"]', { timeout: 15000 });
    
    // Vérifier le statut global RED
    const globalStatus = page.locator('text=GLOBAL:').locator('..').locator('text=RED');
    await expect(globalStatus).toBeVisible({ timeout: 5000 });

    // Vérifier la valeur SpO₂ affichée
    const spo2Value = page.locator('[data-testid="kpi-spo2"]');
    const spo2Text = await spo2Value.textContent();
    console.log(`SpO₂ displayed: ${spo2Text}`);
    
    // Devrait être proche de 90.4 (tolérance pour arrondi)
    expect(spo2Text).toMatch(/90\.[0-9]/);

    // Vérifier le badge SYNTHETIC
    const syntheticBadge = page.locator('text=SYNTHETIC').first();
    await expect(syntheticBadge).toBeVisible();

    // Screenshot de la carte SpO₂
    await page.screenshot({
      path: 'test-results/spo2-red-alert-day117-full.png',
      fullPage: true,
    });

    // Screenshot zoomé sur la zone SpO₂ (si possible)
    const spo2Card = page.locator('[data-testid="kpi-spo2"]').locator('..');
    await spo2Card.screenshot({
      path: 'test-results/spo2-card-90percent-red.png',
    });
  });

  test('verify triggered rules include SPO2_THRESHOLD_001', async ({ page }) => {
    // Vérifier via un appel API direct (pas d'UI pour les règles détaillées)
    const response = await page.request.get(
      'http://localhost:3081/api/v1/dashboard?mode=demo&scenario=a01&day=117'
    );
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    
    // Vérifier vigilance rouge
    expect(data.global.level).toBe('red');
    
    // Vérifier que SPO2_THRESHOLD_001 est déclenchée
    expect(data.triggered_rules).toContain('SPO2_THRESHOLD_001');
    
    // Vérifier SpO₂ value
    const spo2Indicator = data.indicators.find((i: any) => i.id === 'spo2');
    expect(spo2Indicator).toBeDefined();
    expect(spo2Indicator.value).toBeLessThan(92); // Seuil critique
    expect(spo2Indicator.data_class).toBe('synthetic');
    
    console.log(`✓ SpO₂ = ${spo2Indicator.value}% (< 92% threshold)`);
    console.log(`✓ Triggered rules: ${data.triggered_rules.join(', ')}`);
    console.log(`✓ Global level: ${data.global.level}`);
  });
});
