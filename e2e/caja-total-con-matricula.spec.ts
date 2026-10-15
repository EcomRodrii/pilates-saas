import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { mensajeTotalNoCoincide } from '../lib/pos/total-esperado.ts';

// La Caja cobra el total que enseña, matrícula incluida.
//
// `registrar_venta_pos` añade por su cuenta la matrícula del primer plan de una
// clienta. La hoja de cobro enseñaba el total sin ella: con tarjeta, «Sí, he
// cobrado 130 €» quedaba registrado como 145 €; en efectivo, «Cambio 20» y
// después «Devuelve 5». Ahora el total sale de la misma RPC
// (`/api/pos/venta/presupuesto`), la venta manda el que se ha visto
// (`totalEsperado`) y el servidor la rechaza si no es el suyo (409
// IMPORTE_NO_COINCIDE).
//
// ⚠️ Es dinero: cada camino cuenta las peticiones. Un «no dijo Cobrado» sin
// contador puede ser verdad por no haber intentado nada.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 860 } });
// La primera visita a /pos compila la ruta en el `next dev`.
test.describe.configure({ timeout: 90_000 });

const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const CAJA = { id: 'caja-1', fondoInicial: 100, abiertaEn: new Date().toISOString(), abiertaPor: 'Cloe' };
const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: false, datafonoProveedor: null, sumupDisponible: false },
  productos: [{ id: 'p1', nombre: 'Calcetines antideslizantes', descripcion: null, categoria: 'Ropa', precio: 12, activo: true, stock: 10, stockMinimo: 2, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null }],
  planes: [{ id: 'pl-bono10', nombre: 'Bono 10 clases', descripcion: null, precio: 130, tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 }],
  caja: CAJA,
  hoy: { ventas: 0, total: 0, ticketMedio: 0, porMetodo: [], ultimas: [] },
};
const CON_MATRICULA = { total: 145, matricula: 15, matriculaPlanId: 'pl-bono10' };

function ventaHecha(total: number, cambio: number | null) {
  return {
    ventaId: 'vpos-1', numero: 7, subtotal: total, descuento: 0, baseImponible: Math.round((total / 1.21) * 100) / 100,
    ivaTotal: Math.round((total - total / 1.21) * 100) / 100, total, cambio, estado: 'PAGADA', pagoEstado: 'PAGADO',
    entrega: { bonos: 1, creditos: 0, facturaSellada: false, avisos: [] },
  };
}

type Contesta = (r: Route, cuerpo: Record<string, unknown>, intento: number) => Promise<void> | void;

async function abrirCaja(page: Page, presupuesto: Contesta, venta: Contesta) {
  const cuenta = { presupuestos: [] as Record<string, unknown>[], ventas: [] as Record<string, unknown>[] };
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    const cuerpo = req.method() === 'POST' ? JSON.parse(req.postData() ?? '{}') as Record<string, unknown> : {};
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') return json(r, CATALOGO);
    if (req.method() === 'GET' && ruta === '/api/pos/caja') return json(r, { caja: CAJA, esperado: 100, movimientos: [] });
    if (ruta === '/api/pos/venta/presupuesto') { cuenta.presupuestos.push(cuerpo); return presupuesto(r, cuerpo, cuenta.presupuestos.length); }
    if (ruta === '/api/pos/venta') { cuenta.ventas.push(cuerpo); return venta(r, cuerpo, cuenta.ventas.length); }
    return json(r, {});
  });
  await ir(page, 'pos');
  await expect(page.getByRole('button', { name: /^Bono 10 clases/ })).toBeVisible({ timeout: 30_000 });
  return cuenta;
}

/** La hoja de cobro. Fuera de ella también hay un «Efectivo»: el de cobrar la deuda de la clienta. */
const hoja = (page: Page) => page.getByRole('dialog', { name: 'Cobrar' });

async function bonoParaLaura(page: Page) {
  await page.getByRole('button', { name: /^Bono 10 clases/ }).click();
  await page.getByLabel('Buscar').fill('Laura');
  await page.getByRole('button', { name: 'Laura Martín' }).click();
}

