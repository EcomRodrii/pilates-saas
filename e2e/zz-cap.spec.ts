import { test, expect } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { DEFAULT_THEME } from '../lib/theme-schema';
const D = '/private/tmp/claude-501/-Users-marcosrocarodriguez-dev-o--claude-worktrees-quirky-mclean-dbeb0b/3ee5b033-3c0b-4b4d-8a14-ff28c738f645/scratchpad/capturas';
test.describe('cap', () => {
  test.describe.configure({ timeout: 240_000 });
  for (const [nombre, vp] of [['escritorio', { width: 1500, height: 1000 }], ['movil', { width: 393, height: 852 }]] as const) {
    test(nombre, async ({ page }) => {
      await page.setViewportSize(vp);
      await montar(page);
      await page.route('**/rest/v1/studios**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena', plan: 'ESTUDIO', subscription_status: 'active', moneda: 'EUR', iva_por_defecto: 21 }) }));
      await page.route((u) => u.pathname === '/api/theme', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...DEFAULT_THEME, primary: '#B4708C' }) }));
      for (let i = 0; i < 3; i++) {
        await ir(page, 'configuracion/apariencia');
        if (await page.getByRole('heading', { name: 'Apariencia de tu app' }).isVisible().catch(() => false)) break;
        await page.waitForTimeout(3000);
      }
      await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
      await page.getByRole('radio', { name: /Rubor/ }).click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: `${D}/ed2-${nombre}-1.png` });
      await page.mouse.wheel(0, 900); await page.waitForTimeout(900);
      await page.screenshot({ path: `${D}/ed2-${nombre}-2.png` });
      await page.mouse.wheel(0, 1300); await page.waitForTimeout(900);
      await page.screenshot({ path: `${D}/ed2-${nombre}-3.png` });
    });
  }
});
