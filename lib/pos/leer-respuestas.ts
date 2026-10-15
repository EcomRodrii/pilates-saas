import type { CatalogoPOS, EstadoCaja, PlanPOSCatalogo, ProductoPOSCatalogo } from './cliente.ts';

// Lo que el TPV LEE del servidor, comprobado antes de pintarlo. Con la forma de
// siempre devuelve exactamente lo que llegó; con otra (un 200 con `{}`, un
// campo a `null`, una lista que no es lista) ya no tumba la Caja entera en
// «Algo ha ido mal»: o se queda con lo que sirve, o dice qué falta y la pantalla
// ofrece «Reintentar». Mismo criterio que la tarjeta regalo (#2721) y
// Conversaciones (#2723).
//
// ⚠️ Solo lectura. No toca cómo se cobra, el carrito, los importes ni lo que se
// escribe. Y en lo que es dinero NO se inventa nada: un IVA, un «esperado» de la
// caja o si la caja está abierta no tienen valor por defecto. Si faltan, la
// pantalla no se abre (adivinar «caja cerrada» invitaría a abrir otra encima de
// la que hay). Lo único que toma un valor por defecto es lo que, si falta,
// enseña MENOS: un método de cobro que no viene confirmado, como no disponible;
// un producto sin `activo`, como no activo; una lista de detalle, vacía.

export type Leido<T> = { ok: true; valor: T } | { ok: false; error: string };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const textoONull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numeroONull = (v: unknown): number | null => (esNumero(v) ? v : null);

/**
 * «… no trae X», «… no trae X, Y ni Z».
 *
 * ⚠️ Dice solo lo que se sabe: que ESTA LECTURA no cobra ni cambia nada. Nunca
 * «no se ha cobrado nada»: la misma lectura se repite justo después de vender,
 * de cobrar una deuda o de apuntar un movimiento de caja, y con esa frase quien
 * cobra repetiría la acción (un segundo cobro, un movimiento doble). Revisión
 * de tentare-stripe.
 */
function frase(faltan: string[]): string {
  const lista = faltan.length === 1 ? faltan[0]
    : `${faltan.slice(0, -1).join(', ')} ni ${faltan[faltan.length - 1]}`;
  return `La respuesta del servidor ha llegado incompleta: no trae ${lista}. Esta lectura no cobra ni cambia nada, y lo que ya hayas hecho sigue hecho: vuelve a cargar para verlo.`;
}

function leerProducto(v: unknown): ProductoPOSCatalogo | null {
  // Sin id no se puede vender (es la referencia de la línea); con un precio o un
  // IVA que no son números, tampoco: la línea saldría con importes sin sentido.
  if (!esObjeto(v) || typeof v.id !== 'string' || !esNumero(v.precio) || !esNumero(v.ivaPct)) return null;
  return {
    id: v.id,
    nombre: typeof v.nombre === 'string' ? v.nombre : '',
    descripcion: textoONull(v.descripcion),
    categoria: typeof v.categoria === 'string' ? v.categoria : '',
    precio: v.precio,
    // Sin `activo` claro, no se ofrece: mejor un producto escondido que vender
    // uno que el estudio retiró.
    activo: v.activo === true,
    stock: numeroONull(v.stock),
    stockMinimo: esNumero(v.stockMinimo) ? v.stockMinimo : 0,
    ivaPct: v.ivaPct,
    imagenUrl: textoONull(v.imagenUrl),
    sku: textoONull(v.sku),
    codigoBarras: textoONull(v.codigoBarras),
  };
}

function leerPlan(v: unknown): PlanPOSCatalogo | null {
  if (!esObjeto(v) || typeof v.id !== 'string' || !esNumero(v.precio) || !esNumero(v.ivaPct) || typeof v.tipo !== 'string') return null;
  return {
    id: v.id,
    nombre: typeof v.nombre === 'string' ? v.nombre : '',
    descripcion: textoONull(v.descripcion),
    precio: v.precio,
    tipo: v.tipo as PlanPOSCatalogo['tipo'],
    sesiones: numeroONull(v.sesiones),
    validezDias: numeroONull(v.validezDias),
    ivaPct: v.ivaPct,
  };
}

