// Los datos que se piden para entrar en la demo: validación y normalización.
// Lógica pura, la comparten el formulario (mensajes) y el servidor (la verdad).
//
// Distinción legal, y por qué cada cosa va aparte:
//   · Lo necesario para atender la solicitud (nombre, estudio, correo,
//     teléfono): se tratan para dar la demo y hablar de ella. No es marketing y
//     no se pide casilla; se informa (aviso de privacidad bajo el formulario).
//   · El consentimiento comercial: casilla APARTE, desmarcada, opcional. Sin
//     marcarla se entra igual. Aquí solo se registra como solicitud pendiente;
//     no cuenta hasta que la dueña del correo lo confirme (doble confirmación).
//   · No se piden condiciones de uso: la demo no crea cuenta ni contrato.
import { EMAIL_VALIDO, buzonCanonico } from '../recursos/descargas.ts';
import { TIPOS_CENTRO, esTipoCentro, type TipoCentro } from './centros.ts';

export const MAX_NOMBRE = 80;
export const MAX_ESTUDIO = 120;
export const MAX_EMAIL = 200;

export interface DatosDemo {
  tipoCentro: TipoCentro;
  nombre: string;
  estudio: string;
  email: string;
  telefono: string;
  comercial: boolean;
}

export type CampoDemo = 'tipoCentro' | 'nombre' | 'estudio' | 'email' | 'telefono';

/** Quita espacios sobrantes, normaliza unicode y elimina caracteres de control. */
export function limpiarTexto(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  return x.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Teléfono a formato internacional (`+34600111222`) o null si no es un teléfono.
 * Acepta con o sin prefijo: un móvil o fijo español de 9 cifras (6-9) lleva +34.
 */
export function normalizarTelefono(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  let t = x.replace(/[\s().-]/g, '');
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  if (!/^\+?\d+$/.test(t)) return null;
  if (t.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
  if (/^[6-9]\d{8}$/.test(t)) return `+34${t}`;
  if (/^34[6-9]\d{8}$/.test(t)) return `+${t}`;
  return null;
}

export function normalizarEmail(x: unknown): string {
  return typeof x === 'string' ? x.normalize('NFC').trim().toLowerCase().slice(0, MAX_EMAIL + 1) : '';
}

export type ResultadoDatos =
  | { ok: true; datos: DatosDemo }
  | { ok: false; errores: Partial<Record<CampoDemo, string>> };

export function validarDatosDemo(crudo: Record<string, unknown> | null | undefined): ResultadoDatos {
  const c = crudo ?? {};
  const errores: Partial<Record<CampoDemo, string>> = {};

  const tipoCentro = c.tipoCentro;
  if (!esTipoCentro(tipoCentro)) errores.tipoCentro = `Elige uno: ${TIPOS_CENTRO.join(', ')}.`;

  const nombre = limpiarTexto(c.nombre, MAX_NOMBRE);
  if (nombre.length < 2) errores.nombre = 'Escribe tu nombre.';

  const estudio = limpiarTexto(c.estudio, MAX_ESTUDIO);
  if (estudio.length < 2) errores.estudio = 'Escribe el nombre de tu estudio.';

  const email = normalizarEmail(c.email);
  if (!EMAIL_VALIDO.test(email) || email.length > MAX_EMAIL) errores.email = 'Escribe un correo válido, como nombre@tuestudio.com.';

  const telefono = normalizarTelefono(c.telefono);
  if (!telefono) errores.telefono = 'Escribe un teléfono válido. En España, 9 cifras; si es de fuera, con el prefijo (+351…).';

  if (Object.keys(errores).length > 0 || !esTipoCentro(tipoCentro) || !telefono) return { ok: false, errores };
  return { ok: true, datos: { tipoCentro, nombre, estudio, email, telefono, comercial: c.comercial === true } };
}

/** La clave con la que se cuenta «una misma persona» (`ana+x@…` y `ana@…` son una). */
export function buzonDeDemo(email: string): string {
  return buzonCanonico(email);
}
