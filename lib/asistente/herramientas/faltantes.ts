// Qué se le dice al modelo cuando una herramienta de PROPUESTA llega con datos que
// no puede saber (0, vacío): que PREGUNTE, en vez de reintentar con otro relleno.
// Aparte de index.ts para probarlo sin los imports con alias de las lecturas.

/** Qué decirle al modelo cuando falta un dato: que lo PREGUNTE. */
const PISTAS: Record<string, string> = {
  capacidad: 'Falta la capacidad de la sala: pregunta cuántas plazas tiene.',
  nombre: 'Falta el nombre: pregunta cómo se llama.',
  aforo: 'El aforo, si no lo dijo, se omite (no se acepta 0).',
  tipo_clase: 'Falta el tipo de clase: pregunta cuál.',
  sala: 'Falta la sala: pregunta en cuál.',
  fecha: 'Falta la fecha: pregunta qué día.',
  hora: 'Falta la hora: pregunta a qué hora.',
  alumna: 'Falta la alumna: pregunta quién.',
  instructora: 'Falta la instructora: pregunta quién.',
  texto: 'Falta el anuncio: pregunta qué quiere contar.',
  duracion_min: 'La duración, si no la dijo, se omite.',
};

export function mensajeDeFaltantes(issues: readonly { path: readonly PropertyKey[] }[]): string {
  const campos = [...new Set(issues.map(i => String(i.path[0] ?? '')).filter(Boolean))];
  const pistas = campos.map(c => PISTAS[c]).filter(Boolean).join(' ');
  return `Falta o no es válido: ${campos.join(', ') || 'algún dato'}. ${pistas} NO rellenes con 0 ni inventes: pregunta a la persona UNA cosa y no llames a ninguna herramienta de propuesta hasta tenerla.`;
}
