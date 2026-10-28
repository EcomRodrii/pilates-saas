// Lo que la demo recuerda en el navegador para poder volver. Sin React ni `@/`.
//
//   · localStorage (24 h, como la sesión): el token, el centro, la conversación
//     y la propuesta de Tenti. NADA personal: ni nombre ni correo ni teléfono.
//   · sessionStorage (solo esta pestaña): lo escrito en el formulario, para que
//     un error al guardar o una recarga no lo pierdan. Sin la casilla comercial:
//     una casilla que se recuerda marcada ya no «nace desmarcada».
//
// Todo lo que se lee se vuelve a comprobar campo a campo: lo que hay en el
// navegador lo puede editar cualquiera, y no se ejecuta ni se da por bueno
// (la propuesta se revalida en el servidor al retomarla).
import { esTipoCentro, type TipoCentro } from './centros.ts';
import { MAX_MENSAJES_HISTORIAL, sanearHistorial, type MensajeHistorial } from './tenti.ts';
import { MAX_EMAIL, MAX_ESTUDIO, MAX_NOMBRE, limpiarTexto } from './lead.ts';

export const CLAVE_SESION_DEMO = 'tentare:demo-v1';
export const CLAVE_DATOS_DEMO = 'tentare:demo-datos-v1';
export const CADUCA_MS = 24 * 60 * 60 * 1000;

export interface PropuestaGuardada {
  escenario: string;
  parametros: Record<string, unknown>;
  resumen: string;
  aclaracion: string | null;
}

export interface SesionGuardada {
  sesion: string;
  tipoCentro: TipoCentro;
  historial: MensajeHistorial[];
  propuesta: PropuestaGuardada | null;
}

export interface DatosFormulario {
  nombre: string;
  estudio: string;
  email: string;
  telefono: string;
}

export function sesionDesdeTexto(crudo: string | null, ahoraMs: number): SesionGuardada | null {
  if (!crudo) return null;
  try {
    const d = JSON.parse(crudo) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return null;
    if (typeof d.guardadoEn !== 'number' || ahoraMs - d.guardadoEn > CADUCA_MS || d.guardadoEn > ahoraMs + 60_000) return null;
    if (typeof d.sesion !== 'string' || d.sesion.length < 10 || d.sesion.length > 1000) return null;
    if (!esTipoCentro(d.tipoCentro)) return null;
    let propuesta: PropuestaGuardada | null = null;
    const p = d.propuesta as Record<string, unknown> | null | undefined;
    if (p && typeof p === 'object' && typeof p.escenario === 'string' && p.escenario.length < 60
      && p.parametros && typeof p.parametros === 'object' && !Array.isArray(p.parametros)) {
      propuesta = {
        escenario: p.escenario,
        parametros: p.parametros as Record<string, unknown>,
        resumen: limpiarTexto(p.resumen, 300),
        aclaracion: typeof p.aclaracion === 'string' ? limpiarTexto(p.aclaracion, 320) : null,
      };
    }
    return { sesion: d.sesion, tipoCentro: d.tipoCentro, historial: sanearHistorial(d.historial).slice(-MAX_MENSAJES_HISTORIAL), propuesta };
  } catch {
    return null;
  }
}

export function textoDeSesion(s: SesionGuardada, ahoraMs: number): string {
  return JSON.stringify({ ...s, guardadoEn: ahoraMs });
}

export function datosDesdeTexto(crudo: string | null): DatosFormulario | null {
  if (!crudo) return null;
  try {
    const d = JSON.parse(crudo) as Record<string, unknown> | null;
    if (!d || typeof d !== 'object') return null;
    return {
      nombre: limpiarTexto(d.nombre, MAX_NOMBRE),
      estudio: limpiarTexto(d.estudio, MAX_ESTUDIO),
      email: limpiarTexto(d.email, MAX_EMAIL),
      telefono: limpiarTexto(d.telefono, 30),
    };
  } catch {
    return null;
  }
}

function almacen(tipo: 'local' | 'session'): Storage | null {
  try {
    return typeof window === 'undefined' ? null : tipo === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function leerSesionGuardada(): SesionGuardada | null {
  try { return sesionDesdeTexto(almacen('local')?.getItem(CLAVE_SESION_DEMO) ?? null, Date.now()); } catch { return null; }
}
export function guardarSesion(s: SesionGuardada): void {
  try { almacen('local')?.setItem(CLAVE_SESION_DEMO, textoDeSesion(s, Date.now())); } catch { /* modo privado o cuota llena: perder el borrador no rompe la demo */ }
}
export function borrarSesion(): void {
  try { almacen('local')?.removeItem(CLAVE_SESION_DEMO); } catch { /* idem */ }
}
export function leerDatos(): DatosFormulario | null {
  try { return datosDesdeTexto(almacen('session')?.getItem(CLAVE_DATOS_DEMO) ?? null); } catch { return null; }
}
export function guardarDatos(d: DatosFormulario): void {
  try { almacen('session')?.setItem(CLAVE_DATOS_DEMO, JSON.stringify(d)); } catch { /* idem */ }
}
