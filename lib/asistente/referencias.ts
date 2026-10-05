// ─────────────────────────────────────────────────────────────────────────────
// Personas como REFERENCIAS hacia Anthropic (decisión del fundador 2-oct-2026,
// lib/ai/seudonimizar.ts): a la IA le basta saber que es «la misma alumna», no
// quién es.
//
// La tabla vive por conversación (`asistente_conversaciones.referencias`) y
// guarda ref → id, NUNCA nombres: una persona = una referencia estable en toda
// la conversación. Los nombres se resuelven en el servidor al responder y solo
// viajan al navegador (evento `referencias`), así que el borrado RGPD de una
// socia no deja rastro en las tablas del asistente.
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { claveDePalabra, seudonimizar, type PersonaASeudonimizar } from '../ai/seudonimizar.ts';

export type TipoReferencia = 'socia' | 'instructora';
export interface EntradaReferencia { tipo: TipoReferencia; id: string }

const PREFIJO: Record<TipoReferencia, string> = { socia: 'ALUMNA', instructora: 'EQUIPO' };
const REF = /^(ALUMNA|EQUIPO)_(\d+)$/;

export interface TablaReferencias {
  /** `ALUMNA_n` de esa socia (la crea si no la tenía). */
  socia: (id: string) => string;
  /** `EQUIPO_n` de esa persona del equipo. */
  equipo: (id: string) => string;
  get: (ref: string) => EntradaReferencia | undefined;
  /** Para guardar: ref → { tipo, id }. */
  aJson: () => Record<string, EntradaReferencia>;
  /** Las refs creadas o usadas desde la última llamada (para mandar sus nombres al navegador). */
  tomarUsadas: () => string[];
}

export function tablaReferencias(inicial: unknown = {}): TablaReferencias {
  const porRef = new Map<string, EntradaReferencia>();
  const porId = new Map<string, string>();
  const contador: Record<string, number> = { ALUMNA: 0, EQUIPO: 0 };
  const usadas = new Set<string>();

  if (inicial && typeof inicial === 'object') {
    for (const [ref, v] of Object.entries(inicial as Record<string, unknown>)) {
      const m = REF.exec(ref);
      const e = v as Partial<EntradaReferencia> | null;
      if (!m || !e || (e.tipo !== 'socia' && e.tipo !== 'instructora') || typeof e.id !== 'string') continue;
      if (PREFIJO[e.tipo] !== m[1]) continue;
      porRef.set(ref, { tipo: e.tipo, id: e.id });
      porId.set(`${e.tipo}:${e.id}`, ref);
      contador[m[1]] = Math.max(contador[m[1]], Number(m[2]));
    }
  }

  const de = (tipo: TipoReferencia) => (id: string) => {
    const clave = `${tipo}:${id}`;
    let ref = porId.get(clave);
    if (!ref) {
      const p = PREFIJO[tipo];
      ref = `${p}_${++contador[p]}`;
      porId.set(clave, ref);
      porRef.set(ref, { tipo, id });
    }
    usadas.add(ref);
    return ref;
  };

  return {
    socia: de('socia'),
    equipo: de('instructora'),
    get: ref => porRef.get(ref),
    aJson: () => Object.fromEntries([...porRef.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))),
    tomarUsadas: () => { const r = [...usadas]; usadas.clear(); return r; },
  };
}

/** `[ALUMNA_3]`: como se escribe dentro de un texto para el modelo. */
export const marca = (ref: string) => `[${ref}]`;

export interface PersonaDelEstudio {
  tipo: TipoReferencia;
  id: string;
  nombre: string | null;
  apellidos?: string | null;
}

export interface PreguntaMarcada {
  texto: string;
  /**
   * Marcas de esta pregunta que no se pueden atar a UNA persona (un «Ana» con
   * tres Anas en el estudio): `PERSONA_n` → lo que escribió ella. Solo para el
   * navegador y solo en este turno; no se guardan.
   */
  locales: Record<string, string>;
}

/**
 * Cambia en la pregunta los nombres de socias y equipo por su referencia. Usa
 * `seudonimizar` (hereda sus límites: palabras comunes, terceras personas;
 * correos y teléfonos salen como `[EMAIL_n]`/`[TELEFONO_n]`) y después junta
 * cada tramo de marcas seguidas («Ana García» → dos marcas) en una persona:
 * la que tiene TODAS esas palabras en su nombre. Si es una sola, su referencia
 * estable; si son varias, una `PERSONA_n` de este turno.
 */
export function marcarPersonasEnPregunta(
  texto: string, personas: readonly PersonaDelEstudio[], refs: TablaReferencias,
): PreguntaMarcada {
  const lista: PersonaASeudonimizar[] = personas.map((p, i) => ({ marca: `P${i}`, nombre: p.nombre, apellidos: p.apellidos }));
  const { texto: conMarcas, tabla } = seudonimizar(texto, lista);

  // Palabra → personas que la llevan en su nombre.
  const quien = new Map<string, Set<number>>();
  personas.forEach((p, i) => {
    for (const w of `${p.nombre ?? ''} ${p.apellidos ?? ''}`.split(/\s+/)) {
      if (!w) continue;
      const k = claveDePalabra(w);
      const s = quien.get(k) ?? new Set<number>();
      s.add(i);
      quien.set(k, s);
    }
  });

  const locales: Record<string, string> = {};
  let nLocales = 0;
  const resultado = conMarcas.replace(/\[P\d+_\d+\](?:\s+\[P\d+_\d+\])*/g, tramo => {
    const marcas = tramo.match(/\[P\d+_\d+\]/g) ?? [];
    const palabras = marcas.map(m => tabla.get(m) ?? '');
    const conjuntos = palabras.map(w => quien.get(claveDePalabra(w)) ?? new Set<number>());
    const unicas = conjuntos.length ? [...conjuntos[0]].filter(i => conjuntos.every(c => c.has(i))) : [];
    if (unicas.length === 1) {
      const p = personas[unicas[0]];
      return marca(p.tipo === 'socia' ? refs.socia(p.id) : refs.equipo(p.id));
    }
    const ref = `PERSONA_${++nLocales}`;
    locales[ref] = palabras.join(' ');
    return marca(ref);
  });
  return { texto: resultado, locales };
}

/** Lo que se le explica al modelo sobre las marcas (adaptado de INSTRUCCION_MARCAS). */
export const INSTRUCCION_REFERENCIAS = 'Las personas nunca aparecen con su nombre: [ALUMNA_1], [ALUMNA_2]… son alumnas del estudio; [EQUIPO_1]… personas del equipo; [PERSONA_1] es alguien a quien la propietaria ha nombrado y que no se ha podido identificar; [EMAIL_1] y [TELEFONO_1], un correo o un teléfono. Si necesitas nombrar a alguien, copia su marca EXACTAMENTE igual, con sus corchetes: el panel la convierte en su nombre. No intentes adivinar a quién se refiere ni inventes nombres.';
