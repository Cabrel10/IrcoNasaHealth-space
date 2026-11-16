import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:5174';
const API_URL = 'http://localhost:3081';

test.describe('Page Audit - Real vs Fake Data', () => {
  
  test('Audit all pages: track API calls and hardcoded data', async ({ page }) => {
    const apiCalls: string[] = [];
    const errors: string[] = [];
    
    // Track all network requests
    page.on('request', req => {
      if (req.url().includes('/api/v1/')) {
        apiCalls.push(`${req.method()} ${req.url()}`);
      }
    });
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Navigate to main page
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    console.log('\n=== AUDIT RESULTS ===\n');
    console.log(`API Calls made: ${apiCalls.length}`);
    apiCalls.forEach(call => console.log(`  - ${call}`));
    
    // Check for hardcoded indicators
    const pageText = await page.textContent('body');
    
    console.log('\n=== HARDCODED DATA DETECTION ===');
    
    const hardcodedIndicators = {
      'Apollo-7': pageText?.includes('Apollo-7') || false,
      'Stafford': pageText?.includes('Stafford') || false,
      'Heart Rate 68': pageText?.includes('68') && pageText?.includes('bpm') || false,
      'MEASURED_REAL label': pageText?.includes('MEASURED_REAL') || false,
    };
    
    Object.entries(hardcodedIndicators).forEach(([key, found]) => {
      console.log(`  ${found ? '❌' : '✅'} ${key}: ${found ? 'HARDCODED' : 'not found'}`);
    });
    
    // Try to find navigation links
    console.log('\n=== NAVIGATION ===');
    const navLinks = await page.locator('nav a, [role="navigation"] a, button[data-nav]').all();
    console.log(`Found ${navLinks.length} navigation elements`);
    
    // Click through different views if they exist
    const navItems = await page.locator('nav button, nav a, [data-nav]').all();
    
    for (let i = 0; i < Math.min(navItems.length, 5); i++) {
      try {
        const beforeCalls = apiCalls.length;
        await navItems[i].click();
        await page.waitForTimeout(1500);
        const afterCalls = apiCalls.length;
        const newCalls = afterCalls - beforeCalls;
        
        const text = await navItems[i].textContent();
        console.log(`  Clicked "${text}": ${newCalls} new API calls`);
      } catch (e) {
        // Element might not be clickable
      }
    }
    
    console.log('\n=== FINAL VERDICT ===');
    console.log(`Total API calls: ${apiCalls.length}`);
    console.log(`Console errors: ${errors.length}`);
    
    if (apiCalls.length === 0) {
      console.log('⚠️  NO API CALLS - App uses hardcoded data only');
    } else {
      console.log('✅ App makes API calls - partially or fully connected');
    }
    
    // Assertions
    expect(apiCalls.length).toBeGreaterThan(0); // MUST call API
  });
  
  test('Check if heart rate shows 62 (backend) or 68 (hardcoded)', async ({ page, request }) => {
    // Get real backend value
    const dashResp = await request.get(`${API_URL}/api/v1/dashboard?scenario=a01&day=1&data_class=synthetic`);
    const dashData = await dashResp.json();
    const hrIndicator = dashData.indicators.find((i: any) => i.id === 'heart_rate');
    
    console.log(`\n=== HEART RATE TEST ===`);
    console.log(`Backend value: ${hrIndicator?.value}`);
    
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const bodyText = await page.textContent('body');
    const shows62 = bodyText?.includes('62');
    const shows68 = bodyText?.includes('68');
    
    console.log(`UI shows 62: ${shows62}`);
    console.log(`UI shows 68: ${shows68}`);
    
    if (shows68 && !shows62) {
      console.log('❌ UI shows HARDCODED 68 instead of backend 62');
    } else if (shows62) {
      console.log('✅ UI shows backend value 62');
    }
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'test-results/heart-rate-check.png', fullPage: true });
  });
  
  test('Check mission context: IRCO-DEMO (backend) or Apollo-7 (hardcoded)', async ({ page, request }) => {
    const dashResp = await request.get(`${API_URL}/api/v1/dashboard?scenario=a01&day=1&data_class=synthetic`);
    const dashData = await dashResp.json();
    
    console.log(`\n=== MISSION CONTEXT TEST ===`);
    console.log(`Backend mission_id: ${dashData.mission.mission_id}`);
    
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    
    const bodyText = await page.textContent('body');
    const showsIRCO = bodyText?.includes('IRCO');
    const showsApollo = bodyText?.includes('Apollo');
    
    console.log(`UI shows IRCO-DEMO: ${showsIRCO}`);
    console.log(`UI shows Apollo-7: ${showsApollo}`);
    
    if (showsApollo && !showsIRCO) {
      console.log('❌ UI shows HARDCODED Apollo-7 instead of backend IRCO-DEMO');
    } else if (showsIRCO) {
      console.log('✅ UI shows backend mission');
    }
  });
  
  test('Detailed network trace with timing', async ({ page }) => {
    const networkLog: Array<{ url: string; method: string; time: number; status?: number }> = [];
    
    page.on('request', req => {
      if (req.url().includes('/api/v1/')) {
        networkLog.push({
          url: req.url(),
          method: req.method(),
          time: Date.now()
        });
      }
    });
    
    page.on('response', resp => {
      if (resp.url().includes('/api/v1/')) {
        const entry = networkLog.find(e => e.url === resp.url());
        if (entry) {
          entry.status = resp.status();
        }
      }
    });
    
    await page.goto(APP_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    console.log('\n=== NETWORK TRACE ===');
    if (networkLog.length === 0) {
      console.log('❌ NO API CALLS DETECTED');
    } else {
      networkLog.forEach(log => {
        console.log(`${log.method} ${log.url} → ${log.status || 'pending'}`);
      });
    }
    
    expect(networkLog.length).toBeGreaterThan(0);
  });
});
