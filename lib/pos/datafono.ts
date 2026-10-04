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
 *  · `sin-stripe`: el estudio no tiene Stripe conectado. Igual que hoy: apagado.
 *  · `sin-conectar`: Stripe sí, datáfono no. El botón CONECTA (antes, apagado).
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
  emparejado: boolean;
  lector: LectorDatafono | null | undefined;
}): EstadoBotonDatafono {
  if (!p.stripeConectado) return 'sin-stripe';
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

/** Una dirección con la que Stripe puede registrar el sitio del datáfono, o `null`. */
export function direccionValida(d: {
  linea?: unknown; codigoPostal?: unknown; ciudad?: unknown;
} | null | undefined): DireccionLector | null {
  if (!d) return null;
  const txt = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const linea = txt(d.linea).slice(0, 200);
  const ciudad = txt(d.ciudad).slice(0, 100);
  const codigoPostal = txt(d.codigoPostal).replace(/\s/g, '');
  if (linea.length < 3 || ciudad.length < 2 || !/^\d{5}$/.test(codigoPostal)) return null;
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
