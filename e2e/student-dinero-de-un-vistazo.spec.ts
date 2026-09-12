import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Las tres pantallas de dinero de la alumna, y la pregunta con la que se entra
// en cada una:
//
//   · Comprar → «¿cuál me sale mejor?»  ⇒ el precio POR CLASE.
//   · Pagos   → «¿debo algo?»           ⇒ el total pendiente, arriba.
//   · Bonos   → «¿cuántas me quedan?»   ⇒ la cifra, en grande.
//
// Las tres estaban respondidas en la pantalla y ninguna contestada: había que
// dividir de cabeza, leer la lista entera, o encontrar la respuesta en una
// línea de 11,5 px gris junto a la fecha de caducidad.
//
// ⚠️ Los tres tests de «no se pinta» son la mitad importante. Un precio por
// clase sobre un mensual ilimitado, o un total pendiente cuando no se debe
// nada, son números inventados — y un número inventado en una pantalla de
// dinero es peor que ningún número.

const base = `/portal/${SLUG}`;
const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

const PLANES = [
  { id: 'plan-bono8', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
  { id: 'plan-bono4', studioId: STUDIO_ID, nombre: 'Bono 4 sesiones', tipo: 'BONO', sesiones: 4, precio: 56, activo: true },
  { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 89, activo: true, periodicidadMeses: 1 },
  { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 16, activo: true },
];

async function montar(page: Page, o: { recibos?: unknown[]; suscripciones?: unknown[] } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = PLANES;
  const s = f.socia as Record<string, unknown>;
  if (o.recibos) s.recibos = o.recibos;
  if (o.suscripciones) s.suscripciones = o.suscripciones;
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
}

const recibo = (id: string, importe: number, estado: string, fecha: string) => ({
  id, socioId: SOCIO_ID, concepto: 'Mensual ilimitado', importe, estado,
  fechaCobro: estado === 'COBRADO' ? fecha : null,
  fechaVencimiento: estado === 'COBRADO' ? null : fecha,
  metodoCobro: 'SEPA', suscripcionId: null,
});

// ── Comprar ────────────────────────────────────────────────────────────────

test('la tienda dice lo que sale cada clase, para poder comparar bonos', async ({ page }) => {
  await montar(page);
  await page.goto(`${base}/comprar`);

  const bono8 = page.locator('article').filter({ hasText: 'Bono 8 sesiones' });
  const bono4 = page.locator('article').filter({ hasText: 'Bono 4 sesiones' });
  await expect(bono8.getByTestId('precio-por-clase')).toHaveText('12 €/clase');
  await expect(bono4.getByTestId('precio-por-clase')).toHaveText('14 €/clase');
});

test('una suscripción ilimitada NO enseña precio por clase: dependería de cuántas vaya', async ({ page }) => {
  await montar(page);
  await page.goto(`${base}/comprar`);
  const mensual = page.locator('article').filter({ hasText: 'Mensual ilimitado' });
  await expect(mensual).toBeVisible();
  await expect(mensual.getByTestId('precio-por-clase')).toHaveCount(0);
});

test('una clase suelta tampoco: su precio YA es el precio por clase', async ({ page }) => {
  await montar(page);
  await page.goto(`${base}/comprar`);
  const suelta = page.locator('article').filter({ hasText: 'Clase suelta' });
  await expect(suelta).toBeVisible();
  await expect(suelta.getByTestId('precio-por-clase')).toHaveCount(0);
});

// ── Pagos ──────────────────────────────────────────────────────────────────

test('Pagos abre diciendo cuánto se debe, y agrupa por mes', async ({ page }) => {
  await montar(page, {
    recibos: [
      recibo('r1', 89, 'PENDIENTE', '2026-09-01'),
      recibo('r2', 96, 'COBRADO', '2026-08-01'),
      recibo('r3', 89, 'COBRADO', '2026-07-01'),
    ],
  });
  await page.goto(`${base}/pagos`);

  const total = page.getByTestId('total-pendiente');
  await expect(total).toContainText('Te queda por pagar');
  await expect(total).toContainText('89 €');
  await expect(total).toContainText('1 recibo sin cobrar');

  // Los tabiques de mes: sin ellos, doce recibos iguales son un muro.
  await expect(page.getByText('Septiembre de 2026')).toBeVisible();
  await expect(page.getByText('Agosto de 2026')).toBeVisible();
  await expect(page.getByText('Julio de 2026')).toBeVisible();
});

test('sin nada pendiente NO se pinta ningún aviso de deuda', async ({ page }) => {
  await montar(page, { recibos: [recibo('r2', 96, 'COBRADO', '2026-08-01')] });
  await page.goto(`${base}/pagos`);
  await expect(page.getByText('Agosto de 2026')).toBeVisible();
  await expect(page.getByTestId('total-pendiente')).toHaveCount(0);
});

test('un recibo DEVUELTO por el banco cuenta como deuda, no como reembolso', async ({ page }) => {
  // El estado se llama `DEVUELTO` y suena a dinero que vuelve; es lo
  // contrario: el banco rechazó el cobro y el importe se sigue debiendo. La
  // fila ya lo decía bien, así que el total tiene que decir lo mismo.
  await montar(page, { recibos: [recibo('r1', 89, 'DEVUELTO', '2026-09-01')] });
  await page.goto(`${base}/pagos`);
  await expect(page.getByTestId('total-pendiente')).toContainText('89 €');
});

// ── Bonos ──────────────────────────────────────────────────────────────────

test('Bonos enseña las sesiones que quedan en la tipografía de cifra, no en un pie', async ({ page }) => {
  await montar(page, {
    suscripciones: [{
      id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono8', estado: 'ACTIVA',
      sesionesRestantes: 5, fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
    }],
  });
  await page.goto(`${base}/bonos`);

  const cifra = page.getByTestId('bono-restantes');
  await expect(cifra).toHaveText('5');
  // 34 px es `--t-display`, el escalón que la hoja describe como «un importe,
  // un saldo: la cifra que se viene a mirar». Se comprueba el tamaño PINTADO
  // y no la clase: una clase presente pero pisada no se vería.
  await expect(cifra).toHaveCSS('font-size', '34px');
  await expect(page.getByText('Te quedan')).toBeVisible();
  await expect(page.getByText('de 8 sesiones')).toBeVisible();
});

test('un plan ilimitado no enseña ninguna cifra de sesiones', async ({ page }) => {
  await montar(page, {
    suscripciones: [{
      id: 'sus-2', socioId: SOCIO_ID, planId: 'plan-mes', estado: 'ACTIVA',
      sesionesRestantes: null, fechaInicio: '2026-08-01', fechaFin: '2026-12-31',
    }],
  });
  await page.goto(`${base}/bonos`);
  await expect(page.getByText('Clases sin límite')).toBeVisible();
  await expect(page.getByTestId('bono-restantes')).toHaveCount(0);
});
