// Tarjeta regalo — reglas puras (sin red, sin `@/`): las comparten el servidor, las
// pantallas y `node --test`. La fuente de verdad del saldo es el libro de la base de
// datos (`movimientos_regalo`); aquí solo se validan entradas y se espeja la huella
// del código, que `regalo_huella_codigo` (SQL) calcula igual — lo ata el test de BD.
import { createHash, timingSafeEqual } from 'node:crypto';

export const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** `RG-XXXX-XXXX-XXXX-XXXX`: 16 símbolos de un alfabeto de 32 = 80 bits. */
export const FORMATO_CODIGO = /^RG-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/;

export const MAX_MENSAJE = 400;
export const MAX_NOMBRE = 120;
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Lo que escribe una persona → núcleo de 16 símbolos (sin guiones, espacios ni prefijo RG). */
export function normalizarCodigo(texto: string): string {
  const n = (texto ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return n.length === 18 && n.startsWith('RG') ? n.slice(2) : n;
}

/** ¿Tiene pinta de código? Solo filtra basura antes de ir a la base de datos. */
export function pareceCodigo(texto: string): boolean {
  const n = normalizarCodigo(texto);
  return n.length === 16 && [...n].every(c => ALFABETO_CODIGO.includes(c));
}

export function huellaCodigo(texto: string): string {
  return createHash('sha256').update(normalizarCodigo(texto)).digest('hex');
}

/** Comparación en tiempo constante de dos huellas hexadecimales. */
export function huellasIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface AjustesRegalo {
  activo: boolean;
  importesEur: number[];
  permiteImporteLibre: boolean;
  importeMinEur: number;
  importeMaxEur: number;
  caducidadMeses: number;
  terminos: string | null;
}

export const AJUSTES_POR_DEFECTO: AjustesRegalo = {
  activo: false, importesEur: [25, 50, 100], permiteImporteLibre: true,
  importeMinEur: 10, importeMaxEur: 300, caducidadMeses: 12, terminos: null,
};

/**
 * Importe aceptado, en CÉNTIMOS enteros, o el motivo del rechazo. Euros enteros
 * siempre (un regalo de 37,50 € no existe en la UI y evita redondeos).
 */
export function validarImporte(a: AjustesRegalo, importeEur: unknown): { ok: true; centimos: number } | { ok: false; motivo: string } {
  if (typeof importeEur !== 'number' || !Number.isInteger(importeEur) || importeEur <= 0) {
    return { ok: false, motivo: 'Elige un importe en euros enteros.' };
  }
  const fijo = a.importesEur.includes(importeEur);
  const libre = a.permiteImporteLibre && importeEur >= a.importeMinEur && importeEur <= a.importeMaxEur;
  if (!fijo && !libre) {
    return { ok: false, motivo: a.permiteImporteLibre
      ? `El importe tiene que estar entre ${a.importeMinEur} € y ${a.importeMaxEur} €.`
      : 'Elige uno de los importes disponibles.' };
  }
  return { ok: true, centimos: importeEur * 100 };
}

export interface DatosRegalo {
  compradorNombre: string; compradorEmail: string;
  destinatarioNombre: string; destinatarioEmail: string; mensaje: string;
}

const limpio = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

/** Normaliza y valida los datos de quien regala y de quien recibe. */
export function validarDatosRegalo(b: Record<string, unknown>): { ok: true; datos: DatosRegalo } | { ok: false; motivo: string } {
  const datos: DatosRegalo = {
    compradorNombre: limpio(b.compradorNombre, MAX_NOMBRE),
    compradorEmail: limpio(b.compradorEmail, 200).toLowerCase(),
    destinatarioNombre: limpio(b.destinatarioNombre, MAX_NOMBRE),
    destinatarioEmail: limpio(b.destinatarioEmail, 200).toLowerCase(),
    mensaje: limpio(b.mensaje, MAX_MENSAJE),
  };
  if (!datos.compradorNombre) return { ok: false, motivo: 'Escribe tu nombre.' };
  if (!EMAIL_VALIDO.test(datos.compradorEmail)) return { ok: false, motivo: 'Escribe tu email para enviarte el justificante.' };
  if (!datos.destinatarioNombre) return { ok: false, motivo: 'Escribe el nombre de quien recibe el regalo.' };
  if (!EMAIL_VALIDO.test(datos.destinatarioEmail)) return { ok: false, motivo: 'Escribe un email válido para quien recibe el regalo.' };
  return { ok: true, datos };
}

export type EstadoRegalo = 'ACTIVA' | 'AGOTADA' | 'CADUCADA' | 'ANULADA';

export const NOMBRE_ESTADO_REGALO: Record<EstadoRegalo, string> = {
  ACTIVA: 'Activa', AGOTADA: 'Gastada', CADUCADA: 'Caducada', ANULADA: 'Anulada',
};

/** Texto honesto para cada motivo de rechazo de una RPC (canje, uso, anulación). */
export const MENSAJE_MOTIVO_REGALO: Record<string, string> = {
  'no-existe': 'Ese código no es válido. Revisa que lo hayas escrito igual que en el correo.',
  anulada: 'Esa tarjeta regalo se ha anulado. Habla con el estudio.',
  caducada: 'Esa tarjeta regalo ha caducado.',
  agotada: 'A esa tarjeta regalo ya no le queda saldo.',
  'ya-vinculada': 'Esa tarjeta regalo ya está en otra cuenta.',
  'saldo-insuficiente': 'No hay saldo suficiente en esa tarjeta.',
  'motivo-obligatorio': 'Escribe el motivo de la anulación.',
  'peticion-invalida': 'La petición no es válida.',
  'clave-reutilizada': 'Esa operación ya se registró con otro importe.',
};

/** Días que faltan para caducar (en días de calendario, sobre fechas ISO `YYYY-MM-DD`). */
export function diasParaCaducar(caducaEn: string, hoyISO: string): number {
  const ms = Date.parse(`${caducaEn}T00:00:00Z`) - Date.parse(`${hoyISO}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export const formatearEuros = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
