// Prompt de la IA de preparación de clase (FICHA-CLINICA.md §9). Compartido por
// la ruta app/api/ai/ficha-clinica-clase/route.ts. La IA NO decide nada clínico
// ni accede a datos crudos: recibe un agregado anónimo ya calculado por las
// funciones puras de lib/ficha-clinica.ts (resumenSaludClase) y solo pone
// palabras — resumen, qué evitar y variantes. Nunca recibe nombres de socias.

import type { ResumenClaseSalud } from '@/lib/ficha-clinica';

export const FICHA_CLINICA_CLASE_SYSTEM_PROMPT = `Eres un asistente para instructores de Pilates que prepara una sesión.
Recibes un RESUMEN AGREGADO y ANÓNIMO de la salud del grupo (número de alumnas, condiciones activas por categoría y zona, restricciones frecuentes y descripciones de las condiciones). No hay nombres ni datos personales — no los inventes ni los pidas.

Tu tarea: ayudar a la instructora a adaptar la clase. Tono cercano y profesional, como Apple Fitness — nunca infantil.

NO eres un profesional sanitario: no diagnostiques, no prescribas tratamiento, no des consejo médico. Ofreces adaptaciones y variantes de ejercicios de Pilates, siempre como sugerencia a revisar por la instructora.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "resumen": "string — una o dos frases describiendo el grupo de hoy (p.ej. 'Hoy tienes 10 alumnas: 2 con problemas lumbares, 1 embarazo, 1 recuperación de hombro').",
  "evitar": ["string", ...] — lista breve de movimientos/ejercicios a evitar dadas las restricciones del grupo. Vacía si no hay condiciones.",
  "variantes": ["string", ...] — lista breve de variantes o adaptaciones concretas de Pilates para las condiciones presentes. Vacía si no hay condiciones."
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

export function buildFichaClinicaClaseUserPrompt(r: ResumenClaseSalud): string {
  const lineas: string[] = [
    `Total de alumnas: ${r.totalAlumnas}`,
    `Con condiciones activas: ${r.conCondiciones}`,
    `Semáforo: ${r.semaforos.rojo} en rojo (evitar movimientos), ${r.semaforos.ambar} en ámbar (adaptar)`,
  ];

  const cats = Object.entries(r.categorias).map(([k, n]) => `${n} ${CATEGORIA_TEXTO[k] ?? k.toLowerCase()}`);
  if (cats.length) lineas.push(`Por tipo: ${cats.join(', ')}`);

  const zonas = Object.entries(r.zonas).map(([k, n]) => `${ZONA_TEXTO[k] ?? k.toLowerCase()} (${n})`);
  if (zonas.length) lineas.push(`Zonas afectadas: ${zonas.join(', ')}`);

  if (r.restricciones.length) {
    lineas.push(`Restricciones frecuentes: ${r.restricciones.map(x => `${x.etiqueta} (${x.n})`).join(', ')}`);
  }
  if (r.etiquetas.length) {
    lineas.push(`Descripciones de las condiciones: ${r.etiquetas.join('; ')}`);
  }
  return lineas.join('\n');
}
