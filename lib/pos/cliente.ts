'use client';

import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import type { Factura } from '@/lib/types';
import type { PeticionVenta, EstadoPagoPOS, EstadoVentaPOS } from './tipos.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente del TPV. Vive aparte de `lib/api-client.ts` (3.000 líneas) porque es
// una superficie propia y acotada, y porque así el POS no arrastra el resto.
//
// Todas devuelven `{ ok } | { error }` en vez de lanzar: en un mostrador, una
// excepción sin capturar deja la pantalla en blanco con una clienta delante.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductoPOSCatalogo {
  id: string; nombre: string; descripcion: string | null; categoria: string;
  precio: number; activo: boolean; stock: number | null; stockMinimo: number;
  ivaPct: number; imagenUrl: string | null; sku: string | null; codigoBarras: string | null;
}
export interface PlanPOSCatalogo {
  id: string; nombre: string; descripcion: string | null; precio: number;
  tipo: 'MENSUAL' | 'BONO' | 'PUNTUAL'; sesiones: number | null;
  validezDias: number | null; ivaPct: number;
}
export interface CajaAbierta {
  id: string; fondoInicial: number; abiertaEn: string; abiertaPor: string | null;
}
export interface ResumenHoy {
  ventas: number; total: number; ticketMedio: number;
  porMetodo: { metodo: string; n: number; total: number }[];
  ultimas: { id: string; numero: number; total: number; metodoPago: string; realizadaEn: string; socioId: string | null }[];
}
export interface CatalogoPOS {
  ivaDefecto: number;
  cobro: { stripeConectado: boolean; datafonoEmparejado: boolean };
  productos: ProductoPOSCatalogo[];
  planes: PlanPOSCatalogo[];
  caja: CajaAbierta | null;
  hoy: ResumenHoy;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init?.headers ?? {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as T;
  } catch {
    return { error: 'No hemos podido conectar. Comprueba la conexión.' };
  }
}

export function cargarCatalogoPOS() {
  return pedir<CatalogoPOS>('/api/pos/catalogo');
}

export interface RespuestaVenta {
  ventaId: string; numero: number; subtotal: number; descuento: number;
  baseImponible: number; ivaTotal: number; total: number; cambio: number | null;
  estado: EstadoVentaPOS; pagoEstado: EstadoPagoPOS; yaExistia?: boolean;
  pago?: { referencia: string; url?: string | null };
  entrega?: { bonos: number; creditos: number; facturaSellada: boolean; avisos: string[] };
  codigo?: string;
}

export function registrarVenta(p: PeticionVenta) {
  return pedir<RespuestaVenta>('/api/pos/venta', { method: 'POST', body: JSON.stringify(p) });
}

export interface RespuestaConfirmacion {
  ventaId: string; numero: number; estado: EstadoVentaPOS; pagoEstado: EstadoPagoPOS;
  total: number; motivo?: string | null; aviso?: string;
  entrega?: { bonos: number; creditos: number; facturaSellada: boolean; avisos: string[] };
}

export function confirmarPago(ventaId: string, accion: 'consultar' | 'cancelar' = 'consultar') {
  return pedir<RespuestaConfirmacion>('/api/pos/venta/confirmar', {
    method: 'POST', body: JSON.stringify({ ventaId, accion }),
  });
}

export interface EstadoCaja {
  caja: CajaAbierta | null;
  esperado: number;
  movimientos: {
    id: string; tipo: string; importe: number; metodoPago: string;
    concepto: string; referencia: string | null; creadoEn: string; creadoPor: string | null;
  }[];
}

export function cargarCaja() { return pedir<EstadoCaja>('/api/pos/caja'); }

export function abrirCaja(fondoInicial: number) {
  return pedir<{ cajaId: string; yaAbierta: boolean }>('/api/pos/caja', {
    method: 'POST', body: JSON.stringify({ accion: 'abrir', fondoInicial }),
  });
}

export function moverCaja(p: { tipo: 'ENTRADA' | 'SALIDA'; importe: number; concepto: string }) {
  return pedir<{ ok: true; saldo: number }>('/api/pos/caja', {
    method: 'POST', body: JSON.stringify({ accion: 'mover', ...p }),
  });
}

export function cerrarCaja(efectivoContado: number, notas?: string) {
  return pedir<{ esperado: number; contado: number; diferencia: number }>('/api/pos/caja', {
    method: 'POST', body: JSON.stringify({ accion: 'cerrar', efectivoContado, notas }),
  });
}

/**
 * La factura de una venta ya cobrada, para dársela a quien la pide en el
 * mostrador. Devuelve `factura: null` con un `motivo` legible cuando todavía
 * no está sellada — un hueco mudo dejaría a quien atiende sin nada que decir.
 */
