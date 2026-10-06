import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, SOCIO_ID, type OpcionesSocia } from './socia-completa';

// Mi plan (antes «Bonos»; P4-C y E, 6-oct-2026, y el rediseño «Clase fija y bonos, ordenados»): el bono que se gasta
// primero con su anillo, y la tarjeta de la cuota. Lo que se prueba es que NADA de dinero se dice sin un dato que lo
// sostenga: «12 € por clase» solo con un recibo cobrado, «Al día» solo sin deudas y con algo pagado, «Próxima
// renovación» solo de una cuota que se renueva, y la tienda dice «lo que tu cuota no incluye» solo si hay algo así.
// Reloj: 12-ago-2026, 08:00 de Madrid (miércoles). Con contador de studio-data en cada test.

test.describe.configure({ timeout: 150_000 });

const BONOS = `/portal/${SLUG}/bonos`;
const socia = (f: Record<string, unknown>) => f.socia as Record<string, unknown>;
const recibo = (id: string, suscripcionId: string, importe: number, estado = 'COBRADO') => ({
  id, socioId: SOCIO_ID, concepto: 'Plan', importe, estado, fechaCobro: estado === 'COBRADO' ? '2026-08-01' : null,
  fechaVencimiento: '2026-08-01', metodoCobro: 'TARJETA', suscripcionId,
});

async function montar(page: Page, o: OpcionesSocia & { payload?: (f: Record<string, unknown>) => void; misBonos?: unknown } = {}) {
  let fixture: Record<string, unknown> | null = null;
  const a = await sembrarSociaCompleta(page, { relojMadrid: true, ...o, ajustar: (f) => { o.payload?.(f); fixture = f; } });
  let pedidas = 0;
  await page.route('**/api/public/studio-data', (r) => { pedidas++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }); });
  // Lo de mis-bonos, DESPUÉS del andamiaje y ANTES de abrir (si no, la primera petición se la lleva el de por defecto).
  if (o.misBonos) await page.route('**/api/public/mis-bonos', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o.misBonos) }));
  await page.goto(BONOS, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible({ timeout: 60_000 });
  return { a, pedidas: () => pedidas };
}

