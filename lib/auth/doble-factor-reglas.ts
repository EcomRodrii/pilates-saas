// ─────────────────────────────────────────────────────────────────────────────
// Verificación en dos pasos del EQUIPO de un estudio (contrato de encargo,
// decisión del fundador 2-oct-2026): opcional para todo el equipo del panel, y
// la propietaria puede exigirla a todos (`studios.exigir_doble_factor`).
//
// Dos reglas, y las dos se comprueban en el servidor, no solo en pantalla:
//
//   A. Quien la tiene activada (un factor TOTP verificado) solo entra con la
//      sesión verificada (`aal2`). La comprueba la BASE DE DATOS en cada tabla
//      (política restrictiva `exige_doble_factor`, migr 20261003102845) y
//      `verificarSesionStaff` en cada ruta de API. Sin ella, una contraseña
//      robada daría los datos yendo directo a la API de Supabase.
//   B. Si su estudio la exige y su rol es del panel (no INSTRUCTOR, que trabaja
//      en la app del estudio), sin `aal2` no hay panel ni API: primero la
//      activa. Esta la comprueban `verificarSesionStaff` y el panel; la BD no
//      (quien aún no la tiene está como hasta hoy, y el panel no le deja pasar
//      de la pantalla de activarla).
//
// Puro, sin imports de Next ni de `@/`, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export type NivelSesion = 'aal1' | 'aal2';

export interface FactorDeUsuario { status?: string | null; factor_type?: string | null; friendly_name?: string | null }

/**
 * El factor que `/interno` obliga a crear al equipo de Tentare (app/interno/mfa).
 * Solo cuenta en la zona interna (decisión del fundador, 5-oct-2026): el factor
 * de Supabase es uno por cuenta, y con él se pedía el código en el panel y en
 * la app del estudio aunque la persona no la hubiera activado ahí.
 */
export const NOMBRE_FACTOR_INTERNO = 'Tentare Internal';

export function esFactorInterno(f: FactorDeUsuario): boolean {
  return f.friendly_name === NOMBRE_FACTOR_INTERNO;
}

/**
 * Factores verificados que encienden la verificación de la CUENTA (`user.factors`):
 * todos menos el de la zona interna. Misma regla en SQL: `tiene_factor_de_cuenta`
 * (migr 20261005220308).
 */
export function factoresVerificados(factores: readonly FactorDeUsuario[] | null | undefined): number {
  return (factores ?? []).filter(f => f.status === 'verified' && !esFactorInterno(f)).length;
}

/** ¿Hace falta el segundo paso para entrar? */
export function exigeSegundoPaso(p: { factoresVerificados: number; estudioLoExige: boolean; rol: string }): boolean {
  return p.factoresVerificados > 0 || (p.estudioLoExige && p.rol !== 'INSTRUCTOR');
}

/**
 * ¿A esta sesión le falta el segundo paso? La regla A, vista desde una ruta
 * que no es del panel (la app del estudio, `/reservar`, el widget, la red):
 * quien tiene la verificación activada solo pasa con `aal2` o con una sesión
 * que el servidor confió (dispositivo recordado o código del correo). Quien no
 * la tiene activada pasa siempre: para ella esto no existe.
 */
export function faltaSegundoPaso(p: { factoresVerificados: number; nivel: NivelSesion; confiada: boolean }): boolean {
  return p.factoresVerificados > 0 && p.nivel !== 'aal2' && !p.confiada;
}

/**
 * ¿Le falta a esta sesión el código de la verificación de la cuenta? Lo que
 * miran las guardias del NAVEGADOR (panel, app del estudio, red) sin ir a la red.
 * No basta `nextLevel === 'aal2'` de supabase-js: lo pone cualquier factor,
 * también el de la zona interna, que aquí no cuenta.
 */
export function sesionPideCodigo(p: { actual: string | null | undefined; factores: readonly FactorDeUsuario[] | null | undefined }): boolean {
  return p.actual !== 'aal2' && factoresVerificados(p.factores) > 0;
}

/** Lo que contesta una ruta cuando la sesión es buena pero le falta el segundo paso. */
export const CODIGO_SEGUNDO_PASO = 'doble_factor_requerido';

export type PasoDobleFactor = 'ok' | 'verificar' | 'activar';

/**
 * Qué le toca a esta sesión: entrar, escribir el código (ya la tiene) o
 * activarla (su estudio la exige y aún no la tiene).
 */
export function pasoDobleFactor(p: {
  nivel: NivelSesion; factoresVerificados: number; estudioLoExige: boolean; rol: string;
}): PasoDobleFactor {
  if (p.nivel === 'aal2' || !exigeSegundoPaso(p)) return 'ok';
  return p.factoresVerificados > 0 ? 'verificar' : 'activar';
}

/**
 * A dónde volver tras verificar. Solo rutas del propio panel: el parámetro
 * llega por la URL y, sin esta lista, sería una redirección abierta. La zona
 * interna tiene su propia pantalla (`lib/interno/mfa.ts`).
 */
export function destinoTrasVerificar(volver: string | null | undefined): string {
  // Ningún carácter de control: el navegador los QUITA al resolver la URL, y
  // «/\t/otro.dominio» acabaría siendo «//otro.dominio».
  if (!volver || /[\u0000-\u001f\u007f]/.test(volver)) return '/dashboard';
  if (!volver.startsWith('/') || volver.startsWith('//') || volver.includes('\\')) return '/dashboard';
  // Y lo que resuelva tiene que quedarse en el mismo origen.
  const base = 'https://origen.invalid';
  let url: URL;
  try { url = new URL(volver, base); } catch { return '/dashboard'; }
  if (url.origin !== base) return '/dashboard';
  const ruta = url.pathname + url.search + url.hash;
  if (ruta.startsWith('/interno') || ruta.startsWith('/verificar-acceso') || ruta.startsWith('/login')) return '/dashboard';
  return ruta;
}
