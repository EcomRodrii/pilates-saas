import { test, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Capturas de las pantallas nuevas de plaza fija, para mirarlas antes de
// mergear. No afirman nada: lo que se comprueba vive en sus specs
// (student-plaza-fija, cancelar-suscripcion-hace-algo).
//
// Fuera del run normal (`E2E_CAPTURAS=1` para sacarlas): son ~50 s y ni una sola
// aserción, y el e2e ya se mide al segundo. Se corren cuando hay que mirar:
//
//     E2E_CAPTURAS=1 npx playwright test e2e/plazas-fijas-captura.spec.ts --project=chromium
test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar las pantallas');

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const PETICIONES = [
  {
    id: 'spf-1', tipo: 'CREAR', socioId: 'soc-1', socia: 'Marta Ruiz',
    franja: 'Martes 10:00 · Reformer', superaLimite: true,
    desde: null, hasta: null, motivoSistema: null, creadaEn: '2026-09-16T09:00:00Z',
  },
  {
    id: 'spf-2', tipo: 'PAUSAR', socioId: 'soc-2', socia: 'Ana Pérez',
    franja: 'Jueves 18:00 · Mat', superaLimite: false,
    desde: '2026-10-01', hasta: '2026-10-20', motivoSistema: null, creadaEn: '2026-09-16T10:00:00Z',
  },
  {
    id: 'spf-3', tipo: 'REANUDAR', socioId: 'soc-3', socia: 'Lucía Gil',
    franja: 'Lunes 19:00 · Reformer', superaLimite: false,
    desde: null, hasta: '2026-09-30', motivoSistema: 'SITIO_OCUPADO', creadaEn: '2026-09-16T11:00:00Z',
  },
];

test('captura: peticiones de plaza fija en Inicio', async ({ page }) => {
  await montar(page);
  // Después de `montar`: en Playwright gana la ruta registrada más tarde.
  await page.route('**/api/plazas-fijas/solicitudes**', (r) => json(r, { peticiones: PETICIONES }));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await ir(page, 'dashboard');

  const tarjeta = page.getByTestId('plazas-fijas-por-decidir');
  await tarjeta.waitFor({ timeout: 30_000 });
  await tarjeta.screenshot({ path: 'test-results/pf-inicio-peticiones.png' });
});

test('captura: las tarjetas nuevas de Configuración', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await ir(page, 'configuracion');

  await page.getByText('Cómo reservan mis alumnas').first().click({ timeout: 30_000 });
  await page.getByText('Plazas fijas', { exact: true }).first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/pf-configuracion-filas.png', fullPage: true });

  await page.getByText('Si pausa su plaza fija').first().click();
  await page.getByText(/su sitio queda libre para otra alumna/i).first().waitFor({ timeout: 15_000 });
  // El cajón entra con transición: sin esperarla, la foto sale a medio abrir.
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/pf-configuracion-cajon-pausa.png' });
});

/** La app de la alumna, con su plaza fija del jueves (reloj del andamiaje: 2026-08-12). */
async function montarAlumna(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  const socia = f.socia as unknown as Record<string, unknown>;
  socia.plazasFijas = [{
    id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 4, horaInicio: '18:00:00',
    salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01',
    vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z',
  }];
  await page.route('**/api/public/studio-data', (r) => json(r, f));
  await page.route((u) => u.pathname === '/api/notifications', (r) => json(r, { items: [] }));
  await page.route((u) => u.pathname === '/api/public/comunidad/posts', (r) => json(r, { posts: [] }));
  await page.route('**/api/public/plaza-fija', (r) => json(r, { ok: true, solicitudId: 'spf-1' }));
}

test('captura: la alumna pide una pausa desde su app', async ({ page }) => {
  await montarAlumna(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/portal/${SLUG}/bonos`);

  const tarjeta = page.getByTestId('plaza-fija');
  await tarjeta.waitFor({ timeout: 30_000 });
  await tarjeta.screenshot({ path: 'test-results/pf-alumna-tarjeta.png' });

  await tarjeta.getByRole('button', { name: 'Pedir una pausa' }).click();
  await page.getByLabel('Hasta').waitFor({ timeout: 15_000 });
  await page.screenshot({ path: 'test-results/pf-alumna-hoja-pausa.png' });

  await page.getByLabel('Hasta').fill('2026-08-26');
  await page.getByRole('button', { name: 'Pedir la pausa' }).click();
  await tarjeta.getByText(/Pausa pedida del/).waitFor({ timeout: 15_000 });
  await tarjeta.screenshot({ path: 'test-results/pf-alumna-pausa-pedida.png' });
});
