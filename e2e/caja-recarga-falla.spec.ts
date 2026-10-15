import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// Si falla una RECARGA del catálogo de la Caja (tras vender, cobrar una deuda o
// cerrar la caja), el TPV ya no se sustituye entero por «No hemos podido abrir el
// TPV»: eso cerraba la hoja abierta y se perdía de vista, por ejemplo, el
// resultado del arqueo recién hecho. Ahora se queda, con un aviso arriba que dice
// que lo de debajo es de antes del fallo. La pantalla de error sigue para cuando
// la Caja no llegó a cargar nunca.

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
const FALLO = 'No hemos podido leer la Caja ahora mismo.';

/** La Caja con la caja abierta; `cerrar` la cierra en el servidor y, desde ahí, el catálogo falla. */
async function abrirCaja(page: Page, opciones: { primeraCargaFalla?: boolean } = {}) {
  const estado = { cerrada: false, catalogoFalla: !!opciones.primeraCargaFalla, cierres: 0, lecturasCatalogo: 0, otras: [] as string[] };
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), async (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') {
      estado.lecturasCatalogo++;
      return estado.catalogoFalla ? json(r, { error: FALLO }, 500) : json(r, estado.cerrada ? { ...CATALOGO, caja: null } : CATALOGO);
    }
    if (req.method() === 'GET' && ruta === '/api/pos/caja') {
      return json(r, estado.cerrada ? { caja: null, movimientos: [], esperado: 0 } : { caja: CAJA, esperado: 112, movimientos: [] });
    }
    if (req.method() === 'POST' && ruta === '/api/pos/caja' && (req.postDataJSON() as { accion?: string })?.accion === 'cerrar') {
      estado.cierres++;
      estado.cerrada = true;
      estado.catalogoFalla = true;
      return json(r, { esperado: 112, contado: 110, diferencia: -2 });
    }
    estado.otras.push(`${req.method()} ${ruta}`);
    return json(r, { error: 'no debería haberse pedido' }, 500);
  });
  await ir(page, 'pos');
  return estado;
}

test('cierro la caja y la recarga del catálogo falla: el arqueo sigue a la vista, con un aviso arriba', async ({ page }) => {
  const estado = await abrirCaja(page);
  await page.getByRole('button', { name: /Caja abierta/ }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cerrar caja y cuadrar' }).click({ timeout: 15_000 });
  await page.getByPlaceholder('0,00').fill('110');
  const antes = estado.lecturasCatalogo;
  await page.getByRole('button', { name: 'Cerrar caja', exact: true }).click();

  // El resultado del arqueo no se pierde…
  await expect(page.getByText('Caja cerrada')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/-2,00/)).toBeVisible();
  // …la recarga sí se intentó, falló, y se dice sin quitar el TPV.
  await expect.poll(() => estado.lecturasCatalogo).toBeGreaterThan(antes);
  const aviso = page.getByTestId('aviso-recarga-caja');
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('esos datos son de antes de este fallo');
  await expect(aviso).toContainText('no cobra ni cambia nada, y lo que ya hayas hecho sigue hecho');
  // Sin el motivo: un «Inténtalo de nuevo» justo tras cerrar o cobrar se leería
  // como «no ha salido, repítelo».
  await expect(aviso).not.toContainText(FALLO);
  await expect(page.getByText('No hemos podido abrir el TPV')).toHaveCount(0);
  expect(estado.cierres).toBe(1);
  expect(estado.otras).toEqual([]);

  // Se cierra la hoja («Hecho»): el aviso sigue, y el botón de la caja ya no dice
  // «Caja abierta» (es dato de antes del cierre), solo «Caja».
  await page.getByRole('button', { name: 'Hecho', exact: true }).click();
  await expect(aviso).toBeVisible();
  await expect(page.getByRole('button', { name: 'Caja', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Caja abierta/ })).toHaveCount(0);

  // «Reintentar» que vuelve a fallar: lee otra vez y el aviso sigue.
  const lecturas = estado.lecturasCatalogo;
  await aviso.getByRole('button', { name: 'Reintentar' }).click();
  await expect.poll(() => estado.lecturasCatalogo).toBeGreaterThan(lecturas);
  await expect(aviso.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  await expect(aviso).toBeVisible();

  // Y cuando el servidor contesta, el aviso se va y se ve la caja como está: cerrada.
  estado.catalogoFalla = false;
  await aviso.getByRole('button', { name: 'Reintentar' }).click();
  await expect(aviso).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Abrir caja/ })).toBeVisible();
  expect(estado.cierres).toBe(1);
  expect(estado.otras).toEqual([]);
});

test('si la Caja no llegó a cargar nunca, sigue la pantalla de error de siempre', async ({ page }) => {
  const estado = await abrirCaja(page, { primeraCargaFalla: true });
  await expect(page.getByText('No hemos podido abrir el TPV')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(FALLO)).toBeVisible();
  await expect(page.getByTestId('aviso-recarga-caja')).toHaveCount(0);
  expect(estado.lecturasCatalogo).toBeGreaterThan(0);
  expect(estado.otras).toEqual([]);
});