export function cargarFacturaVenta(ventaId: string) {
  return pedir<{ factura: Factura | null; receptor: { telefono: string | null; email: string | null } | null; motivo?: string; numeroVenta?: number }>(
    `/api/pos/factura?ventaId=${encodeURIComponent(ventaId)}`,
  );
}

/**
 * Engancha a una ficha una venta que se cobró sin clienta (clase de prueba,
 * compra de mostrador). El bono se entrega en ese momento, no antes.
 */
export function asignarVentaAClienta(ventaId: string, socioId: string) {
  return pedir<{ ok: true; numero: number | null; reciboId: string | null; entrega: { bonos: number; creditos: number; facturaSellada: boolean; avisos: string[] } }>(
    '/api/pos/venta/asignar', { method: 'POST', body: JSON.stringify({ ventaId, socioId }) },
  );
}

export function devolverVenta(p: { ventaId: string; lineas?: { lineaId: string; cantidad: number }[]; motivo?: string }) {
  return pedir<{ ok: true; devolucionId: string; importe: number; esTotal: boolean; dineroDevuelto: boolean; creditosRetirados: number; enEfectivo: boolean }>(
    '/api/pos/devolucion', { method: 'POST', body: JSON.stringify(p) },
  );
}

/**
 * Apunta en el libro de caja un recibo que se acaba de cobrar a mano.
 *
 * No lleva importe ni método: los lee el servidor de la base. Un apunte de
 * caja cuyo importe viniera del navegador sería un descuadre a un `fetch` de
 * distancia.
 *
 * `apuntado: false` no es un fallo — sin caja abierta, o cobrado por
 * transferencia o SEPA, no hay nada que apuntar y el motivo lo dice.
 */
export function apuntarCobroEnCaja(reciboId: string) {
  return pedir<{ apuntado: boolean; importe: number; motivo: string | null }>(
    '/api/pos/caja/apuntar-cobro', { method: 'POST', body: JSON.stringify({ reciboId }) },
  );
}

export interface MovimientoStock {
  id: string; fecha: string;
  tipo: 'ENTRADA' | 'MERMA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION';
  /** Con signo: +12 entraron, −3 se perdieron. */
  cantidad: number;
  stockResultante: number | null;
  detalle: string | null;
  quien: string | null;
}

export function cargarStock(productoId: string) {
  return pedir<{
    producto: { id: string; nombre: string; stock: number | null; stockMinimo: number };
    movimientos: MovimientoStock[];
  }>(`/api/pos/stock?productoId=${encodeURIComponent(productoId)}`);
}

/**
 * ⚠️ `cantidad` significa dos cosas según el tipo, y la pantalla lo pregunta
 * en consecuencia: unidades que entran o se pierden en ENTRADA/MERMA, y
 * cuántas HAY de verdad en AJUSTE. La diferencia la calcula el servidor con la
 * fila bloqueada, para que no se cuele una venta entre contar y guardar.
 */
export function moverStock(p: {
  productoId: string; tipo: 'ENTRADA' | 'MERMA' | 'AJUSTE'; cantidad: number;
  motivo?: string; costeUnitario?: number;
}) {
  return pedir<{ ok: true; stockAnterior: number | null; stock: number | null; delta: number }>(
    '/api/pos/stock', { method: 'POST', body: JSON.stringify(p) },
  );
}

// ─── Cobrar un recibo desde el mostrador ─────────────────────────────────────
// Efectivo NO pasa por aquí: lo cierra `marcarCobrado` del contexto (y lo
// apunta en caja el servidor). Esto es solo para lo que confirma un tercero.

export function cobrarReciboEnMostrador(reciboId: string, metodo: 'DATAFONO' | 'BIZUM') {
  return pedir<{ reciboId: string; referencia: string; url: string | null; pagoEstado: EstadoPagoPOS; importe: number }>(
    '/api/pos/recibo', { method: 'POST', body: JSON.stringify({ reciboId, metodo }) },
  );
}

export function confirmarCobroRecibo(
  reciboId: string, metodo: 'DATAFONO' | 'BIZUM', accion: 'consultar' | 'cancelar' = 'consultar',
) {
  return pedir<{
    reciboId: string; estado: string; pagoEstado: EstadoPagoPOS; importe: number;
    cobrado?: boolean; motivo?: string | null; aviso?: string;
  }>('/api/pos/recibo/confirmar', { method: 'POST', body: JSON.stringify({ reciboId, metodo, accion }) });
}

/** ¿La respuesta trae un error? Estrecha el tipo para no repetir el `in` por todas partes. */
export function esError<T extends object>(r: T | { error: string }): r is { error: string } {
  return 'error' in r && typeof (r as { error: unknown }).error === 'string';
}
