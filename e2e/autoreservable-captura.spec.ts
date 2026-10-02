import { test, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Capturas del «autoreservable» (repetir una clase cada semana) en la app de la alumna, para mirarlas antes de mergear. No
// afirman nada: lo que se comprueba vive en `student-clases-fijas.spec.ts` y `student-plaza-fija.spec.ts`.
//
// Fuera del run normal (`E2E_CAPTURAS=1` para sacarlas):
//
//     E2E_CAPTURAS=1 npx playwright test e2e/autoreservable-captura.spec.ts --project=chromium
test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar las pantallas');

const base = `/portal/${SLUG}`;
// La clase del fixture de la alumna (miércoles 12-ago a las 10:00, Reformer, Sala 1), que además se repite cada semana.
const SUELTA = {
  serieId: 'serie-1', diaSemana: 3, hora: '10:00', tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
  tipo: 'Reformer', sala: 'Sala 1', instructora: 'Ana', logoUrl: null, proximaSesionId: 'ses-10', ultimaFecha: '2027-01-29',
};

async function montar(page: Page, plan: 'cuota' | 'bono') {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  if (plan === 'cuota') {
    f.planesTarifa = [{ id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual', tipo: 'MENSUAL', sesiones: null, precio: 60, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-c', socioId: SOCIO_ID, planId: 'plan-cuota', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null },
    ];
  } else {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    (f.socia as Record<string, unknown>).suscripciones = [
      { id: 'sus-b', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/api/public/clases-fijas', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ofertas: [], pedidas: [], sueltas: [SUELTA] }) }));
}

test.describe('captura: repetir cada semana', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('ficha de la clase (con cuota): el enlace «Repetir cada semana»', async ({ page }) => {
    await montar(page, 'cuota');
    await page.goto(`${base}/reservar/ses-10`, { waitUntil: 'domcontentloaded' });
    const enlace = page.getByTestId('repetir-cada-semana');
    await enlace.waitFor({ timeout: 30_000 });
    await enlace.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/auto-1-ficha-clase.png' });
  });

  test('ficha de clase fija (con cuota): cuánto tiempo la quiere', async ({ page }) => {
    await montar(page, 'cuota');
    await page.goto(`${base}/clases-fijas/ses-10`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('duracion-clase-fija').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/auto-2-ficha-clase-fija.png' });
    await page.getByRole('button', { name: '6 meses' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/auto-2b-ficha-clase-fija-6meses.png' });
  });

  test('ficha de clase fija (solo con bono): hoy', async ({ page }) => {
    await montar(page, 'bono');
    await page.goto(`${base}/clases-fijas/ses-10`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('clase-fija-solo-cuota').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/auto-3-ficha-clase-fija-bono-hoy.png' });
  });
});
