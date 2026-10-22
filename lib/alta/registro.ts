// ─────────────────────────────────────────────────────────────────────────────
// El alta nueva: registro en una pantalla (PR-2 del alta nueva, maqueta
// aprobada por el fundador el 21-oct-2026, «01 · Registro»).
//
// Lógica pura —sin React, sin red, sin `@/`— para que `registro.test.ts` pruebe
// exactamente lo que decide la pantalla (app/crear-estudio/alta-nueva.tsx):
//
//   · qué alta ve cada visita (`versionDelAlta`, el interruptor);
//   · qué le falta a cada campo, dicho para arreglarlo (`errorDeCampo`);
//   · si la contraseña es fácil de adivinar (`contrasenaFacil`);
//   · si el email lleva una errata en el dominio (`sugerirEmail`): SOLO sugiere,
//     nunca cambia lo escrito. Un correo que no llega es el alta que se pierde,
//     pero cambiarle a alguien su dirección sin preguntar es peor;
//   · lo que viaja en el `signUp` (`metadataDelAlta`).
// ─────────────────────────────────────────────────────────────────────────────

import { slugify } from '../slug.ts';
import { normalizarLlegada, type VersionAlta } from './embudo.ts';

// ── El interruptor ──────────────────────────────────────────────────────────

/**
 * ¿Qué alta ve esta visita? `ALTA_NUEVA_REGISTRO`, leído SOLO en el servidor
 * (app/crear-estudio/page.tsx):
 *
 *   on      → todo el mundo ve el alta nueva ('v2').
 *   prueba  → solo `/crear-estudio?alta=nueva` ('v2_prueba': fuera de las
 *             cohortes de serie del embudo); sin el parámetro, la de siempre.
 *   lo demás (o sin poner) → la de siempre, también con `?alta=nueva`.
 *
 * `null` = el alta de siempre. Mismo criterio que el resto de interruptores de
 * entorno (`=== 'on'` tras quitar espacios, lib/interruptor-por-estudio.ts).
 */
export function versionDelAlta(
  valor: string | undefined,
  parametroAlta: string | string[] | undefined,
): Extract<VersionAlta, 'v2' | 'v2_prueba'> | null {
  const v = (valor ?? '').trim();
  if (v === 'on') return 'v2';
  if (v !== 'prueba') return null;
  const alta = Array.isArray(parametroAlta) ? parametroAlta[0] : parametroAlta;
  return alta === 'nueva' ? 'v2_prueba' : null;
}

// ── Los tres campos ─────────────────────────────────────────────────────────

export type CampoRegistro = 'nombre' | 'email' | 'contrasena';
export const CAMPOS_REGISTRO: readonly CampoRegistro[] = ['nombre', 'email', 'contrasena'];

export interface DatosRegistro {
  nombre: string;
  email: string;
  contrasena: string;
}

/** Lo mínimo que gotrue acepta como contraseña en este proyecto (lib/alta/borrador.ts). */
export const MIN_CONTRASENA = 8;
/** Lo que cabe en `studios.nombre` y en `altas_estudio.estudio_nombre`. */
export const MAX_NOMBRE = 120;
const MAX_EMAIL = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Lo que le falta a un campo, en el texto que se le enseña, o '' si está bien.
 * Un mensaje por problema y dicho para arreglarlo (los de la maqueta, tal cual).
 */
export function errorDeCampo(campo: CampoRegistro, d: DatosRegistro): string {
  if (campo === 'nombre') {
    const n = d.nombre.trim();
    if (n.length < 2) return 'Escribe el nombre de tu estudio: al menos 2 letras.';
    if (n.length > MAX_NOMBRE) return `El nombre es demasiado largo (máximo ${MAX_NOMBRE} caracteres).`;
    return '';
  }
  if (campo === 'email') {
    const e = d.email.trim();
    if (!e) return 'Escribe tu email: ahí te llega el código.';
    if (!EMAIL_RE.test(e)) return 'A este email le falta algo. Revisa la @ y el final, como en nombre@example.com.';
    if (e.length > MAX_EMAIL) return 'Ese email es demasiado largo.';
    return '';
  }
  if (d.contrasena.length < MIN_CONTRASENA) return `Usa ${MIN_CONTRASENA} caracteres o más.`;
  if (contrasenaFacil(d.contrasena, d.nombre)) return 'Es fácil de adivinar. Prueba con una frase corta que recuerdes.';
  return '';
}

