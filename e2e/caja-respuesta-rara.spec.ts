import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// La Caja (/pos) ya no cae entera en «Algo ha ido mal» cuando el servidor
// contesta con otra forma: un 200 con `{}` (lo que contesta el andamiaje e2e
// a toda la API), un campo a `null`, una lista que no es lista. Lo que lee se
// comprueba antes de pintarlo (lib/pos/leer-respuestas.ts) y la pantalla dice
// qué falta, con «Reintentar».
//
// ⚠️ Es dinero: en el camino raro se cuenta que NO sale ninguna petición que
// cobre o escriba (venta, confirmar, caja, stock…), y que la lectura sí se
// intentó (`expect(lecturas).toBeGreaterThan(0)`): un test que pasa porque no
// se pidió nada no prueba nada.

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 860 } });
// La primera visita a /pos o /cierre compila la ruta en el `next dev`.
test.describe.configure({ timeout: 90_000 });

const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const CAJA = { id: 'caja-1', fondoInicial: 100, abiertaEn: new Date().toISOString(), abiertaPor: 'Cloe' };
const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: false, datafonoProveedor: null, sumupDisponible: false },
  productos: [{ id: 'p1', nombre: 'Calcetines antideslizantes', descripcion: null, categoria: 'Ropa', precio: 12, activo: true, stock: 10, stockMinimo: 2, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null }],
  planes: [{ id: 'pl-bono10', nombre: 'Bono 10 clases', descripcion: null, precio: 130, tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 }],
  caja: CAJA,
  hoy: { ventas: 1, total: 12, ticketMedio: 12, porMetodo: [{ metodo: 'EFECTIVO', n: 1, total: 12 }], ultimas: [] },
};
const ESTADO_CAJA = { caja: CAJA, esperado: 112, movimientos: [] };

/** Monta el panel con la Caja contestando `catalogo` y `estadoCaja`, y cuenta lo que pide. */
async function abrirCaja(page: Page, catalogo: () => unknown, estadoCaja: () => unknown = () => ESTADO_CAJA) {
  const cuenta = { lecturasCatalogo: 0, lecturasCaja: 0, escrituras: [] as string[] };
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') { cuenta.lecturasCatalogo++; return json(r, catalogo()); }
    if (req.method() === 'GET' && ruta === '/api/pos/caja') { cuenta.lecturasCaja++; return json(r, estadoCaja()); }
    // Cualquier otra cosa del TPV (vender, confirmar un pago, abrir o cerrar
    // caja, stock…) cuenta como escritura: en el camino raro no debe salir ninguna.
    cuenta.escrituras.push(`${req.method()} ${ruta}`);
    return json(r, { error: 'no debería haberse pedido' }, 500);
  });
  await ir(page, 'pos');
  return cuenta;
}

test('con la forma de siempre, la Caja se abre como hoy', async ({ page }) => {
  const cuenta = await abrirCaja(page, () => CATALOGO);
  await expect(page.getByText('Bono 10 clases').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Calcetines antideslizantes').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Caja abierta/ })).toBeVisible();
  await expect(page.getByText('No hemos podido abrir el TPV')).toHaveCount(0);
  expect(cuenta.lecturasCatalogo).toBeGreaterThan(0);
  expect(cuenta.escrituras).toEqual([]);
});

test('con un `{}`, la Caja no se cae: dice qué falta, no cobra nada y «Reintentar» la abre cuando el servidor contesta bien', async ({ page }) => {
  let respuesta: unknown = {};
  const cuenta = await abrirCaja(page, () => respuesta);
  await expect(page.getByText('No hemos podido abrir el TPV')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/no trae el IVA por defecto, cómo se puede cobrar, los productos/)).toBeVisible();
  await expect(page.getByText(/Esta lectura no cobra ni cambia nada, y lo que ya hayas hecho sigue hecho/)).toBeVisible();
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
  // Ni un artículo a la vista que se pueda meter en un ticket.
  await expect(page.getByText('Bono 10 clases')).toHaveCount(0);
  expect(cuenta.lecturasCatalogo).toBeGreaterThan(0);
  expect(cuenta.escrituras).toEqual([]);

  const antes = cuenta.lecturasCatalogo;
  respuesta = CATALOGO;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Bono 10 clases').first()).toBeVisible({ timeout: 30_000 });
  expect(cuenta.lecturasCatalogo).toBeGreaterThan(antes);
  expect(cuenta.escrituras).toEqual([]);
});

