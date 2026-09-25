// Las preguntas del estudio que contesta la propia alumna en su app.
//
// Petición de un estudio (25-sep-2026): había creado sus «Datos extra de la
// ficha» y, probando como alumna, no salían en ningún momento — solo existían en
// el panel. Quería que fueran obligatorias antes de reservar o comprar. El
// fundador lo quiso detrás de un interruptor de Configuración, APAGADO por
// defecto (`studios.preguntas_alta_activas`).
//
// Las preguntas son las MISMAS de «Datos extra de la ficha» (`campos_personalizados`)
// y las respuestas van al mismo sitio que cuando las rellena el mostrador
// (`socios.campos_extra`, por id de pregunta): el panel no distingue quién la
// contestó, y la alumna no tiene un segundo cuestionario paralelo.
//
// Pura y sin dependencias: la usan la ruta del servidor (que decide) y la app
// (que solo pinta), y se prueba con `node --test`.

export type TipoPregunta = 'texto' | 'numero' | 'fecha' | 'booleano' | 'seleccion';
export type ValorRespuesta = string | number | boolean | null;

export interface PreguntaAlta {
  id: string;
  etiqueta: string;
  tipo: TipoPregunta;
  opciones: string[];
  requerido: boolean;
}

/** Tope de un texto libre. Es una ficha, no una redacción. */
export const MAX_TEXTO = 500;

const TIPOS: readonly TipoPregunta[] = ['texto', 'numero', 'fecha', 'booleano', 'seleccion'];

export function esTipoPregunta(v: unknown): v is TipoPregunta {
  return typeof v === 'string' && (TIPOS as readonly string[]).includes(v);
}

/** ¿Hay algo contestado? `false` (un «No») SÍ es una respuesta. */
export function tieneRespuesta(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'boolean';
}

/**
 * Qué le falta por contestar.
 *
 * Una pregunta está pendiente si NUNCA se le ha hecho (su id no está en
 * `campos_extra`) o si es obligatoria y está vacía. Una opcional que dejó en
 * blanco queda guardada como `null`: ya se le preguntó y no se le vuelve a
 * insistir. Así, una pregunta que el estudio añada más tarde le sale sola a
 * quien ya estaba dada de alta, sin repetirle las demás.
 */
export function preguntasPendientes(preguntas: PreguntaAlta[], extra: Record<string, unknown> | null | undefined): PreguntaAlta[] {
  const e = extra ?? {};
  return preguntas.filter(p => !(p.id in e) || (p.requerido && !tieneRespuesta(e[p.id])));
}

function fechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Normaliza una respuesta a lo que se guarda. `undefined` = no válida. */
function normalizar(p: PreguntaAlta, crudo: unknown): ValorRespuesta | undefined {
  if (!tieneRespuesta(crudo)) return null;
  switch (p.tipo) {
    case 'texto':
      return typeof crudo === 'string' && crudo.trim().length <= MAX_TEXTO ? crudo.trim() : undefined;
    case 'numero': {
      const n = typeof crudo === 'number' ? crudo : typeof crudo === 'string' ? Number(crudo.replace(',', '.')) : NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    case 'fecha':
      return typeof crudo === 'string' && fechaValida(crudo.trim()) ? crudo.trim() : undefined;
    case 'booleano':
      return typeof crudo === 'boolean' ? crudo : undefined;
    case 'seleccion':
      return typeof crudo === 'string' && p.opciones.includes(crudo) ? crudo : undefined;
  }
}

const MENSAJE_INVALIDO: Record<TipoPregunta, string> = {
  texto: `Escribe como mucho ${MAX_TEXTO} caracteres.`,
  numero: 'Escribe un número.',
  fecha: 'Elige una fecha válida.',
  booleano: 'Elige sí o no.',
  seleccion: 'Elige una de las opciones.',
};

export type ResultadoRespuestas =
  | { ok: true; valores: Record<string, ValorRespuesta> }
  | { ok: false; errores: Record<string, string> };

/**
 * Valida lo que manda la alumna contra las preguntas de HOY del estudio.
 *
 * Solo se guardan respuestas a preguntas que existen y están activas: lo demás
 * que venga en el cuerpo se ignora (no se le deja escribir en `campos_extra`
 * claves que el estudio no ha pedido). Cada pregunta mostrada se guarda,
 * contestada o como `null`, para que deje de estar pendiente.
 */
export function validarRespuestas(preguntas: PreguntaAlta[], entrada: Record<string, unknown> | null | undefined): ResultadoRespuestas {
  const e = entrada ?? {};
  const valores: Record<string, ValorRespuesta> = {};
  const errores: Record<string, string> = {};
  for (const p of preguntas) {
    const v = normalizar(p, e[p.id]);
    if (v === undefined) { errores[p.id] = MENSAJE_INVALIDO[p.tipo]; continue; }
    if (p.requerido && v === null) { errores[p.id] = 'Esta pregunta es obligatoria.'; continue; }
    valores[p.id] = v;
  }
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, valores };
}
