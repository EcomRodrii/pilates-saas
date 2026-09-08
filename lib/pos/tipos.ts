// ─────────────────────────────────────────────────────────────────────────────
// Tipos compartidos del POS. Sin imports de servidor: los usan la pantalla del
// TPV, el cliente de API y las rutas.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetodoPago } from '@/lib/types';

/** Estado del HECHO COMERCIAL. */
export type EstadoVentaPOS = 'PENDIENTE_PAGO' | 'PAGADA' | 'ANULADA';

/**
 * Estado del PAGO, tal y como lo dice el proveedor.
 *
 * Es una pregunta distinta de `EstadoVentaPOS`, y por eso son dos campos: una
 * venta PENDIENTE_PAGO con el pago PROCESANDO ("acerque la tarjeta") no se
 * cuenta igual que una con el pago RECHAZADO ("pruebe otra tarjeta") ni que
 * una EXPIRADO ("se agotó el tiempo, vuelva a empezar"). Con un solo campo
 * booleano el mostrador no sabría qué decirle a quien está esperando.
 */
export type EstadoPagoPOS =
  | 'PENDIENTE' | 'PROCESANDO' | 'PAGADO'
  | 'RECHAZADO' | 'CANCELADO' | 'EXPIRADO' | 'ERROR';

/** El pago ya no puede cambiar: ni se espera más ni se reintenta solo. */
export function esEstadoFinal(e: EstadoPagoPOS): boolean {
  return e === 'PAGADO' || e === 'RECHAZADO' || e === 'CANCELADO' || e === 'EXPIRADO' || e === 'ERROR';
}

/**
 * ¿A este método lo confirma un TERCERO, o solo la persona que cobra?
 *
 * Tiene que decir exactamente lo mismo que `proveedorPara` en
 * `lib/pos/terminal.ts`, porque son la misma pregunta: los que van por Stripe
 * (datáfono y Bizum) los confirma Stripe; el resto los confirma quien está en
 * el mostrador.
 *
 * ⚠️ TARJETA está FUERA, y esto es una corrección, no un matiz. Antes decía
 * que sí necesitaba confirmación externa mientras `proveedorPara` le daba el
 * proveedor MANUAL —que devuelve PAGADO al instante—, así que dos sitios del
 * código afirmaban lo contrario y ganaba el que cobraba. En pantalla eso era:
 * pulsas «Tarjeta» y sale «Cobrado» sin que nadie haya comprobado nada.
 *
 * TARJETA significa «lo he pasado por el datáfono de MI banco», que Tentare no
 * ve. Es legítimo registrarlo, pero hay que pedirlo explícitamente y no
 * pintarlo como un cobro verificado.
 */
export function requiereConfirmacionExterna(metodo: MetodoPago): boolean {
  return metodo === 'DATAFONO' || metodo === 'BIZUM';
}

/**
 * ¿Hay que pedir a quien cobra que confirme a mano que el dinero ha entrado?
 *
 * Efectivo no: se ve y se cuenta, y el arqueo del cierre lo verifica. Tarjeta
 * del banco y transferencia sí: nadie más puede decirnos que han salido bien.
 */
export function necesitaAtestiguar(metodo: MetodoPago): boolean {
  return metodo === 'TARJETA' || metodo === 'TRANSFERENCIA';
}

/** Una línea tal y como la manda el TPV: ids y cantidades. NUNCA importes. */
export interface LineaVentaPeticion {
  tipo: 'PRODUCTO' | 'PLAN' | 'LIBRE';
  referenciaId?: string | null;
  cantidad: number;
  /** Solo para LIBRE: concepto y precio tecleados en el mostrador. */
  nombre?: string;
  precio?: number;
}

export interface PeticionVenta {
  lineas: LineaVentaPeticion[];
  socioId?: string | null;
  metodoPago: MetodoPago;
  descuentoTipo?: 'EUROS' | 'PORCENTAJE' | null;
  descuentoValor?: number;
  codigoDescuentoId?: string | null;
  efectivoRecibido?: number | null;
  notas?: string | null;
  /**
   * La manda el TPV y la mantiene mientras el carrito no cambie. Un doble
   * toque en «Cobrar», o un reintento tras un fallo de red, devuelven la MISMA
   * venta en vez de cobrar dos veces.
   */
  idempotenciaClave: string;
}

export interface VentaRegistrada {
  ventaId: string;
  numero: number;
  subtotal: number;
  descuento: number;
  baseImponible: number;
  ivaTotal: number;
  total: number;
  cambio: number | null;
  estado: EstadoVentaPOS;
  pagoEstado: EstadoPagoPOS;
  /** Presente solo si el cobro necesita que alguien pase una tarjeta. */
  pago?: {
    referencia: string;
    /** Bizum: la URL que el cliente abre o escanea. */
    url?: string | null;
  };
  yaExistia: boolean;
}

/** Número de venta legible: 182 → «#000182». */
export function formatNumeroVenta(numero: number | null | undefined): string {
  if (numero === null || numero === undefined) return '—';
  return `#${String(numero).padStart(6, '0')}`;
}