test('con clienta y su primer plan, el ticket y la hoja de cobro llevan la matrícula, y con tarjeta se afirma y se manda ese total', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r) => json(r, CON_MATRICULA), (r) => json(r, ventaHecha(145, null)));
  await bonoParaLaura(page);

  const linea = page.getByTestId('linea-matricula');
  await expect(linea).toContainText('Matrícula — Bono 10 clases');
  await expect(linea).toContainText('15,00 €');
  await page.getByRole('button', { name: 'Cobrar 145,00 €' }).click();

  await expect(hoja(page).getByText('145,00 €', { exact: true }).first()).toBeVisible();
  await expect(hoja(page).getByTestId('cobro-matricula')).toHaveText('Incluye Matrícula — Bono 10 clases · 15,00 €');
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 145,00 €' }).click();
  await expect(page.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.presupuestos.length).toBeGreaterThan(0);
  expect(cuenta.presupuestos.at(-1)).toMatchObject({ socioId: 'soc-2' });
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ metodoPago: 'TARJETA', socioId: 'soc-2', totalEsperado: 145 });
});

test('en efectivo, el cambio se calcula sobre el total con matrícula', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r) => json(r, CON_MATRICULA), (r) => json(r, ventaHecha(145, 5)));
  await bonoParaLaura(page);
  await page.getByRole('button', { name: 'Cobrar 145,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();

  // Con 140 € no llega (antes, contra 130, daba «Cambio 10»).
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('140');
  await expect(hoja(page).getByText('Falta')).toBeVisible();
  await expect(hoja(page).getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('150');
  await expect(hoja(page).getByText('Cambio')).toBeVisible();
  await expect(hoja(page).getByText('5,00 €', { exact: true })).toBeVisible();
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ metodoPago: 'EFECTIVO', efectivoRecibido: 150, totalEsperado: 145 });
});

test('si el servidor dice que el total no es ese, no dice «Registrado», enseña el de verdad y el siguiente intento manda ese', async ({ page }) => {
  // La vista previa se cae: la Caja enseña el total del ticket y lo dice. La venta lo
  // comprueba igual, y ahí sale la matrícula.
  const rechazo = { esperado: 130, total: 145, matricula: 15 };
  const cuenta = await abrirCaja(
    page,
    (r) => json(r, { error: 'No hemos podido calcular el total.' }, 500),
    (r, _c, intento) => intento === 1
      ? json(r, { error: mensajeTotalNoCoincide(rechazo), codigo: 'IMPORTE_NO_COINCIDE', ...CON_MATRICULA }, 409)
      : json(r, ventaHecha(145, null)),
  );
  await bonoParaLaura(page);
  await expect(page.getByText(/Al cobrar se vuelve a comprobar el total/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Cobrar 130,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 130,00 €' }).click();

  await expect(page.getByText('No se ha completado el cobro')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/El total de esta venta es 145,00 €/)).toBeVisible();
  await expect(page.getByText(/No se ha registrado ni cobrado nada/)).toBeVisible();
  await expect(page.getByText('Registrado', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Cobrado', { exact: true })).toHaveCount(0);
  // Se intentó de verdad, y con el total que se veía.
  expect(cuenta.ventas.length).toBeGreaterThan(0);
  expect(cuenta.ventas[0]).toMatchObject({ totalEsperado: 130 });

  await hoja(page).getByRole('button', { name: 'Probar otra vez' }).click();
  await expect(hoja(page).getByTestId('cobro-matricula')).toHaveText('Incluye Matrícula — Bono 10 clases · 15,00 €');
  await hoja(page).getByRole('button', { name: /^Tarjeta/ }).click();
  await hoja(page).getByRole('button', { name: 'Sí, he cobrado 145,00 €' }).click();
  await expect(page.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(cuenta.ventas).toHaveLength(2);
  expect(cuenta.ventas[1]).toMatchObject({ totalEsperado: 145 });
});

test('sin clienta no puede haber matrícula: no se pregunta, y la venta manda el total del ticket', async ({ page }) => {
  const cuenta = await abrirCaja(page, (r) => json(r, CON_MATRICULA), (r) => json(r, ventaHecha(130, 0)));
  await page.getByRole('button', { name: /^Bono 10 clases/ }).click();
  await page.getByRole('button', { name: 'Cobrar 130,00 €' }).click();
  await hoja(page).getByRole('button', { name: /^Efectivo/ }).click();
  await hoja(page).getByLabel('¿Con cuánto paga?').fill('130');
  await hoja(page).getByRole('button', { name: 'Confirmar pago' }).click();
  await expect(page.getByText('Cobrado', { exact: true })).toBeVisible({ timeout: 15_000 });

  expect(cuenta.presupuestos).toHaveLength(0);
  expect(cuenta.ventas).toHaveLength(1);
  expect(cuenta.ventas[0]).toMatchObject({ socioId: null, totalEsperado: 130 });
});
