import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Cuántas fuentes descarga una pantalla de la app de la alumna.
//
// ⚠️ Eran 19 ficheros (~360 KB) en CADA página, también en el login. El layout
// raíz declara diez familias con `next/font`, y `next/font` precarga por
// defecto: Outfit, Poppins, Cormorant, Libre Caslon y Figtree —que solo usa el
// tema que haya elegido cada estudio— y la Sacramento de la cita de Inicio se
// bajaban aunque nada en la pantalla las pintara. En un móvil en 4G eso es la
// mitad de los bytes de la carga en frío que no son JavaScript.
//
// Con `preload: false` siguen declaradas: el navegador las pide cuando algo las
// usa. Este test mide lo que de verdad se descarga, no la configuración.
//
// El tope no es un número mágico: Plus Jakarta (5 pesos), IBM Plex Mono (2) e
// Instrument Serif/Sans (las del widget público de reservas), un fichero latino
// por cara. Si sube, alguien ha vuelto a precargar una fuente de tema.

const TOPE = 9;

test('una pantalla de la alumna no descarga las fuentes de los temas', async ({ page }) => {
  test.setTimeout(120_000);
  // `sinReloj`: `page.clock.install()` vacía la Performance API.
  await sembrarSociaCompleta(page, { bono: 5, sinReloj: true });
  await page.goto(`/portal/${SLUG}/reservar`);
  await expect(page.getByRole('heading', { name: 'Horario', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  const fuentes = await page.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .map((r) => new URL(r.name).pathname)
      .filter((p) => /\.woff2?$/.test(p)),
  );
  expect(fuentes.length, `descarga ${fuentes.length} fuentes:\n${fuentes.join('\n')}`).toBeLessThanOrEqual(TOPE);
});