/** La caja: abierta (con su id), cerrada (`null`) o ilegible (`undefined`). */
function leerCajaAbierta(v: unknown): CatalogoPOS['caja'] | undefined {
  if (v === null) return null;
  if (!esObjeto(v) || typeof v.id !== 'string' || !esNumero(v.fondoInicial)) return undefined;
  return { id: v.id, fondoInicial: v.fondoInicial, abiertaEn: typeof v.abiertaEn === 'string' ? v.abiertaEn : '', abiertaPor: textoONull(v.abiertaPor) };
}

/** El catálogo del TPV (`GET /api/pos/catalogo`), comprobado. */
export function leerCatalogoPOS(raw: unknown): Leido<CatalogoPOS> {
  if (!esObjeto(raw)) return { ok: false, error: frase(['el catálogo entero']) };
  const faltan: string[] = [];

  if (!esNumero(raw.ivaDefecto)) faltan.push('el IVA por defecto');
  if (!esObjeto(raw.cobro)) faltan.push('cómo se puede cobrar');
  if (!Array.isArray(raw.productos)) faltan.push('los productos');
  if (!Array.isArray(raw.planes)) faltan.push('los bonos y cuotas');
  const caja = leerCajaAbierta(raw.caja);
  if (caja === undefined) faltan.push('si la caja está abierta');
  const hoy = esObjeto(raw.hoy) && esNumero(raw.hoy.ventas) && esNumero(raw.hoy.total) && esNumero(raw.hoy.ticketMedio) ? raw.hoy : null;
  if (!hoy) faltan.push('lo vendido hoy');
  if (faltan.length) return { ok: false, error: frase(faltan) };

  const cobro = raw.cobro as Record<string, unknown>;
  const h = hoy as Record<string, unknown> & { ventas: number; total: number; ticketMedio: number };
  return {
    ok: true,
    valor: {
      ivaDefecto: raw.ivaDefecto as number,
      cobro: {
        // Un método que no viene confirmado no se ofrece: es lo que ya hace el
        // TPV con un datáfono sin emparejar.
        stripeConectado: cobro.stripeConectado === true,
        datafonoEmparejado: cobro.datafonoEmparejado === true,
        datafonoProveedor: cobro.datafonoProveedor === 'stripe' || cobro.datafonoProveedor === 'sumup' ? cobro.datafonoProveedor : null,
        sumupDisponible: cobro.sumupDisponible === true,
      },
      productos: (raw.productos as unknown[]).map(leerProducto).filter((p): p is ProductoPOSCatalogo => p !== null),
      planes: (raw.planes as unknown[]).map(leerPlan).filter((p): p is PlanPOSCatalogo => p !== null),
      caja: caja as CatalogoPOS['caja'],
      hoy: {
        ventas: h.ventas,
        total: h.total,
        ticketMedio: h.ticketMedio,
        porMetodo: (Array.isArray(h.porMetodo) ? h.porMetodo : [])
          .filter((m): m is { metodo: string; n: number; total: number } => esObjeto(m) && typeof m.metodo === 'string' && esNumero(m.n) && esNumero(m.total)),
        ultimas: (Array.isArray(h.ultimas) ? h.ultimas : [])
          .filter((v): v is CatalogoPOS['hoy']['ultimas'][number] => esObjeto(v) && typeof v.id === 'string' && esNumero(v.total)),
      },
    },
  };
}

/** El estado de la caja (`GET /api/pos/caja`), comprobado: lo que pinta la hoja de caja y su arqueo. */
export function leerEstadoCaja(raw: unknown): Leido<EstadoCaja> {
  if (!esObjeto(raw)) return { ok: false, error: frase(['el estado de la caja']) };
  const faltan: string[] = [];
  const caja = leerCajaAbierta(raw.caja);
  if (caja === undefined) faltan.push('si la caja está abierta');
  // Lo que debería haber en el cajón: sin él, el arqueo no tiene con qué comparar.
  if (!esNumero(raw.esperado)) faltan.push('lo que debería haber en la caja');
  if (!Array.isArray(raw.movimientos)) faltan.push('los movimientos');
  if (faltan.length) return { ok: false, error: frase(faltan) };
  return {
    ok: true,
    valor: {
      caja: caja as EstadoCaja['caja'],
      esperado: raw.esperado as number,
      movimientos: (raw.movimientos as unknown[])
        .filter((m): m is EstadoCaja['movimientos'][number] => esObjeto(m) && typeof m.id === 'string' && esNumero(m.importe)),
    },
  };
}