/** El primer campo con algo que arreglar (para llevar ahí el foco), o null. */
export function primerCampoConError(d: DatosRegistro): CampoRegistro | null {
  return CAMPOS_REGISTRO.find((c) => errorDeCampo(c, d) !== '') ?? null;
}

/**
 * Las de siempre en las listas de filtradas, más las del oficio. No es la
 * defensa de verdad: gotrue rechaza además las que han salido en filtraciones
 * (y lo dice con su motivo, lib/auth/password-errores.ts). Esto solo evita
 * gastar un viaje al servidor con las que se ven a simple vista.
 */
const COMUNES = new Set([
  '12345678', '123456789', '1234567890', '87654321', 'password', 'password1', 'contraseña', 'contrasena',
  'qwertyui', 'qwerty123', '11111111', '00000000', 'abcd1234', '1234abcd', 'iloveyou', 'pilates123',
  'pilates1', 'pilates2024', 'pilates2025', 'pilates2026', '12341234', 'abc12345', 'asdfghjk', 'tentare123',
]);

/** Sin acentos, en minúsculas y solo letras y números: como se compara con el nombre. */
function plano(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** «12345678», «98765432»: una escalera de cifras. */
function esEscalera(v: string): boolean {
  if (!/^\d{4,}$/.test(v)) return false;
  const paso = Number(v[1]) - Number(v[0]);
  if (paso !== 1 && paso !== -1) return false;
  for (let i = 1; i < v.length; i++) {
    if (Number(v[i]) - Number(v[i - 1]) !== paso) return false;
  }
  return true;
}

/**
 * «Difícil de adivinar: ni 12345678 ni el nombre del estudio». Fácil es:
 *   · una de las de siempre (`COMUNES`), un solo carácter repetido o una
 *     escalera de cifras;
 *   · el nombre del estudio, o un trozo de él, con números o signos alrededor
 *     («EstudioAlba2026!», «pilates123» en «Alba Pilates»), o el nombre entero
 *     dentro de algo más largo. Lo que sobra de quitar cifras y signos tiene que
 *     tener al menos 4 letras: «a1234567» no es «el nombre del estudio».
 */
export function contrasenaFacil(contrasena: string, nombreEstudio: string): boolean {
  if (!contrasena) return false;
  const minus = contrasena.toLowerCase();
  if (COMUNES.has(minus)) return true;
  if (/^(.)\1+$/u.test(contrasena)) return true;
  if (esEscalera(contrasena)) return true;
  const nombre = plano(nombreEstudio);
  if (nombre.length < 4) return false;
  const letras = plano(contrasena).replace(/\d/g, '');
  if (letras.length >= 4 && nombre.includes(letras)) return true;
  // Al revés solo con nombres de 6 letras o más: «alba» está dentro de
  // «albaricoque», y eso no es poner el nombre del estudio.
  return nombre.length >= 6 && plano(contrasena).includes(nombre);
}

/** Las dos casillas de la contraseña: se marcan solas mientras se escribe. */
export function reglasContrasena(contrasena: string, nombreEstudio: string): { largo: boolean; dificil: boolean } {
  const largo = contrasena.length >= MIN_CONTRASENA;
  return { largo, dificil: largo && !contrasenaFacil(contrasena, nombreEstudio) };
}

// ── «¿Querías decir…?» ──────────────────────────────────────────────────────

/** A los que se sugiere ir: los proveedores que de verdad usan los estudios. */
export const DOMINIOS_SUGERIBLES = [
  'gmail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'yahoo.es', 'yahoo.com',
  'icloud.com', 'live.com', 'me.com', 'telefonica.net', 'movistar.es', 'protonmail.com',
] as const;

/**
 * Dominios reales que se parecen a uno de arriba y NO son una errata: a
 * «mac.com» le quedan dos letras para ser «me.com», y «yahoo.fr» es de alguien.
 */
const DOMINIOS_BUENOS = new Set<string>([
  ...DOMINIOS_SUGERIBLES,
  'mac.com', 'msn.com', 'aol.com', 'ymail.com', 'gmx.com', 'gmx.es', 'gmx.net', 'gmx.de', 'yahoo.fr',
  'yahoo.it', 'yahoo.de', 'yahoo.co.uk', 'hotmail.fr', 'hotmail.it', 'hotmail.de', 'hotmail.co.uk',
  'outlook.fr', 'outlook.it', 'outlook.de', 'live.fr', 'live.it', 'live.co.uk', 'proton.me', 'pm.me',
  'terra.es', 'ono.com', 'orange.es', 'vodafone.es', 'yandex.com', 'zoho.com', 'mail.com', 'email.com',
]);

/** Distancia de edición (inserta, borra o cambia un carácter). */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previa = fila;
  }
  return previa[b.length];
}

