import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Informes en el panel nuevo (interruptor `panelNuevo`), como «Estadísticas» de
// Bonsai: pestañas por tema, y dos fotos de hoy que no había —«Clientas en
// riesgo» y «Estado de los bonos»—, con el MISMO cálculo que el chip de Clientas
// y que el aviso de bono por caducar. Sin el panel nuevo, Informes es la de
// siempre.
//
// Y el camino de fallo con su contador: si las suscripciones no llegan, no se
// enseña ninguna cifra de bonos. Sin contar las peticiones, ese test pasaría
// también con una pantalla que nunca las pidió.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
/** El día `n` desde hoy en Madrid, 'YYYY-MM-DD'. */
const dia = (n: number) => {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// María: bono con 6 sesiones que caduca en 60 días, y vino ayer (pasada lista:
//   una reserva confirmada sin pasar lista no cuenta como venir).
// Laura: su bono caducó hace 10 días y no ha comprado otro → «Sin renovar».
// Carmen: una clase suelta sin usar que caduca en 28 días, y nunca ha venido
//   (alta de junio) → «Activa sin venir» y «caduca pronto».
const SUSCRIPCIONES = [
  { id: 'sus-1', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'pl-bono10', estado: 'ACTIVA', fecha_inicio: dia(-30), fecha_fin: dia(60), sesiones_restantes: 6, stripe_subscription_id: null },
  { id: 'sus-2', studio_id: STUDIO_ID, socio_id: 'soc-2', plan_id: 'pl-bono10', estado: 'ACTIVA', fecha_inicio: dia(-100), fecha_fin: dia(-10), sesiones_restantes: 2, stripe_subscription_id: null },
  { id: 'sus-3', studio_id: STUDIO_ID, socio_id: 'soc-3', plan_id: 'pl-suelta', estado: 'ACTIVA', fecha_inicio: dia(-2), fecha_fin: dia(28), sesiones_restantes: 1, stripe_subscription_id: null },
];
const RESERVAS = [{
  id: 'res-ayer', studio_id: STUDIO_ID, sesion_id: 'ses-0', socio_id: 'soc-1',
  estado: 'ASISTIDA', spot_id: null, posicion_espera: null, oferta_expira_en: null,
  check_in_en: null, creado_en: `${dia(-3)}T09:00:00.000Z`, confirmacion_pedida_en: null,
  confirmado_en: null, recordatorio_confirmacion_en: null, valoracion_experiencia: null, cancelada_tardia: false,
}];

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, { panelNuevo = true, suscripcionesFallan = false, ruta = 'informes' } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { localStorage.setItem('tentare-primeros-pasos-plegado', '1'); } catch { /* sin almacenamiento */ } });
  await montar(page);
  // ⚠️ Después de `montar()`: Playwright prioriza la ruta registrada más tarde.
  let pedidasSuscripciones = 0;
  await page.route('**/rest/v1/suscripciones**', (r) => {
    pedidasSuscripciones++;
    return suscripcionesFallan ? json(r, { message: 'fallo' }, 500) : json(r, SUSCRIPCIONES);
  });
  await page.route('**/rest/v1/reservas**', (r) => json(r, RESERVAS));
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo,
  }));
  await ir(page, ruta);
  return { pedidasSuscripciones: () => pedidasSuscripciones };
}

const pestana = (page: Page, nombre: string) => page.getByRole('tab', { name: nombre });

test('pestañas por tema; el Resumen lleva las cifras del periodo y las de hoy', async ({ page }) => {
  await abrir(page);
  for (const nombre of ['Resumen', 'Dinero', 'Clases', 'Clientas', 'Bonos']) {
    await expect(pestana(page, nombre)).toBeVisible({ timeout: 30_000 });
  }
  await expect(pestana(page, 'Resumen')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('informe-titular')).toBeVisible();
  const hoyEn = page.getByTestId('informe-hoy');
  await expect(hoyEn.getByRole('link', { name: 'Sin renovar' })).toContainText('1');
  await expect(hoyEn.getByRole('link', { name: 'Activas sin venir' })).toContainText('1');
  await expect(hoyEn.getByRole('link', { name: 'Bonos por caducar' })).toContainText('1 sesión sin usar');
  // Lo de las otras pestañas está, pero no se ve (sale al imprimir).
  await expect(page.getByTestId('informe-bonos')).toBeHidden();
});

