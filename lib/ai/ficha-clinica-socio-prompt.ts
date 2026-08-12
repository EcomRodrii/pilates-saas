// Prompt de la IA de adaptación individual (FICHA-CLINICA.md §9, extensión).
// Hermano de ficha-clinica-clase-prompt.ts: mismo disclaimer y misma forma de
// respuesta, pero responde "¿qué adaptar SIEMPRE para esta socia?" en vez de
// "¿qué tener en cuenta HOY para esta clase?" — no se fuerza en la misma ruta
// porque la pregunta y el framing son distintos. La IA NO decide nada clínico:
// recibe solo las condiciones activas de UNA socia (sin nombre) y pone
// palabras — resumen, qué evitar y variantes.

import type { CondicionSalud } from '@/lib/types';
import { restriccionesLegibles } from '@/lib/ficha-clinica';

export const FICHA_CLINICA_SOCIO_SYSTEM_PROMPT = `Eres un asistente para instructores de Pilates.
Recibes las CONDICIONES DE SALUD ACTIVAS de UNA alumna (categoría, zona, severidad, restricciones y descripciones de cada condición). No hay nombre ni ningún otro dato personal — no lo inventes ni lo pidas.

Tu tarea: decirle a la instructora qué debería adaptar SIEMPRE que dé clase con esta alumna, no solo para una sesión concreta. Tono cercano y profesional, como Apple Fitness — nunca infantil.

NO eres un profesional sanitario: no diagnostiques, no prescribas tratamiento, no des consejo médico. Ofreces adaptaciones y variantes de ejercicios de Pilates, siempre como sugerencia a revisar por la instructora.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "resumen": "string — una o dos frases describiendo la situación de la alumna (p.ej. 'Embarazo de 22 semanas, sin otras condiciones').",
  "evitar": ["string", ...] — lista breve de movimientos/ejercicios a evitar dadas sus restricciones. Vacía si no hay condiciones.",
  "variantes": ["string", ...] — lista breve de variantes o adaptaciones concretas de Pilates para sus condiciones. Vacía si no hay condiciones."
}
Responde SOLO con el JSON, sin texto adicional.`;

const CATEGORIA_TEXTO: Record<string, string> = {
  LESION: 'lesión', EMBARAZO: 'embarazo', POSTPARTO: 'postparto',
  CRONICA: 'condición crónica', PROTESIS: 'prótesis', OTRO: 'otra',
};
const ZONA_TEXTO: Record<string, string> = {
  RODILLA: 'rodilla', COLUMNA: 'columna', HOMBRO: 'hombro', CADERA: 'cadera',
  CUELLO: 'cuello', MUNECA: 'muñeca', TOBILLO: 'tobillo', GENERAL: 'general',
};

export function buildFichaClinicaSocioUserPrompt(condiciones: CondicionSalud[]): string {
  const lineas: string[] = condiciones.map(c => {
    const partes = [
      `${CATEGORIA_TEXTO[c.categoria] ?? c.categoria.toLowerCase()}`,
      c.zona ? `zona ${ZONA_TEXTO[c.zona] ?? c.zona.toLowerCase()}` : null,
      `severidad ${c.severidad.toLowerCase()}`,
    ].filter(Boolean);
    const restricciones = restriccionesLegibles(c);
    let linea = `- ${c.etiqueta} (${partes.join(', ')})`;
    if (restricciones.length) linea += `. Restricciones: ${restricciones.join(', ')}.`;
    return linea;
  });
  return `Condiciones activas:\n${lineas.join('\n')}`;
}