/**
 * Si el dominio del email parece una errata de uno de los de siempre
 * («gmial.com», «hotmail.con», «gmailcom»), el email con el dominio bueno;
 * si no, null. A dos ediciones como mucho, y a una si el dominio bueno es corto
 * («me.com»): con seis letras, dos cambios ya convierten casi cualquier cosa en
 * otra. Los dominios de ejemplo (`example.com`…) y los buenos no se tocan.
 *
 * Solo SUGIERE: la pantalla pregunta «¿Querías decir…?» y lo cambia si se pulsa.
 */
export function sugerirEmail(email: string): string | null {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(email.trim());
  if (!m) return null;
  const dominio = m[2].toLowerCase();
  if (dominio.length < 3) return null;
  if (DOMINIOS_BUENOS.has(dominio)) return null;
  if (/(^|\.)(example\.(com|org|net)|invalid|test|localhost)$/.test(dominio)) return null;
  let mejor: string | null = null;
  let menor = Infinity;
  for (const bueno of DOMINIOS_SUGERIBLES) {
    const d = distancia(dominio, bueno);
    const tope = bueno.length < 8 ? 1 : 2;
    if (d <= tope && d < menor) {
      menor = d;
      mejor = bueno;
    }
  }
  return mejor ? `${m[1]}@${mejor}` : null;
}

// ── Lo que dice gotrue, en algo que se pueda leer ───────────────────────────

/**
 * El texto de error que devuelve el alta (`signUp`, lib/auth-context.tsx) ya
 * viene en castellano para lo conocido (contraseña filtrada, captcha, cuenta
 * que ya existe…). Para lo demás devuelve el mensaje crudo del servidor, y con
 * un 5xx eso puede ser «{}» o «Error sending confirmation email»: a quien se da
 * de alta no le dice nada. Esto lo traduce sin tapar lo que ya está bien dicho.
 */
