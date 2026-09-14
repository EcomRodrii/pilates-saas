import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// La app de la alumna no descarga el código del panel.
//
// `AuthProvider` y `StudioProvider` vivían en el layout RAÍZ y viajaban en la
// carga inicial de CADA página, también en `/portal/**`, donde nadie los usa
// (`lib/student/sesion.ts` evita `useStudio()` a propósito). Eran ~65 KB gz de
// `lib/supabase-data.ts`, `lib/studio-context.tsx` y compañía que la alumna
// descargaba, parseaba y ejecutaba en cada arranque para nada.
//
// El test mira el JS que la pantalla ha descargado DE VERDAD —no la
// configuración ni un manifiesto— y busca los mensajes de error de los tres
// hooks, que sobreviven a la minificación. Con la contraprueba: si en `/login`
// (que sí usa `useAuth`) dejaran de aparecer, los marcadores ya no
// significarían nada y la primera comprobación pasaría sin probar nada.

const MARCADORES = [
  'useStudio must be used within StudioProvider',
  'useAuth must be used inside AuthProvider',
  'useCore() debe usarse dentro de',
];

async function jsDescargado(page: Page): Promise<string> {
  const urls = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .map((r) => r.name)
    .filter((u) => /\/_next\/static\/.+\.js(\?|$)/.test(u)));
  const cuerpos = await Promise.all([...new Set(urls)].map(async (u) => (await page.request.get(u)).text()));
  return cuerpos.join('\n');
}

test('la app de la alumna no descarga los providers del panel', async ({ page }) => {
  test.setTimeout(120_000);
  // `sinReloj`: `page.clock.install()` vacía la Performance API.
  await sembrarSociaCompleta(page, { bono: 5, sinReloj: true });
  await page.goto(`/portal/${SLUG}/reservar`);
  await expect(page.getByRole('heading', { name: 'Horario', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  const js = await jsDescargado(page);
  expect(js.length, 'no se ha medido ningún JS: la comprobación no probaría nada').toBeGreaterThan(50_000);
  expect(MARCADORES.filter((m) => js.includes(m)), 'código del panel en la app de la alumna').toEqual([]);
});

test('contraprueba: el login sí los descarga', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

  const js = await jsDescargado(page);
  expect(MARCADORES.filter((m) => !js.includes(m)), 'marcadores que ya no aparecen donde sí se usan').toEqual([]);
});
