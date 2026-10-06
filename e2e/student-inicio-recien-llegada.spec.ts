import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, SOCIO_ID, type OpcionesSocia } from './socia-completa';
import { conSesiones } from './socia-lista';

// Inicio de la recién llegada (P03, 5-oct-2026). Quien todavía no tiene NADA en el estudio —ni una reserva, ni un bono o
// cuota, ni una clase fija, ni una recuperación, ni una cita— y se dio de alta hace 60 días o menos ve «Bienvenida a…» y
// su primera clase en lugar de «No tienes clases próximas» y «Tu ritmo» a cero. Con la duda (sin ficha, o el servidor
// avisa de que una lectura falló) NO: Inicio queda como siempre.
//
// Reloj: las 08:00 de Madrid del 12-ago (miércoles). Con contador de studio-data en cada test: «no salió la tarjeta»
// puede ser verdad por no haber pedido nada.

test.describe.configure({ timeout: 150_000 });

const INICIO = `/portal/${SLUG}`;

/** Cinco clases en los próximos 7 días, de las que solo DOS se pueden reservar; y una a 8 días. */
function horarioDeLaSemana(f: Record<string, unknown>) {
  (f.tiposClase as Array<Record<string, unknown>>).push({ id: 'tc-x', studioId: 'x', nombre: 'Barre', color: '#556B2F', nivel: 'TODOS', ventanaCancelacionHoras: null, reservaAntelacionMaximaDias: 2 });
  conSesiones(f, [
    { id: 'ses-10', hora: '10:00' },
    { id: 'ses-vie', fecha: '2026-08-14', hora: '18:00' },
    // Llena, con su aforo coherente.
    { id: 'ses-llena', fecha: '2026-08-13', hora: '10:00', aforoMaximo: 2 },
    // A 8 días: fuera de la ventana.
    { id: 'ses-8d', fecha: '2026-08-20', hora: '10:00' },
    // Su tipo abre la reserva 2 días antes: aún no se puede.
    { id: 'ses-sin-abrir', fecha: '2026-08-17', hora: '10:00', tipoClaseId: 'tc-x' },
  ]);
  (f.aforoReservas as unknown[]).push(
    { id: 'ar-l1', sesion_id: 'ses-llena', estado: 'CONFIRMADA' },
    { id: 'ar-l2', sesion_id: 'ses-llena', estado: 'CONFIRMADA' },
  );
}

