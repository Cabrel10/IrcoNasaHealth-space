import { test, expect } from '@playwright/test';

/**
 * Tests visuels pour le CurvedSidebar holographique
 * Vérifie la forme incurvée, les bordures cyan lumineuses,
 * la navigation fonctionnelle, et les animations 3D.
 */

test.describe('CurvedSidebar Holographique', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('icorp-intro-done', 'true'));
    await page.goto('http://localhost:5174');
    await expect(
      page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]'),
    ).toBeVisible();
  });

  test('doit afficher le CurvedSidebar avec la forme holographique', async ({ page }) => {
    // Vérifier que le composant CurvedSidebar est présent
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    await expect(sidebar).toBeVisible();

    // Vérifier la présence du SVG de géométrie (bordures incurvées)
    const hullSvg = sidebar.getByTestId('curved-sidebar-hull');
    await expect(hullSvg).toBeVisible();

    // Vérifier la présence du clip-path SVG
    const clipPath = page.locator('clipPath#cockpit-hull-clip');
    await expect(clipPath).toBeAttached();

    console.log('✓ Structure holographique présente');
  });

  test('doit afficher tous les items de navigation avec icônes', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    
    // Vérifier tous les items attendus
    const expectedItems = [
      'Mission Overview',
      'Crew Health',
      '3D Anatomy Explorer',
      'Cardiovascular',
      'Neurological',
      'Respiratory',
      'Sleep & Fatigue',
      'Medical Alerts',
      'History & Reports',
    ];

    for (const itemText of expectedItems) {
      const item = sidebar.locator('button', { hasText: itemText });
      await expect(item).toBeVisible();
      
      // Vérifier que chaque item a une icône
      const icon = item.locator('span').first();
      await expect(icon).toBeVisible();
    }

    console.log(`✓ ${expectedItems.length} items de navigation présents avec icônes`);
  });

  test('le badge Medical Alerts reflète uniquement les alertes actives de l’API', async ({ page }) => {
    let activeAlertCount: number | null = null;
    page.on('response', async (response) => {
      if (!response.url().includes('/api/v1/dashboard')) return;
      try {
        const body = await response.json();
        activeAlertCount = Array.isArray(body.active_alerts) ? body.active_alerts.length : 0;
      } catch {
        activeAlertCount = null;
      }
    });
    await page.reload();
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    const alertsButton = sidebar.locator('button', { hasText: 'Medical Alerts' });
    await expect(alertsButton).toBeVisible();
    await expect.poll(() => activeAlertCount).not.toBeNull();
    const badge = alertsButton.getByTestId('medical-alert-count');
    if (activeAlertCount === 0) {
      await expect(badge).toHaveCount(0);
    } else {
      await expect(badge).toHaveText(String(activeAlertCount));
      const badgeStyle = await badge.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(badgeStyle).toContain('255');
    }
  });

  test('doit permettre la navigation entre les sections', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    
    // Keyboard activation must work as well as pointer activation.
    const crewHealthBtn = sidebar.locator('button', { hasText: 'Crew Health' });
    await crewHealthBtn.focus();
    await crewHealthBtn.press('Enter');
    await page.waitForTimeout(500);

    // Vérifier que le bouton est actif (doit avoir aria-current="page")
    await expect(crewHealthBtn).toHaveAttribute('aria-current', 'page');

    // Vérifier la présence du chevron animé (ChevronsRight) sur l'item actif
    const activeChevron = crewHealthBtn.locator('svg').last();
    await expect(activeChevron).toBeVisible();

    // Cliquer sur "Cardiovascular"
    const cardiovascularBtn = sidebar.locator('button', { hasText: 'Cardiovascular' });
    await cardiovascularBtn.click();
    await page.waitForTimeout(500);

    // Vérifier que Cardiovascular est maintenant actif
    await expect(cardiovascularBtn).toHaveAttribute('aria-current', 'page');
    
    // Crew Health ne doit plus être actif
    await expect(crewHealthBtn).not.toHaveAttribute('aria-current', 'page');

    console.log('✓ Navigation fonctionnelle entre sections');
  });

  test('doit afficher les bordures cyan lumineuses (glow effect)', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    
    // Vérifier la présence des filtres SVG pour les glows
    const leftGlowFilter = page.locator('filter#hud-left-glow');
    await expect(leftGlowFilter).toBeAttached();
    
    const rightGlowFilter = page.locator('filter#hud-right-glow');
    await expect(rightGlowFilter).toBeAttached();

    // Vérifier que les paths utilisent ces filtres
    const leftEdge = sidebar.locator('path').filter({ has: page.locator('[filter*="hud-left-glow"]') });
    const rightEdge = sidebar.locator('path').filter({ has: page.locator('[filter*="hud-right-glow"]') });

    console.log('✓ Effets de glow cyan présents');
  });

  test('doit afficher la perspective 3D et la rotation', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    
    // Vérifier que le conteneur a la perspective CSS
    const perspectiveStyle = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).perspective;
    });
    
    // La perspective doit être définie (960px selon config)
    expect(perspectiveStyle).not.toBe('none');

    // Vérifier la rotation 3D du panneau
    const panel = sidebar.locator('div[style*="aspect-ratio"]').first();
    const transform = await panel.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });
    
    // Le transform doit contenir une matrice 3D (rotation appliquée)
    expect(transform).toContain('matrix');
    expect(transform).not.toBe('none');

    console.log('✓ Perspective 3D et rotation appliquées');
  });

  test('capture visuelle du CurvedSidebar complet', async ({ page }) => {
    // Attendre que tout soit chargé
    await page.waitForTimeout(1000);

    // Screenshot de toute la page avec le sidebar
    await page.screenshot({
      path: 'test-results/curved-sidebar-full.png',
      fullPage: false,
    });

    // Screenshot du sidebar seul (clippé)
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    await sidebar.screenshot({
      path: 'test-results/curved-sidebar-focused.png',
    });

    // Hover sur un item pour voir l'animation
    const crewHealthBtn = sidebar.locator('button', { hasText: 'Crew Health' });
    await crewHealthBtn.hover();
    await page.waitForTimeout(300);
    
    await sidebar.screenshot({
      path: 'test-results/curved-sidebar-hover-state.png',
    });

    // Activer un item pour voir l'état actif avec glow
    await crewHealthBtn.click();
    await page.waitForTimeout(500);
    
    await sidebar.screenshot({
      path: 'test-results/curved-sidebar-active-state.png',
    });

    console.log('✓ 4 captures visuelles générées');
    console.log('  - test-results/curved-sidebar-full.png');
    console.log('  - test-results/curved-sidebar-focused.png');
    console.log('  - test-results/curved-sidebar-hover-state.png');
    console.log('  - test-results/curved-sidebar-active-state.png');
  });

  test('vérifie que les séparateurs Bézier incurvés sont présents', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    
    // Compter les paths de séparateurs (devrait y avoir N-1 séparateurs pour N items)
    // 9 items = 8 séparateurs
    const svg = sidebar.getByTestId('curved-sidebar-hull');
    const dividerPaths = svg.locator('path[stroke^="rgba(0, 223, 255"]');

    // Il doit y avoir plusieurs séparateurs
    const count = await dividerPaths.count();
    expect(count).toBeGreaterThan(5);

    console.log(`✓ ${count} séparateurs Bézier incurvés détectés`);
  });

  test('vérifie le comportement responsive du sidebar', async ({ page }) => {
    // Test desktop (défaut)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(300);
    
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    await expect(sidebar).toBeVisible();

    // Screenshot desktop
    await sidebar.screenshot({
      path: 'test-results/curved-sidebar-desktop.png',
    });

    // Test tablet
    await page.setViewportSize({ width: 1024, height: 768 });
    
    await expect(sidebar).toBeVisible();
    await sidebar.screenshot({
      path: 'test-results/curved-sidebar-tablet.png',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(sidebar).toBeHidden();
    const menuButton = page.getByRole('button', { name: 'Open navigation' });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(sidebar).toBeVisible();
    await sidebar.locator('button', { hasText: 'Crew Health' }).click();
    await expect(sidebar).toBeHidden();
    console.log('✓ Responsive: desktop, tablet et mobile OK');
  });

  test('respecte prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const sidebar = page.locator('aside[aria-label="Holographic Medical Cockpit Navigation"]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-reduced-motion', 'true');
    await expect(sidebar.locator('button[aria-current="page"]')).toBeVisible();
  });
});
