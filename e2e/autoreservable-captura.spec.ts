import { test, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Capturas del interruptor «Clase fija» (ficha de una clase que se repite) y de lo que abre, para mirarlas. No afirman nada: lo que se
// comprueba vive en `student-plaza-fija.spec.ts`.
//
// Fuera del run normal (`E2E_CAPTURAS=1` para sacarlas; `E2E_CAPTURAS_DIR` = dónde dejarlas, por defecto `test-results`):
//
//     E2E_CAPTURAS=1 npx playwright test e2e/autoreservable-captura.spec.ts --project=chromium
test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar las pantallas');

const OUT = process.env.E2E_CAPTURAS_DIR ?? 'test-results';
const base = `/portal/${SLUG}`;
// La hora de estudio (Madrid) de la clase del fixture: la franja y la plaza tienen que casar con ella en cualquier máquina.
const HORA = new Date('2026-08-12T10:00:00').toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
// La clase del fixture de la alumna (miércoles 12-ago, Reformer, Sala 1), que además se repite cada semana.
const SUELTA = {
  serieId: 'serie-1', diaSemana: 3, hora: HORA, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1',
  tipo: 'Reformer', sala: 'Sala 1', instructora: 'Ana', logoUrl: null, proximaSesionId: 'ses-10', ultimaFecha: '2027-01-29',
};
const OCURRENCIAS = ['2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02'].map((fecha, i) => (
  { sesionId: `ses-${10 + i}`, fecha, hora: HORA, resultado: 'SE_RESERVARA', pagador: 'bono' }
));

async function montar(page: Page, plan: 'cuota' | 'bono', opciones: { laTiene?: boolean } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  const socia = f.socia as Record<string, unknown>;
  if (plan === 'cuota') {
    f.planesTarifa = [{ id: 'plan-cuota', studioId: STUDIO_ID, nombre: 'Cuota mensual', tipo: 'MENSUAL', sesiones: null, precio: 60, activo: true }];
    socia.suscripciones = [
      { id: 'sus-c', socioId: SOCIO_ID, planId: 'plan-cuota', estado: 'ACTIVA', sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: null },
    ];
  } else {
    f.planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    socia.suscripciones = [
      { id: 'sus-b', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'ACTIVA', sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31' },
    ];
  }
  if (opciones.laTiene) {
    socia.plazasFijas = [{ id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIO_ID, diaSemana: 3, horaInicio: `${HORA}:00`, salaId: 'sala-1', tipoClaseId: 'tc-r', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', claseFijaId: null }];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route('**/api/public/clases-fijas', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ofertas: [], pedidas: [], sueltas: [SUELTA] }) }));
  // El servidor, a un solo sitio: pedir deja la petición pendiente (o ya dada, según el caso), dejar la deja.
  await page.route('**/api/public/plaza-fija', (r) => {
    const cuerpo = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
    const respuesta = cuerpo.accion === 'dejar_plaza'
      ? { ok: true, plazas: 1, canceladas: 3, mantenidas: 1, fallidas: 0, sinDejar: 0 }
      : process.env.E2E_CAPTURAS_RESUELTA
        ? { ok: true, solicitudId: 'spf-9', resuelta: true, mensaje: 'Tu clase fija de los miércoles está confirmada. Ya tienes reservada la próxima clase.' }
        : { ok: true, solicitudId: 'spf-9' };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respuesta) });
  });
  await page.route('**/api/public/reserva-proximas', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true, accion: 'previsualizar', n: 4, ocurrencias: OCURRENCIAS,
      bono: { suscripcionId: 'sus-b', plan: 'Bono 8 sesiones', saldoAntes: 5, saldoDespues: 1, fechaFin: '2026-12-31' },
      resumen: { reservadas: 4, descontadas: 4, pedidas: 4, paro: null },
    }),
  }));
}

async function abrirFicha(page: Page) {
  await page.goto(`${base}/reservar/ses-10`, { waitUntil: 'domcontentloaded' });
  const tarjeta = page.getByTestId('auto-reservable');
  await tarjeta.waitFor({ timeout: 60_000 });
  await tarjeta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
}

test.describe('captura: Clase fija', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test('apagado, en la ficha de la clase', async ({ page }) => {
    await montar(page, 'cuota');
    await abrirFicha(page);
    await page.screenshot({ path: `${OUT}/01-auto-apagado.png` });
  });

  test('la hoja de cuánto tiempo', async ({ page }) => {
    await montar(page, 'cuota');
    await abrirFicha(page);
    await page.getByRole('switch', { name: 'Clase fija' }).click();
    await page.getByTestId('auto-reservable-hoja').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/02-auto-hoja-duracion.png` });
  });

  test('pendiente: lo ha pedido y el estudio aún no ha contestado', async ({ page }) => {
    await montar(page, 'cuota');
    await abrirFicha(page);
    await page.getByRole('switch', { name: 'Clase fija' }).click();
    await page.getByTestId('auto-reservable-hoja').getByRole('button', { name: 'Hacerla mi clase fija' }).click();
    await page.locator('[data-testid="auto-reservable-interruptor"][data-estado="pendiente"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/03-auto-pendiente.png` });
  });

  test('encendido: ya es su clase fija', async ({ page }) => {
    await montar(page, 'cuota', { laTiene: true });
    await abrirFicha(page);
    await page.locator('[data-testid="auto-reservable-interruptor"][data-estado="encendido"]').waitFor({ timeout: 30_000 });
    await page.screenshot({ path: `${OUT}/04-auto-encendido.png` });
  });

  test('apagarlo: la confirmación con lo que pasa con sus clases', async ({ page }) => {
    await montar(page, 'cuota', { laTiene: true });
    await abrirFicha(page);
    await page.getByRole('switch', { name: 'Clase fija' }).click();
    await page.getByTestId('dejar-aviso').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/05-auto-apagar-confirmacion.png` });
  });

  test('solo con bono: las próximas clases', async ({ page }) => {
    await montar(page, 'bono');
    await page.goto(`${base}/reservar/ses-10`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('reservar-proximas').waitFor({ timeout: 60_000 });
    await page.getByTestId('reservar-proximas').scrollIntoViewIfNeeded();
    await page.getByTestId('proximas-resumen').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/06-auto-bono.png` });
  });
});

test.describe('captura: Clase fija en un móvil pequeño', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });

  test('la tarjeta, la hoja y el bono caben y se pueden recorrer', async ({ page }) => {
    await montar(page, 'cuota');
    await abrirFicha(page);
    await page.screenshot({ path: `${OUT}/11-pequeno-apagado.png` });
    await page.getByRole('switch', { name: 'Clase fija' }).click();
    await page.getByTestId('auto-reservable-hoja').waitFor();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/12-pequeno-hoja.png` });
  });

  test('el bono en pequeño: el bloque se recorre hasta el botón', async ({ page }) => {
    await montar(page, 'bono');
    await page.goto(`${base}/reservar/ses-10`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('proximas-resumen').waitFor({ timeout: 60_000 });
    await page.getByTestId('reservar-proximas').scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/13-pequeno-bono.png` });
    // Hasta el final: el botón del bloque tiene que quedar por encima de la barra fija de «Reservar», no debajo.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/14-pequeno-bono-abajo.png` });
  });
});
