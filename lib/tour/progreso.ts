// ─────────────────────────────────────────────────────────────────────────────
// Por dónde va la visita guiada: el estado, y cómo se avanza.
//
// Vive en `studios.tour_progreso` (jsonb), no en el navegador: si cierras el
// ordenador a mitad del capítulo 5 y abres el móvil mañana, sigues en el paso
// exacto. Ocupa ~1 KB.
//
// Todo aquí es puro: el estado entra y sale entero, y la UI no decide nada.
//
// ⚠️ `parseProgreso` NUNCA lanza ni devuelve basura: un progreso corrupto
// (`null`, `{}`, una cadena vacía, una versión que no conocemos) vuelve a
// empezar. Es la misma lección de `resolverPasoGuardado` del tour anterior:
// `Number('')` es 0, y un «valor raro» tomado como «paso 0» arrancaba el tour
// solo, con su overlay, en cualquier pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { CAPITULOS, pasoPorId, type CapituloVisita, type PasoVisita } from './capitulos.ts';

export const VERSION_PROGRESO = 1;

export interface ProgresoVisita {
  v: typeof VERSION_PROGRESO;
  /** Ya vio la pantalla de bienvenida a la visita. */
  inicio: boolean;
  /** Pasos cumplidos (un «mira» entendido o un «hacer» con datos). */
  hechos: string[];
  /** Pasos «hacer» que no se pudieron hacer ahora: cuentan como cerrados y salen al final. */
  aplazados: string[];
  /** Capítulos cuya pantalla de «completado» ya se vio. */
  vistos: string[];
}

export const PROGRESO_VACIO: ProgresoVisita = { v: VERSION_PROGRESO, inicio: false, hechos: [], aplazados: [], vistos: [] };

const MAX_ELEMENTOS = 100;

function lista(x: unknown, valido: (s: string) => boolean): string[] {
  if (!Array.isArray(x)) return [];
  const fuera = new Set<string>();
  for (const e of x) if (typeof e === 'string' && valido(e)) fuera.add(e);
  return [...fuera].slice(0, MAX_ELEMENTOS);
}

/** Lo que llega de la base de datos o del navegador, a un progreso que el resto del código puede creerse. */
export function parseProgreso(raw: unknown): ProgresoVisita {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return { ...PROGRESO_VACIO };
    try { o = JSON.parse(raw); } catch { return { ...PROGRESO_VACIO }; }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ...PROGRESO_VACIO };
  const r = o as Record<string, unknown>;
  if (r.v !== VERSION_PROGRESO) return { ...PROGRESO_VACIO };
  return {
    v: VERSION_PROGRESO,
    inicio: r.inicio === true,
    // Un paso que ya no existe (se quitó o renombró en una versión nueva) se descarta.
    hechos: lista(r.hechos, s => !!pasoPorId(s)),
    aplazados: lista(r.aplazados, s => !!pasoPorId(s)),
    vistos: lista(r.vistos, s => CAPITULOS.some(c => c.id === s)),
  };
}

export function empezar(p: ProgresoVisita): ProgresoVisita {
  return p.inicio ? p : { ...p, inicio: true };
}

export function cerrarPaso(p: ProgresoVisita, id: string, como: 'hecho' | 'aplazado'): ProgresoVisita {
  if (!pasoPorId(id)) return p;
  if (p.hechos.includes(id) || p.aplazados.includes(id)) return p;
  return como === 'hecho'
    ? { ...p, hechos: [...p.hechos, id] }
    : { ...p, aplazados: [...p.aplazados, id] };
}

export function verCapitulo(p: ProgresoVisita, id: string): ProgresoVisita {
  return p.vistos.includes(id) ? p : { ...p, vistos: [...p.vistos, id] };
}

export function pasoCerrado(p: ProgresoVisita, id: string): boolean {
  return p.hechos.includes(id) || p.aplazados.includes(id);
}

/** ¿Este paso se le enseña a esta persona, ahora y aquí? (rol, congelado, pantalla estrecha…) */
export type Aplica = (paso: PasoVisita) => boolean;

/** Lo que toca enseñar. */
export type EstadoVisita =
  | { fase: 'inicio' }
  | { fase: 'paso'; capitulo: CapituloVisita; paso: PasoVisita; numero: number; de: number }
  | { fase: 'capitulo'; capitulo: CapituloVisita }
  | { fase: 'fin' };

/**
 * El siguiente momento de la visita, en orden. Un capítulo cuyos pasos están
 * todos cerrados enseña su pantalla de «completado» UNA vez, antes de pasar al
 * siguiente; uno sin ningún paso aplicable (otra pantalla, otro rol) se salta sin
 * pantalla: no se felicita a nadie por algo que no ha visto.
 */
export function estadoVisita(p: ProgresoVisita, aplica: Aplica): EstadoVisita {
  if (!p.inicio) return { fase: 'inicio' };
  for (const capitulo of CAPITULOS) {
    const propios = capitulo.pasos.filter(aplica);
    if (propios.length === 0) continue;
    const pendiente = propios.find(s => !pasoCerrado(p, s.id));
    if (pendiente) {
      return { fase: 'paso', capitulo, paso: pendiente, numero: propios.indexOf(pendiente) + 1, de: propios.length };
    }
    if (!p.vistos.includes(capitulo.id)) return { fase: 'capitulo', capitulo };
  }
  return { fase: 'fin' };
}

/** Cuántos capítulos lleva terminados, para la píldora («Capítulo 5 de 10»). */
export function capitulosConPasos(aplica: Aplica): CapituloVisita[] {
  return CAPITULOS.filter(c => c.pasos.some(aplica));
}

/** Los pasos aplazados, para enseñarlos al final con su enlace. */
export function aplazadosEnOrden(p: ProgresoVisita): PasoVisita[] {
  return p.aplazados.map(pasoPorId).filter((s): s is PasoVisita => !!s);
}

/** El paso cerrado inmediatamente anterior al dado (para «Anterior»). */
export function pasoAnteriorA(p: ProgresoVisita, id: string, aplica: Aplica): PasoVisita | null {
  const todos = CAPITULOS.flatMap(c => c.pasos).filter(aplica);
  const i = todos.findIndex(s => s.id === id);
  for (let j = i - 1; j >= 0; j--) if (pasoCerrado(p, todos[j].id)) return todos[j];
  return null;
}