test('Bonos: los que hay, lo que queda y los que caducan con sesiones, cada uno a su ficha', async ({ page }) => {
  await abrir(page);
  await pestana(page, 'Bonos').click({ timeout: 30_000 });
  const bloque = page.getByTestId('informe-bonos');
  await expect(bloque).toBeVisible();
  // Bono de María (6) y clase suelta de Carmen (1); el de Laura ya caducó.
  await expect(bloque).toContainText(/Bonos en uso\s*2/);
  await expect(bloque).toContainText(/Sesiones por dar\s*7/);
  const caducan = page.getByTestId('informe-bonos-caducan');
  await expect(caducan.getByRole('listitem')).toHaveCount(1);
  await expect(caducan).toContainText('Clase suelta');
  await expect(caducan).toContainText('1 sesión');
  await expect(caducan).toContainText('(en 28 días)');
  await expect(caducan.getByRole('link', { name: 'Carmen Del Río Sánchez' })).toHaveAttribute('href', '/clientas/soc-3');
  // Bonos es una foto de hoy: sin selector de periodo.
  await expect(page.getByRole('group', { name: 'Periodo' })).toHaveCount(0);
});

test('Clientas en riesgo: las mismas listas que los filtros de Clientas, y enlazan a ellos', async ({ page }) => {
  await abrir(page);
  await page.getByTestId('informe-hoy').getByRole('link', { name: 'Sin renovar' }).click({ timeout: 30_000 });
  await expect(pestana(page, 'Clientas')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/informes\?pestana=clientas$/);
  const sinRenovar = page.getByTestId('informe-riesgo-sin-renovar');
  await expect(sinRenovar.getByRole('link', { name: 'Laura Martín' })).toHaveAttribute('href', '/clientas/soc-2');
  await expect(sinRenovar.getByRole('link', { name: /Verlas en Clientas/ })).toHaveAttribute('href', '/clientas?estado=SIN_RENOVAR');
  const sinVenir = page.getByTestId('informe-riesgo-sin-venir');
  await expect(sinVenir.getByRole('link', { name: 'Carmen Del Río Sánchez' })).toBeVisible();
  await expect(sinVenir).toContainText('no ha venido nunca');
  await expect(sinVenir.getByRole('link', { name: /Verlas en Clientas/ })).toHaveAttribute('href', '/clientas?estado=ACTIVA&mas=sin_venir_30d');
  // María vino ayer: no está en riesgo.
  await expect(page.getByTestId('informe-riesgo')).not.toContainText('María');
});

test('la pestaña vive en la URL: recargar vuelve a la misma', async ({ page }) => {
  await abrir(page);
  await pestana(page, 'Bonos').click({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/informes\?pestana=bonos$/);
  await page.reload();
  await expect(pestana(page, 'Bonos')).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('informe-bonos')).toBeVisible();
  await pestana(page, 'Resumen').click();
  await expect(page).toHaveURL(/\/informes$/);
});

test('si las suscripciones no llegan, ni cifras de bonos ni listas de riesgo: un aviso', async ({ page }) => {
  const { pedidasSuscripciones } = await abrir(page, { suscripcionesFallan: true });
  await expect(pestana(page, 'Bonos')).toBeVisible({ timeout: 30_000 });
  expect(pedidasSuscripciones()).toBeGreaterThan(0);
  await expect(page.getByTestId('informe-hoy').getByRole('link', { name: 'Bonos por caducar' })).toContainText('No se ha podido cargar');

  await pestana(page, 'Bonos').click();
  const bloque = page.getByTestId('informe-bonos');
  await expect(bloque.getByRole('alert')).toContainText('No se han podido cargar los bonos');
  await expect(bloque).not.toContainText('Bonos en uso');
  await expect(page.getByTestId('informe-bonos-caducan')).toHaveCount(0);

  await pestana(page, 'Clientas').click();
  await expect(page.getByTestId('informe-riesgo').getByRole('alert')).toContainText('No se han podido cargar tus clientas');
  await expect(page.getByTestId('informe-riesgo-sin-renovar')).toHaveCount(0);
});

test('sin el panel nuevo, Informes es la de siempre: una página, sin pestañas ni bloques nuevos', async ({ page }) => {
  await abrir(page, { panelNuevo: false });
  await expect(page.getByTestId('informe-cobrado')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await expect(page.getByTestId('informe-bonos')).toHaveCount(0);
  await expect(page.getByTestId('informe-riesgo')).toHaveCount(0);
  await expect(page.getByTestId('informe-hoy')).toHaveCount(0);
});