test('con un campo a `null` o una lista que no es lista, dice cuál y no cobra nada', async ({ page }) => {
  const cuenta = await abrirCaja(page, () => ({ ...CATALOGO, productos: null, planes: { 'pl-bono10': 1 } }));
  await expect(page.getByText(/no trae los productos ni los bonos y cuotas/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
  expect(cuenta.lecturasCatalogo).toBeGreaterThan(0);
  expect(cuenta.escrituras).toEqual([]);
});

test('sin saber si la caja está abierta no se da por cerrada: no ofrece «Abrir caja»', async ({ page }) => {
  const { caja: _c, ...sinCaja } = CATALOGO;
  const cuenta = await abrirCaja(page, () => sinCaja);
  await expect(page.getByText(/no trae si la caja está abierta/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Abrir caja/ })).toHaveCount(0);
  expect(cuenta.escrituras).toEqual([]);
});

test('la hoja de caja, con un `{}`: dice qué falta y no ofrece ni abrir caja ni el arqueo', async ({ page }) => {
  const cuenta = await abrirCaja(page, () => CATALOGO, () => ({}));
  await page.getByRole('button', { name: /Caja abierta/ }).click({ timeout: 30_000 });
  await expect(page.getByText(/no trae si la caja está abierta, lo que debería haber en la caja ni los movimientos/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Abrir caja/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Cerrar caja|Hacer arqueo/ })).toHaveCount(0);
  expect(cuenta.lecturasCaja).toBeGreaterThan(0);
  expect(cuenta.escrituras).toEqual([]);
});

test('la hoja de caja, si la recarga tras apuntar un movimiento falla: no deja a la vista el «esperado» de antes', async ({ page }) => {
  let leer: 'bien' | '500' = 'bien';
  const cuenta = { movimientos: 0 };
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') return json(r, CATALOGO);
    if (req.method() === 'GET' && ruta === '/api/pos/caja') return leer === 'bien' ? json(r, ESTADO_CAJA) : json(r, { error: 'No hemos podido leer la caja.' }, 500);
    // El movimiento sí se apunta (es lo que se quiere probar: la recarga de después).
    if (req.method() === 'POST' && ruta === '/api/pos/caja') { cuenta.movimientos++; leer = '500'; return json(r, { ok: true, saldo: 122 }); }
    return json(r, { error: 'no debería haberse pedido' }, 500);
  });
  await ir(page, 'pos');
  await page.getByRole('button', { name: /Caja abierta/ }).click({ timeout: 30_000 });
  await expect(page.getByText('Debería haber en el cajón')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Meter dinero/ }).click();
  await page.getByPlaceholder('0,00').fill('10');
  await page.getByPlaceholder(/¿De qué es\?/).fill('Cambio');
  await page.getByRole('button', { name: 'Apuntar' }).click();
  await expect(page.getByText('No hemos podido leer la caja.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Debería haber en el cajón')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Abrir caja/ })).toHaveCount(0);
  expect(cuenta.movimientos).toBe(1);
});

test.describe('Cierre, con el dedo en el iPad', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('«Descargar libro completo (CSV)» tiene 44 px de zona táctil sin cambiar de tamaño', async ({ page }) => {
    await montar(page);
    await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
    await ir(page, 'cierre');
    const csv = page.getByRole('button', { name: 'Descargar libro completo (CSV) →' });
    await expect(csv).toBeVisible({ timeout: 30_000 });
    const medida = await csv.evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      // Un círculo de 44 px: lados a 21, diagonales a 15 (Chromium no da por
      // tocada la esquina de una caja redondeada).
      const fuera = [[0, 0], [0, -21], [0, 21], [-15, -15], [15, -15], [-15, 15], [15, 15]]
        .filter(([dx, dy]) => { const hit = document.elementFromPoint(cx + dx, cy + dy); return !hit || !(hit === el || el.contains(hit)); });
      return { alto: Math.round(r.height), fuera: fuera.length };
    });
    // El dibujo sigue siendo el de un enlace (20 px); la zona, 44.
    expect(medida.alto).toBeLessThan(24);
    expect(medida.fuera).toBe(0);
  });
});
