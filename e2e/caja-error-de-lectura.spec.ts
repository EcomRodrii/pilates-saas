import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { NO_SE_PUDO_LEER_LA_CAJA } from '../lib/pos/mensajes.ts';

// Cuando la Caja no puede LEER (un 500 del servidor o sin red), lo dice; nunca
// lo enseña como una cifra. Antes, las rutas tapaban una consulta caída con
// `caja: null` («caja cerrada», y la hoja ofrecía abrir otra encima) o con
// `esperado: 0` (un arqueo contra 0 €), y el «Hoy» salía a 0,00 €. Ahora
// contestan el fallo (app/api/pos/{catalogo,caja}/route.ts) y aquí se exige que
// la pantalla lo diga.
//
// ⚠️ Es dinero: se cuenta que la lectura se intentó (`> 0`) y que no sale
// ninguna petición que cobre o escriba (`= 0`).

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
  hoy: { ventas: 1, total: 12, ticketMedio: 12, porMetodo: [], ultimas: [] },
};
const ESTADO_CAJA = { caja: CAJA, esperado: 112, movimientos: [] };

type Lectura = 'bien' | '500' | 'sin-red';

async function abrirCaja(page: Page, catalogo: () => Lectura, caja: () => Lectura = () => 'bien') {
  const cuenta = { lecturasCatalogo: 0, lecturasCaja: 0, escrituras: [] as string[] };
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    const contesta = (como: Lectura, bien: unknown) =>
      como === 'sin-red' ? r.abort('failed') : como === '500' ? json(r, { error: NO_SE_PUDO_LEER_LA_CAJA }, 500) : json(r, bien);
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') { cuenta.lecturasCatalogo++; return contesta(catalogo(), CATALOGO); }
    if (req.method() === 'GET' && ruta === '/api/pos/caja') { cuenta.lecturasCaja++; return contesta(caja(), ESTADO_CAJA); }
    cuenta.escrituras.push(`${req.method()} ${ruta}`);
    return json(r, { error: 'no debería haberse pedido' }, 500);
  });
  await ir(page, 'pos');
  return cuenta;
}

for (const como of ['500', 'sin-red'] as const) {
  test(`el catálogo, con ${como === '500' ? 'un 500' : 'la red caída'}: dice que no pudo leer, nunca «Hoy 0,00 €», y «Reintentar» la abre`, async ({ page }) => {
    let lectura: Lectura = como;
    const cuenta = await abrirCaja(page, () => lectura);
    await expect(page.getByText('No hemos podido abrir el TPV')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(como === '500' ? NO_SE_PUDO_LEER_LA_CAJA : /No hemos podido conectar/)).toBeVisible();
    await expect(page.getByText('0,00 €')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Abrir caja/ })).toHaveCount(0);
    expect(cuenta.lecturasCatalogo).toBeGreaterThan(0);
    expect(cuenta.escrituras).toEqual([]);

    lectura = 'bien';
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText('Bono 10 clases').first()).toBeVisible({ timeout: 30_000 });
    expect(cuenta.escrituras).toEqual([]);
  });

  test(`la hoja de caja, con ${como === '500' ? 'un 500' : 'la red caída'}: dice que no pudo leer, sin «esperado» de 0 € ni «Abrir caja»`, async ({ page }) => {
    const cuenta = await abrirCaja(page, () => 'bien', () => como);
    await page.getByRole('button', { name: /Caja abierta/ }).click({ timeout: 30_000 });
    await expect(page.getByText(como === '500' ? NO_SE_PUDO_LEER_LA_CAJA : /No hemos podido conectar/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Debería haber/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Abrir caja/ })).toHaveCount(0);
    expect(cuenta.lecturasCaja).toBeGreaterThan(0);
    expect(cuenta.escrituras).toEqual([]);
  });
}
