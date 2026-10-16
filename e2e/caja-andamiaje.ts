import { expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// El andamiaje de la Caja (/pos) con el panel sembrado: catálogo, caja abierta y un
// contador de cada petición a la vista previa y a la venta. Lo usan las specs que
// prueban caminos de dinero de la Caja: cada camino cuenta las peticiones, porque un
// «no dijo Cobrado» sin contador puede ser verdad por no haber intentado nada.

export const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

export const CAJA = { id: 'caja-1', fondoInicial: 100, abiertaEn: new Date().toISOString(), abiertaPor: 'Cloe' };
export const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: false, datafonoProveedor: null, sumupDisponible: false },
  productos: [{ id: 'p1', nombre: 'Calcetines antideslizantes', descripcion: null, categoria: 'Ropa', precio: 12, activo: true, stock: 10, stockMinimo: 2, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null }],
  planes: [{ id: 'pl-bono10', nombre: 'Bono 10 clases', descripcion: null, precio: 130, tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 }],
  caja: CAJA,
  hoy: { ventas: 0, total: 0, ticketMedio: 0, porMetodo: [], ultimas: [] },
};
export const CON_MATRICULA = { total: 145, matricula: 15, matriculaPlanId: 'pl-bono10' };

export function ventaHecha(total: number, cambio: number | null) {
  return {
    ventaId: 'vpos-1', numero: 7, subtotal: total, descuento: 0, baseImponible: Math.round((total / 1.21) * 100) / 100,
    ivaTotal: Math.round((total - total / 1.21) * 100) / 100, total, cambio, estado: 'PAGADA', pagoEstado: 'PAGADO',
    entrega: { bonos: 1, creditos: 0, facturaSellada: false, avisos: [] },
  };
}

export type Contesta = (r: Route, cuerpo: Record<string, unknown>, intento: number) => Promise<void> | void;

export async function abrirCaja(
  page: Page, presupuesto: Contesta, venta: Contesta,
  // `datafono`: con un datáfono emparejado, y `confirmar` contesta a la consulta del cobro.
  opciones: { codigos?: Record<string, unknown>[]; datafono?: boolean; confirmar?: Contesta } = {},
) {
  const cuenta = {
    presupuestos: [] as Record<string, unknown>[], ventas: [] as Record<string, unknown>[],
    confirmaciones: [] as Record<string, unknown>[],
  };
  const catalogo = opciones.datafono ? { ...CATALOGO, cobro: { ...CATALOGO.cobro, datafonoEmparejado: true } } : CATALOGO;
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true }));
  // Los códigos de descuento del estudio: el panel los lee de su tabla.
  if (opciones.codigos) await page.route('**/rest/v1/codigos_descuento**', (r) => json(r, opciones.codigos));
  await page.route((u) => u.pathname.startsWith('/api/pos/'), (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname;
    const cuerpo = req.method() === 'POST' ? JSON.parse(req.postData() ?? '{}') as Record<string, unknown> : {};
    if (req.method() === 'GET' && ruta === '/api/pos/catalogo') return json(r, catalogo);
    if (req.method() === 'GET' && ruta === '/api/pos/caja') return json(r, { caja: CAJA, esperado: 100, movimientos: [] });
    if (ruta === '/api/pos/venta/presupuesto') { cuenta.presupuestos.push(cuerpo); return presupuesto(r, cuerpo, cuenta.presupuestos.length); }
    if (ruta === '/api/pos/venta') { cuenta.ventas.push(cuerpo); return venta(r, cuerpo, cuenta.ventas.length); }
    if (ruta === '/api/pos/venta/confirmar' && opciones.confirmar) {
      cuenta.confirmaciones.push(cuerpo);
      return opciones.confirmar(r, cuerpo, cuenta.confirmaciones.length);
    }
    return json(r, {});
  });
  await ir(page, 'pos');
  await expect(page.getByRole('button', { name: /^Bono 10 clases/ })).toBeVisible({ timeout: 30_000 });
  return cuenta;
}

/** La hoja de cobro. Fuera de ella también hay un «Efectivo»: el de cobrar la deuda de la clienta. */
export const hoja = (page: Page) => page.getByRole('dialog', { name: 'Cobrar' });

export async function bonoParaLaura(page: Page) {
  await page.getByRole('button', { name: /^Bono 10 clases/ }).click();
  await page.getByLabel('Buscar').fill('Laura');
  await page.getByRole('button', { name: 'Laura Martín' }).click();
}
