// ─────────────────────────────────────────────────────────────────────────────
// El datáfono de Stripe (Stripe Terminal) del mostrador: las reglas, sin red.
//
// Cobrar con él ya funcionaba por dentro (`crearProveedorDatafono` en
// terminal.ts); lo que no había era forma de CONECTARLO: ninguna pantalla
// llamaba a /api/terminal/lector y el botón «Datáfono» salía apagado con «Sin
// datáfono emparejado», sin decir dónde se emparejaba. Esto es lo que comparten
// la Caja, la deuda de una clienta, Configuración y la ruta del servidor: qué
// enseña el botón, qué código se acepta, con qué dirección se registra y qué se
// dice cuando Stripe responde que no.
// ─────────────────────────────────────────────────────────────────────────────

/** `status` del lector en Stripe. Sin leer todavía, `null`. */
export type EstadoLector = 'online' | 'offline';

export interface LectorDatafono {
  /** El nombre que le da el estudio («Mostrador»). Es el `label` del lector en Stripe. */
  etiqueta: string;
  /** El modelo dicho para personas (`nombreModelo`), o `null` si no se sabe. */
  modelo: string | null;
  estado: EstadoLector | null;
}

export interface DireccionLector {
  linea: string;
  codigoPostal: string;
  ciudad: string;
}

/**
 * Lo que enseña el botón «Datáfono».
 *  · `sin-stripe`: el estudio no tiene Stripe conectado ni SumUp que conectar.
 *    Igual que hoy: apagado.
 *  · `sin-conectar`: hay con qué conectar uno (Stripe, o SumUp para este estudio)
 *    y no hay datáfono. El botón CONECTA (antes, apagado).
 *  · `comprobando`: hay uno guardado y aún no sabemos si responde. Se deja
 *    cobrar: si no responde, el servidor lo dice al mandar el importe.
 *  · `listo` / `sin-conexion`: lo que dice Stripe del lector ahora.
 */
export type EstadoBotonDatafono = 'sin-stripe' | 'sin-conectar' | 'comprobando' | 'listo' | 'sin-conexion';

/**
 * @param lector `undefined` = todavía sin preguntar (o la pregunta falló);
 *   `null` = Stripe dice que no hay ninguno (o el guardado ya no existe).
 */
export function estadoBotonDatafono(p: {
  stripeConectado: boolean;
  /** ¿Se le ofrece SumUp a este estudio? Sin Stripe, es lo que deja conectar un datáfono. */
  sumupDisponible?: boolean;
  /** De quién es el datáfono emparejado. Sin decir, el de Stripe (lo de siempre). */
  proveedor?: 'stripe' | 'sumup' | null;
  emparejado: boolean;
  lector: LectorDatafono | null | undefined;
}): EstadoBotonDatafono {
  // Un Solo de SumUp no necesita Stripe; uno de Stripe sin Stripe conectado no sirve.
  const conSumup = p.proveedor === 'sumup' && p.emparejado;
  if (!p.stripeConectado && !conSumup) return p.sumupDisponible ? 'sin-conectar' : 'sin-stripe';
  if (p.lector === null) return 'sin-conectar';
  if (p.lector === undefined) return p.emparejado ? 'comprobando' : 'sin-conectar';
  return p.lector.estado === 'offline' ? 'sin-conexion' : 'listo';
}

/** ¿Se puede mandar un cobro al datáfono en este estado? */
export function datafonoCobra(e: EstadoBotonDatafono): boolean {
  return e === 'listo' || e === 'comprobando';
}

export const ETIQUETA_POR_DEFECTO = 'Mostrador';
const ETIQUETA_MAX = 40;

/** El nombre que le pone el estudio: sin espacios de más y con tope. Vacío, «Mostrador». */
export function normalizarEtiqueta(texto: unknown): string {
  const limpio = typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim() : '';
  return (limpio || ETIQUETA_POR_DEFECTO).slice(0, ETIQUETA_MAX).trim();
}

/**
 * El código de emparejamiento, tal como lo teclea alguien con el datáfono en la
 * mano: tres palabras («sepia-cerulean-aqua»). Se aceptan mayúsculas y espacios
 * en vez de guiones; lo que no tiene forma de código se rechaza aquí, antes de
 * gastar una llamada a Stripe. `null` = no vale.
 */
export function normalizarCodigo(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const codigo = texto.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (codigo.length < 5 || codigo.length > 60) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/.test(codigo) ? codigo : null;
}

/**
 * La provincia de cada código postal español, por sus dos primeras cifras, en el
 * código ISO 3166-2:ES sin el «ES-» (28 → «M», Madrid).
 *
 * ⚠️ Stripe NO registra la ubicación de un datáfono en España sin provincia
 * (`address[state]`, «Missing required address field for a Location in ES»), y la
 * comprueba contra su lista: el nombre o este código, nada más («Comunidad de
 * Madrid» o «ES-M», fuera). Se manda el código porque los nombres tienen variantes
 * (Gerona/Girona, Vizcaya/Bizkaia). Las 52 probadas una a una contra Stripe en modo
 * de prueba el 5-oct-2026.
 */
