import { test, expect } from '@playwright/test';

const APP_BASE = 'http://localhost:5174';

const skipIntro = () => {
  sessionStorage.setItem('icorp-intro-done', 'true');
};

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(skipIntro);
});

test.describe('3D Anatomical Explorer Integration', () => {
  test('3D Anatomy view mounts WebGL canvas and binds real IRCO heart_rate', async ({ page }) => {
    await page.goto(APP_BASE);

    // Navigate to 3D Anatomy
    const anatomyBtn = page.getByTestId('nav-anatomy');
    await expect(anatomyBtn).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await anatomyBtn.click();

    // Verify 3D Anatomy view container
    const anatomyView = page.getByTestId('anatomy-view');
    await expect(anatomyView).toBeVisible({ timeout: 30000 });

    // Verify WebGL Canvas is created and rendered
    const canvas = anatomyView.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 20000 });

    // The value and class are sourced from the dashboard indicator.
    await expect(anatomyView).toContainText('62 BPM', { timeout: 15000 });
    await expect(anatomyView).toContainText('SYNTHETIC');
    await expect(anatomyView).toContainText('GREEN');
    await expect(anatomyView).toContainText('Sujet :');

    // Verify ControlDock is present
    await expect(page.getByText('Visual BPM')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Flow')).toBeVisible();
    await expect(page.getByText('Cardiovascular')).toBeVisible();
  });

  test('CrewHealthView allows toggling between 2D schema and 3D procedural mannequin', async ({ page }) => {
    await page.goto(APP_BASE);

    // Navigate to Crew Health
    const crewHealthBtn = page.getByTestId('nav-crew-health');
    await expect(crewHealthBtn).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await crewHealthBtn.click();

    // Verify 2D schema is initially visible
    await expect(page.getByText('2D Schéma')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('3D Mannequin')).toBeVisible();

    // Toggle to 3D Mannequin
    await page.getByText('3D Mannequin').click();
    const crew3D = page.getByTestId('crew-view-3d');
    await expect(crew3D).toBeVisible({ timeout: 25000 });
    await expect(crew3D.locator('canvas')).toBeVisible({ timeout: 20000 });

    // Toggle back to 2D
    await page.getByText('2D Schéma').click();
    await expect(crew3D).toHaveCount(0);
  });

  test('clicking cardiac activity callout focuses 3D cardiovascular system', async ({ page }) => {
    await page.goto(APP_BASE);

    // Go to Crew Health
    const crewHealthBtn = page.getByTestId('nav-crew-health');
    await expect(crewHealthBtn).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await crewHealthBtn.click();

    // Click cardiac callout with force=true to bypass floating animation check
    const cardiacCallout = page.getByTestId('callout-heart');
    await expect(cardiacCallout).toBeVisible({ timeout: 30000 });
    await cardiacCallout.click({ force: true });

    // Verify it navigates to 3D Anatomy view with cardiovascular focus
    const anatomyView = page.getByTestId('anatomy-view');
    await expect(anatomyView).toBeVisible({ timeout: 30000 });
    await expect(anatomyView.locator('canvas')).toBeVisible({ timeout: 20000 });
  });

  test('Inspection drawer includes AI explanation capability', async ({ page }) => {
    await page.goto(APP_BASE);

    // Open Cardiovascular view
    const cardioBtn = page.getByTestId('nav-cardiovascular');
    await expect(cardioBtn).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1000);
    await cardioBtn.click();
    await expect(page.getByTestId('anatomy-view')).toBeVisible({ timeout: 30000 });

    // Inspection panel is open for heart
    const drawer = page.getByRole('complementary', { name: /Anatomical Structure Inspection/i });
    await expect(drawer).toBeVisible({ timeout: 20000 });
    await expect(drawer).toContainText(/Heart & Great Vessels/i);
    await expect(drawer.getByRole('button', { name: /Demander une explication/i })).toBeVisible();
  });
});