/** El andamiaje completo y, DESPUÉS, el contador de studio-data (gana la última ruta registrada). */
async function montar(page: Page, o: OpcionesSocia & { payload?: (f: Record<string, unknown>) => void; status?: number } = {}) {
  let fixture: Record<string, unknown> | null = null;
  const a = await sembrarSociaCompleta(page, {
    bono: null, relojMadrid: true, ...o,
    ajustar: (f) => { horarioDeLaSemana(f); o.payload?.(f); fixture = f; },
  });
  let pedidas = 0;
  await page.route('**/api/public/studio-data', (r) => {
    pedidas++;
    if (o.status && o.status >= 400) return r.fulfill({ status: o.status, contentType: 'application/json', body: JSON.stringify({ error: 'fallo' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  return { a, pedidas: () => pedidas };
}

async function abrir(page: Page) {
  await page.goto(INICIO, { waitUntil: 'domcontentloaded' });
  // La guardia resuelta (#2518): la barra de pestañas, no la portada (que sale antes de la guardia).
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible({ timeout: 60_000 });
}

test('recién llegada: bienvenida, la cifra real de clases con plaza y su primera clase', async ({ page }) => {
  const { a, pedidas } = await montar(page, { valoracionActiva: true });
  await abrir(page);

  const tarjeta = page.getByTestId('primera-clase');
  await expect(tarjeta).toBeVisible({ timeout: 45_000 });
  // El nombre del estudio lo siembra el servidor en E2E_TEST (no el payload del andamiaje).
  await expect(tarjeta).toContainText('Bienvenida a Tentare');
  await expect(page.getByTestId('primera-clase-cifra')).toHaveText('En los próximos 7 días hay 2 clases con plaza.');
  // El andamiaje no vende clase suelta: las dos solo se reservan con bono o cuota, y la tarjeta lo dice.
  await expect(tarjeta).toContainText('Para reservarlas hace falta un bono o una cuota.');

  // La valoración inicial, encima.
  const valoracion = page.getByTestId('card-valoracion');
  await expect(valoracion).toBeVisible();
  const cajaV = await valoracion.boundingBox();
  const cajaT = await tarjeta.boundingBox();
  expect(cajaV && cajaT && cajaV.y < cajaT.y).toBe(true);

  // Sin «Tu ritmo» ni sus ceros; lo de siempre sigue.
  await expect(page.getByRole('region', { name: 'Tu ritmo' })).toHaveCount(0);
  await expect(page.getByText('Sin bono activo')).toHaveCount(0);
  await expect(page.getByText('No tienes clases próximas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible();

  await tarjeta.getByRole('link', { name: 'Elegir mi primera clase' }).click();
  await expect(page).toHaveURL(new RegExp(`${INICIO}/reservar$`));
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('«Ver precios» solo si el estudio vende algo, y lleva a la tienda', async ({ page }) => {
  const { a, pedidas } = await montar(page);
  await abrir(page);
  const tarjeta = page.getByTestId('primera-clase');
  await tarjeta.getByRole('link', { name: 'Ver precios' }).click({ timeout: 45_000 });
  await expect(page).toHaveURL(new RegExp(`${INICIO}/comprar$`));
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('sin nada a la venta, no hay «Ver precios»', async ({ page }) => {
  const { a, pedidas } = await montar(page, { conTienda: false });
  await abrir(page);
  await expect(page.getByTestId('primera-clase')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('link', { name: 'Ver precios' })).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('una reserva CANCELADA no cuenta (sigue siendo recién llegada); una pendiente de aprobar sí', async ({ page }) => {
  const reserva = (estado: string) => (f: Record<string, unknown>) => {
    (f.socia as Record<string, unknown>).reservas = [{ id: 'res-x', socioId: SOCIO_ID, sesionId: 'ses-vie', estado, creadoEn: '2026-08-10T09:00:00Z' }];
  };
  const { pedidas } = await montar(page, { payload: reserva('CANCELADA') });
  await abrir(page);
  await expect(page.getByTestId('primera-clase')).toBeVisible({ timeout: 45_000 });
  expect(pedidas()).toBeGreaterThan(0);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const otra = await montar(page, { payload: reserva('PENDIENTE_APROBACION') });
  await abrir(page);
  await expect(page.getByRole('heading', { name: 'Huecos de hoy' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('primera-clase')).toHaveCount(0);
  expect(otra.pedidas()).toBeGreaterThan(0);
});

test('studio-data falla: se ve el error y NI bienvenida NI ceros', async ({ page }) => {
  const { pedidas } = await montar(page, { status: 500 });
  await abrir(page);
  await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible({ timeout: 45_000 });
  expect(pedidas()).toBeGreaterThan(0);
  await expect(page.getByTestId('primera-clase')).toHaveCount(0);
  await expect(page.getByText('0 clases')).toHaveCount(0);
});

for (const [titulo, payload] of [
  ['sin ficha (socia null)', (f: Record<string, unknown>) => { f.socia = null; }],
  ['con el payload incompleto', (f: Record<string, unknown>) => { (f.socia as Record<string, unknown>).incompleta = true; }],
] as const) {
  test(`${titulo}: no se sabe quién es, así que Inicio queda como siempre`, async ({ page }) => {
    const { pedidas } = await montar(page, { payload });
    await abrir(page);
    await expect(page.getByText('No tienes clases próximas')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('primera-clase')).toHaveCount(0);
    expect(pedidas()).toBeGreaterThan(0);
  });
}

test('alta de hace años (importada con su fecha): no es recién llegada', async ({ page }) => {
  const { a, pedidas } = await montar(page, { payload: (f) => { ((f.socia as Record<string, unknown>).socio as Record<string, unknown>).fechaAlta = '2019-03-04'; } });
  await abrir(page);
  await expect(page.getByText('No tienes clases próximas')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('primera-clase')).toHaveCount(0);
  // Sin clase asistida ni bono, «Tu ritmo» se esconde igual: eran ceros.
  await expect(page.getByRole('region', { name: 'Tu ritmo' })).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('con su bono: ni tarjeta de bienvenida ni se esconde «Tu ritmo»', async ({ page }) => {
  const { a, pedidas } = await montar(page, { bono: 5 });
  await abrir(page);
  await expect(page.getByRole('region', { name: 'Tu ritmo' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('primera-clase')).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});