const PROVINCIA_POR_CP: Record<string, string> = {
  '01': 'VI', '02': 'AB', '03': 'A', '04': 'AL', '05': 'AV', '06': 'BA', '07': 'PM', '08': 'B', '09': 'BU', '10': 'CC',
  '11': 'CA', '12': 'CS', '13': 'CR', '14': 'CO', '15': 'C', '16': 'CU', '17': 'GI', '18': 'GR', '19': 'GU', '20': 'SS',
  '21': 'H', '22': 'HU', '23': 'J', '24': 'LE', '25': 'L', '26': 'LO', '27': 'LU', '28': 'M', '29': 'MA', '30': 'MU',
  '31': 'NA', '32': 'OR', '33': 'O', '34': 'P', '35': 'GC', '36': 'PO', '37': 'SA', '38': 'TF', '39': 'S', '40': 'SG',
  '41': 'SE', '42': 'SO', '43': 'T', '44': 'TE', '45': 'TO', '46': 'V', '47': 'VA', '48': 'BI', '49': 'ZA', '50': 'Z',
  '51': 'CE', '52': 'ML',
};

/** La provincia (código ISO sin «ES-») de un código postal español, o `null` si no lo es. */
export function provinciaDeCodigoPostal(codigoPostal: string): string | null {
  return /^\d{5}$/.test(codigoPostal) ? PROVINCIA_POR_CP[codigoPostal.slice(0, 2)] ?? null : null;
}

/** Una dirección con la que Stripe puede registrar el sitio del datáfono, o `null`. */
export function direccionValida(d: {
  linea?: unknown; codigoPostal?: unknown; ciudad?: unknown;
} | null | undefined): DireccionLector | null {
  if (!d) return null;
  const txt = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const linea = txt(d.linea).slice(0, 200);
  const ciudad = txt(d.ciudad).slice(0, 100);
  const codigoPostal = txt(d.codigoPostal).replace(/\s/g, '');
  // Un código postal que no es de ninguna provincia (00…, 53…) Stripe lo rechazaría.
  if (linea.length < 3 || ciudad.length < 2 || !provinciaDeCodigoPostal(codigoPostal)) return null;
  return { linea, codigoPostal, ciudad };
}

/** La dirección del estudio (columnas de `studios`) en la forma de arriba. */
export function direccionDelEstudio(s: {
  direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null;
} | null | undefined): DireccionLector | null {
  return direccionValida(s ? { linea: s.direccion, codigoPostal: s.codigo_postal, ciudad: s.ciudad } : null);
}

const MODELOS: Record<string, string> = {
  stripe_s700: 'Stripe Reader S700',
  stripe_s710: 'Stripe Reader S710',
  bbpos_wisepos_e: 'BBPOS WisePOS E',
};

/** `device_type` de Stripe dicho para personas. Los simulados del modo de prueba, como tal. */
export function nombreModelo(deviceType: string | null | undefined): string | null {
  if (!deviceType) return null;
  if (deviceType.startsWith('simulated')) return 'Datáfono de prueba';
  return MODELOS[deviceType] ?? null;
}

export function mensajeSinConexion(etiqueta: string | null | undefined): string {
  return `El datáfono ${etiqueta || ETIQUETA_POR_DEFECTO} no responde. Comprueba que está encendido y conectado al wifi, y vuelve a intentarlo.`;
}

export const MENSAJE_CODIGO_NO_VALE = 'Ese código no vale o ha caducado. Genera otro en el datáfono y vuelve a escribirlo.';
export const MENSAJE_CODIGO_MAL_ESCRITO = 'Escribe las tres palabras tal como salen en el datáfono, por ejemplo «sepia-cerulean-aqua».';

/**
 * Un error de Stripe al conectar o al mandar un cobro, dicho para quien está en
 * el mostrador. Lo que no se reconoce no se traduce a ciegas: mensaje genérico,
 * y el detalle va al registro del servidor.
 */
export function mensajeErrorLector(
  err: { code?: string | null; param?: string | null; message?: string | null } | null | undefined,
  etiqueta?: string | null,
): string {
  const code = err?.code ?? '';
  if (code === 'terminal_reader_offline' || code === 'terminal_reader_timeout') return mensajeSinConexion(etiqueta);
  if (code === 'terminal_reader_busy') {
    return `El datáfono ${etiqueta || ETIQUETA_POR_DEFECTO} está ocupado (con otro cobro o actualizándose). Espera unos segundos y vuelve a intentarlo.`;
  }
  if (err?.param === 'registration_code' || /registration code/i.test(err?.message ?? '')) return MENSAJE_CODIGO_NO_VALE;
  return 'No se ha podido conectar con el datáfono. Inténtalo otra vez en un momento.';
}

/**
 * Por qué el banco no ha aceptado la tarjeta en el datáfono, dicho para el
 * mostrador. Stripe lo da en inglés («Your card was declined.») y ese texto
 * acababa tal cual en la Caja. Con un rechazo no se mueve dinero, así que
 * «No se ha cobrado nada» es verdad. Lo que no se reconoce, mensaje genérico.
 */
export function motivoRechazoDatafono(
  err: { code?: string | null; decline_code?: string | null } | null | undefined,
): string {
  switch (err?.decline_code ?? err?.code ?? '') {
    case 'insufficient_funds': return 'La tarjeta no tiene saldo suficiente. No se ha cobrado nada: prueba con otra.';
    case 'expired_card': return 'La tarjeta está caducada. No se ha cobrado nada: prueba con otra.';
    case 'incorrect_pin':
    case 'invalid_pin': return 'El PIN no es correcto. No se ha cobrado nada: vuelve a cobrar.';
    case 'pin_try_exceeded': return 'Se han agotado los intentos de PIN de esta tarjeta. No se ha cobrado nada: prueba con otra.';
    // El reintento con PIN tras el pago sin contacto, abandonado: vale la misma tarjeta.
    case 'offline_pin_required':
    case 'online_or_offline_pin_required': return 'La tarjeta pide el PIN. No se ha cobrado nada: vuelve a cobrar, insértala y marca el PIN.';
    default: return 'El banco ha rechazado la tarjeta. No se ha cobrado nada: prueba con otra.';
  }
}