test('el bono, con su anillo: lo que queda, de cuántas, cuándo caduca, a 12 € la clase y la que ya tiene reservada con él', async ({ page }) => {
  const { a, pedidas } = await montar(page, {
    bono: 5, reservada: true,
    payload: (f) => {
      socia(f).recibos = [recibo('rec-b', 'sus-1', 96)];
      (socia(f).reservas as Array<Record<string, unknown>>)[0].bonoSuscripcionId = 'sus-1';
    },
  });
  const heroe = page.getByTestId('bono-hero');
  await expect(heroe.getByTestId('bono-restantes')).toHaveText('5', { timeout: 45_000 });
  await expect(heroe).toContainText('Bono 8 sesiones');
  // El anillo dice DE QUÉ queda: «5 de 8 sesiones», nunca «Te quedan» con el 8 suelto.
  await expect(heroe.getByTestId('bono-caduca')).toHaveText('5 de 8 sesiones · hasta el 31 dic');
  // Caduca lejos (141 días): sin píldora, ya lo dice «hasta el 31 dic».
  await expect(heroe.getByTestId('bono-caduca-pronto')).toHaveCount(0);
  await expect(heroe.getByText('Te quedan', { exact: true })).toHaveCount(0);
  await expect(heroe.getByTestId('bono-precio-clase')).toHaveText('12 € por clase');
  await expect(heroe.getByTestId('bono-reservadas')).toHaveText('Ya reservada con este bono: mié 12');
  await expect(heroe).toContainText('Sirve para cualquier clase');
  await expect(heroe.getByRole('link').first()).toHaveAttribute('href', `${BONOS}/sus-1`);
  await expect(heroe.getByTestId('bono-movimientos')).toHaveAttribute('href', `${BONOS}/sus-1`);
  // Solo bono: es «Tu bono», no «También tienes».
  await expect(heroe).toContainText('Tu bono');
  await expect(heroe.getByTestId('bono-se-usa')).toHaveCount(0);
  await expect(page.getByTestId('bono-aviso')).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('sin un único recibo cobrado no hay «€ por clase», y una reserva sin bono anotado no se le atribuye', async ({ page }) => {
  const { pedidas } = await montar(page, {
    bono: 5, reservada: true,
    payload: (f) => { socia(f).recibos = [recibo('r1', 'sus-1', 48), recibo('r2', 'sus-1', 48)]; },
  });
  await expect(page.getByTestId('bono-restantes')).toHaveText('5', { timeout: 45_000 });
  await expect(page.getByTestId('bono-precio-clase')).toHaveCount(0);
  await expect(page.getByTestId('bono-reservadas')).toHaveCount(0);
  await expect(page.getByText(/€ por clase/)).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
});

test('con una sesión, el aviso lo dice sin «Renovar» y lleva a la tienda', async ({ page }) => {
  const { pedidas } = await montar(page, { bono: 1 });
  const aviso = page.getByTestId('bono-aviso');
  await expect(aviso).toContainText('Una sesión más y se acaba tu bono.', { timeout: 45_000 });
  await expect(aviso.getByRole('link', { name: 'Tienda' })).toHaveAttribute('href', `/portal/${SLUG}/comprar`);
  await expect(page.getByText(/Renueva/)).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
});

test('la cuota: «Al día», su semana con lo que le queda, la próxima renovación y su último recibo', async ({ page }) => {
  const { a, pedidas } = await montar(page, {
    bono: null, cuota: { limiteSemanal: 2 },
    payload: (f) => { socia(f).recibos = [recibo('rec-m', 'sus-mes', 89)]; },
    misBonos: {
      movimientos: null, semanas: [{ suscripcionId: 'sus-mes', limite: 2, cuentan: 1, conRecuperacion: 0, porTipo: [], desde: '2026-08-09T22:00:00.000Z', hasta: '2026-08-16T22:00:00.000Z' }],
    },
  });
  const cuota = page.getByTestId('cuota-hero');
  await expect(cuota.getByTestId('cuota-pagos')).toHaveText('Al día', { timeout: 45_000 });
  await expect(cuota).toContainText('Mensual ilimitado');
  // Una MENSUAL activa sin baja programada se renueva el día siguiente a su fin, por el precio de su plan.
  await expect(cuota.getByTestId('cuota-vigencia')).toHaveText('Próxima renovación: 1 ene · 89 €');
  await expect(cuota.getByTestId('semana-cifra')).toHaveText('1 de 2');
  await expect(cuota.getByTestId('semana-queda')).toHaveText('Te queda 1 clase hasta el domingo.');
  await expect(page.getByTestId('mi-plan-recibos')).toContainText('Último: 1 ago · 89 € · Pagado');
  await expect(page.getByTestId('mi-plan-recibos').getByRole('link')).toHaveAttribute('href', `/portal/${SLUG}/pagos`);
  await expect(page.getByText(/se renueva sola|sin límite/i)).toHaveCount(0);
  // Cubre todas las clases: no hay nada que «quiera más» que la cuota no le dé.
  await expect(page.getByTestId('cuota-mas')).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
  expect(a.sinMockear()).toEqual([]);
});

test('con un recibo sin cobrar, «Pago pendiente»; nunca «Al día»', async ({ page }) => {
  const { pedidas } = await montar(page, {
    bono: null, cuota: true,
    payload: (f) => { socia(f).recibos = [recibo('rec-ok', 'sus-mes', 89), recibo('rec-pend', 'sus-mes', 89, 'PENDIENTE')]; },
  });
  await expect(page.getByTestId('cuota-pagos')).toHaveText('Pago pendiente', { timeout: 45_000 });
  await expect(page.getByText('Al día')).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
});

test('con una baja programada, la cuota NO promete renovarse', async ({ page }) => {
  const { pedidas } = await montar(page, {
    bono: null, cuota: true,
    payload: (f) => { for (const s of socia(f).suscripciones as Array<Record<string, unknown>>) s.bajaAlVencer = true; },
  });
  await expect(page.getByTestId('cuota-vigencia')).toHaveText('Termina el 31 dic · no se renueva', { timeout: 45_000 });
  await expect(page.getByText(/Próxima renovación/)).toHaveCount(0);
  expect(pedidas()).toBeGreaterThan(0);
});

test('la tienda dice «lo que tu cuota no incluye» solo si hay algo así', async ({ page }) => {
  const { pedidas } = await montar(page, {
    bono: null, cuota: true,
    payload: (f) => {
      (f.tiposClase as Array<Record<string, unknown>>).push({ id: 'tc-mat', studioId: 'x', nombre: 'Mat', color: '#556B2F', nivel: 'TODOS', ventanaCancelacionHoras: null });
      for (const p of f.planesTarifa as Array<Record<string, unknown>>) if (p.id === 'plan-mes') p.tiposClaseIds = ['tc-r'];
    },
  });
  const mas = page.getByTestId('cuota-mas');
  await expect(mas).toContainText('Para lo que tu cuota no incluye: Mat', { timeout: 45_000 });
  await expect(mas.getByRole('link')).toHaveAttribute('href', `/portal/${SLUG}/comprar`);
  expect(pedidas()).toBeGreaterThan(0);
});

test('la clase fija de la cuota, en una línea, lleva a Mis clases → Clase fija', async ({ page }) => {
  const { pedidas } = await montar(page, { bono: null, cuota: true, reservaFija: true, payload: (f) => {
    socia(f).plazasFijas = [{ id: 'pf-1', socioId: SOCIO_ID, diaSemana: 3, horaInicio: '10:00', salaId: 'sala-1', tipoClaseId: 'tc-r', estado: 'ACTIVA', vigenciaDesde: '2026-08-01', vigenciaHasta: null }];
  } });
  const fija = page.getByTestId('cuota-fija');
  await expect(fija).toContainText('Tu clase fija', { timeout: 45_000 });
  await expect(fija).toContainText('miércoles 10:00');
  await expect(fija).toHaveAttribute('href', `/portal/${SLUG}/mis-reservas?tab=fija`);
  expect(pedidas()).toBeGreaterThan(0);
});