// ─── Errores de negocio ──────────────────────────────────────────────────────
//
// La RPC lanza códigos (`SIN_STOCK:Calcetines:1`) porque una excepción de
// Postgres no puede llevar un mensaje escrito para una persona. La traducción
// vive aquí, en un solo sitio, para que el mostrador lea una frase y no un
// código — regla de `lib/errores.ts`: una dueña de estudio nunca debe leer
// jerga de base de datos.

export function mensajeErrorVenta(codigo: string): string {
  const [clave, ...partes] = codigo.split(':');
  const a = partes[0] ?? '';
  const b = partes[1] ?? '';
  switch (clave) {
    case 'CARRITO_VACIO':            return 'El ticket está vacío.';
    case 'SIN_STOCK':                return `Solo queda${b === '1' ? '' : 'n'} ${b} de «${a}».`;
    case 'ARTICULO_NO_ENCONTRADO':   return 'Ese artículo ya no está en el catálogo. Quítalo del ticket.';
    case 'ARTICULO_INACTIVO':        return `«${a}» está desactivado y no se puede vender.`;
    case 'PLAN_NO_ENCONTRADO':       return 'Ese bono ya no está en el catálogo. Quítalo del ticket.';
    case 'PLAN_INACTIVO':            return `«${a}» está desactivado y no se puede vender.`;
    // PLAN_SIN_CLIENTA ya no lo lanza la RPC (un bono se puede vender sin
    // ficha y asignarse después). Se conserva la traducción porque un
    // despliegue a medias podría seguir devolviéndolo, y un código crudo en
    // pantalla es peor que una frase de más aquí.
    case 'PLAN_SIN_CLIENTA':         return `«${a}» es un bono: elige a nombre de quién va antes de cobrar.`;
    case 'VENTA_YA_ASIGNADA':        return 'Esa venta ya está a nombre de una clienta.';
    case 'CLIENTA_NO_ENCONTRADA':    return 'No encontramos esa clienta.';
    case 'PLAN_CANTIDAD_UNICA':      return 'Cada bono va en su propia línea. Añádelo otra vez para vender dos.';
    case 'CODIGO_NO_CANJEABLE':      return 'Ese código ya no se puede usar (caducado, agotado o desactivado).';
    case 'CODIGO_MINIMO_NO_ALCANZADO': return `Ese código necesita una compra mínima de ${a} €.`;
    case 'DESCUENTO_INVALIDO':       return 'Ese descuento no es válido.';
    case 'EFECTIVO_INSUFICIENTE':    return `Con ${a} € no llega: el total es ${b} €.`;
    case 'CONCEPTO_LIBRE_SIN_NOMBRE': return 'Pon un concepto al importe libre.';
    case 'PRECIO_LIBRE_INVALIDO':    return 'Ese importe no es válido.';
    case 'CANTIDAD_INVALIDA':        return 'Esa cantidad no es válida.';
    case 'VENTA_NO_ENCONTRADA':      return 'No encontramos esa venta.';
    case 'VENTA_NO_PAGADA':          return 'Esa venta no está cobrada, así que no hay nada que devolver.';
    case 'NADA_QUE_DEVOLVER':        return 'Ya se ha devuelto todo de esta venta.';
    case 'DEVOLUCION_EXCEDE':        return `De «${a}» solo quedan ${b} sin devolver.`;
    case 'BONO_YA_EMPEZADO':         return `«${a}» ya tiene ${b} sesión${b === '1' ? '' : 'es'} usada${b === '1' ? '' : 's'}: no se puede devolver desde aquí.`;
    case 'IMPORTE_NO_COINCIDE':      return `Se cobraron ${a} € pero el ticket son ${b} €. No damos la venta por buena; revísalo.`;
    case 'CAJA_NO_ABIERTA':          return 'No hay ninguna caja abierta.';
    case 'CAJA_CERRADA':             return 'Esa caja ya está cerrada. Los movimientos de hoy van en la caja de hoy.';
    case 'FONDO_INVALIDO':           return 'Ese fondo inicial no es válido.';
    case 'CONTEO_INVALIDO':          return 'Ese recuento no es válido.';
    case 'CONCEPTO_REQUERIDO':       return 'Escribe de qué es el movimiento.';
    case 'IMPORTE_INVALIDO':         return 'Ese importe no es válido.';
    default:                         return 'No se ha podido completar la operación. Inténtalo de nuevo.';
  }
}

/**
 * Saca el código de negocio del mensaje que devuelve supabase-js al fallar una
 * RPC. Postgres lo entrega dentro de un texto más largo; sin esto llegaría a
 * pantalla el mensaje crudo.
 */
export function codigoDeErrorPg(mensaje: string | null | undefined): string {
  if (!mensaje) return '';
  const m = mensaje.match(/[A-Z_]{4,}(?::[^\s]*)?/);
  return m ? m[0] : '';
}