export function mensajeDeErrorAlta(texto: string): string {
  const t = texto.trim();
  if (!t || /^[{[]/.test(t)) {
    return 'No hemos podido crear tu cuenta ahora mismo. Inténtalo otra vez en unos minutos; si sigue, escríbenos por WhatsApp.';
  }
  if (/confirmation (e-?mail|mail)|sending .*e-?mail|smtp/i.test(t)) {
    return 'No hemos podido mandarte el código. Inténtalo otra vez en unos minutos; si sigue, escríbenos por WhatsApp.';
  }
  return t;
}

// ── Su página de reservas, mientras escribe el nombre ───────────────────────

/**
 * La dirección BASE de su página (`tentare.app/reservar/<base>`). Es la que
 * pide `dbCreateStudio` al crearlo, pero no está garantizada: si otro estudio ya
 * la tiene (o es una palabra de la aplicación), le toca la misma con «-2»,
 * «-3»… Por eso la pantalla la enseña junto a esa advertencia, y la de verdad
 * sale después, del estudio ya creado.
 */
export function slugPrevisto(nombre: string): string {
  return nombre.trim() ? slugify(nombre) : 'tu-estudio';
}

/** «EA» para «Estudio Alba Pilates»: el logo de mentira de la vista previa. */
export function iniciales(nombre: string): string {
  const palabras = (nombre.trim() || 'Tu estudio')
    .split(/\s+/)
    .filter((w) => !/^(de|del|la|el|los|las|y)$/i.test(w));
  return ((palabras[0]?.charAt(0) ?? 'T') + (palabras[1]?.charAt(0) ?? '')).toUpperCase();
}

// ── Lo que viaja en el signUp ───────────────────────────────────────────────

export interface MetadataAltaNueva {
  /**
   * Clave PLANA a propósito: la lee la plantilla del correo de confirmación del
   * proyecto (`{{ if .Data.alta_nueva }}`, supabase/templates/confirmation.html)
   * para mandar el correo nuevo SOLO a esta alta. Esa plantilla la comparten
   * todas las altas del proyecto (equipo, alumnas, Network).
   */
  alta_nueva: true;
  pending_studio: {
    nombre: string;
    plan: 'BASE';
    version: 'v2' | 'v2_prueba';
    llegada?: string;
    condiciones_version: string;
  };
}

/**
 * La metadata del `signUp`. Sin nombre de persona ni ciudad: pasan al paso 3
 * (PR-3), donde se usan. `pending_studio` es lo que necesita `dbCreateStudio`
 * si el estudio se monta después desde /login, y de donde el trigger de
 * auth.users copia `version`, `llegada` y `condiciones_version`
 * (`altas_estudio`). `llegada` va solo si tiene la forma que acepta la base.
 */
export function metadataDelAlta(o: {
  nombre: string;
  version: 'v2' | 'v2_prueba';
  llegada: unknown;
  condicionesVersion: string;
}): MetadataAltaNueva {
  const llegada = normalizarLlegada(o.llegada);
  return {
    alta_nueva: true,
    pending_studio: {
      nombre: o.nombre.trim(),
      plan: 'BASE',
      version: o.version,
      ...(llegada ? { llegada } : {}),
      condiciones_version: o.condicionesVersion,
    },
  };
}

// ── El borrador: lo que se recuerda si cierra la pestaña ────────────────────

/**
 * Clave PROPIA, no la del alta de siempre (`tentare:alta-borrador`,
 * lib/alta/borrador.ts): las dos guardan cosas distintas, y con el interruptor
 * en «prueba» se puede pasar de una a otra en la misma pestaña.
 */
export const CLAVE_BORRADOR_ALTA_NUEVA = 'tentare:alta-nueva-borrador';
const CADUCA_MS = 7 * 86_400_000;

export interface BorradorAltaNueva {
  nombre: string;
  email: string;
}

/** ⚠️ La contraseña NUNCA se guarda: localStorage lo lee cualquier script de la página. */
export function guardarBorradorAltaNueva(d: BorradorAltaNueva): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_BORRADOR_ALTA_NUEVA, JSON.stringify({
      nombre: d.nombre.slice(0, MAX_NOMBRE), email: d.email.slice(0, MAX_EMAIL), guardadoEn: Date.now(),
    }));
  } catch { /* modo privado, cuota llena: perder el borrador no rompe el alta */ }
}

export function leerBorradorAltaNueva(): BorradorAltaNueva | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_BORRADOR_ALTA_NUEVA);
    return crudo ? borradorDesdeTexto(crudo, Date.now()) : null;
  } catch {
    return null;
  }
}

/**
 * Del texto guardado a un borrador, campo a campo y con su tipo comprobado: lo
 * que hay en localStorage lo puede editar cualquiera. Caducado o roto → null.
 */
export function borradorDesdeTexto(crudo: string, ahoraMs: number): BorradorAltaNueva | null {
  try {
    const d = JSON.parse(crudo) as Record<string, unknown> | null;
    if (!d || typeof d.guardadoEn !== 'number' || ahoraMs - d.guardadoEn > CADUCA_MS) return null;
    const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    const nombre = texto(d.nombre, MAX_NOMBRE);
    const email = texto(d.email, MAX_EMAIL);
    return nombre || email ? { nombre, email } : null;
  } catch {
    return null;
  }
}

export function olvidarBorradorAltaNueva(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(CLAVE_BORRADOR_ALTA_NUEVA); } catch { /* ver guardar */ }
}
