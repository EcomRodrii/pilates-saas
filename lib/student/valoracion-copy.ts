// Lo que la alumna LEE en la valoración inicial.
//
// Aparte de `lib/valoracion-inicial.ts` a propósito: allí están las reglas, que
// se prueban; aquí las palabras, que se discuten. Cambiar «¿Qué te gustaría
// conseguir?» no debería tocar el fichero donde vive qué es obligatorio.
//
// ⚠️ NUNCA la palabra «Assessment», ni «cuestionario», ni «formulario». Y nada
// de lenguaje clínico: no se pregunta por «grado de movilidad articular» sino
// por cómo siente su cuerpo. La diferencia no es de estilo — una pregunta que
// suena a consulta médica cambia lo que la persona contesta, y además promete
// una competencia que un estudio de Pilates no tiene ni debe aparentar.

import type {
  Objetivo, Experiencia, Nivel, EstadoCuerpo, Zona, Frecuencia, IdPaso,
} from '@/lib/valoracion-inicial';

export const TITULO = 'Valoración inicial';
export const CONSENTIMIENTO_SALUD_TITULO = 'Antes de esta parte';

export const OBJETIVO_TEXTO: Record<Objetivo, string> = {
  movilidad: 'Mejorar mi movilidad',
  fuerza: 'Ganar fuerza',
  postura: 'Mejorar mi postura',
  molestias: 'Reducir molestias',
  flexibilidad: 'Ganar flexibilidad',
  bienestar: 'Sentirme mejor físicamente',
  lesion: 'Recuperarme de una lesión',
  otro_deporte: 'Preparar otro deporte',
  estres: 'Bajar el estrés',
  otro: 'Otra cosa',
};

/** Versión corta, para el resumen y para la ficha del panel. */
export const OBJETIVO_CHIP: Record<Objetivo, string> = {
  movilidad: 'Movilidad', fuerza: 'Fuerza', postura: 'Postura',
  molestias: 'Molestias', flexibilidad: 'Flexibilidad', bienestar: 'Bienestar',
  lesion: 'Lesión', otro_deporte: 'Otro deporte', estres: 'Estrés', otro: 'Otro',
};

export const EXPERIENCIA_TEXTO: Record<Experiencia, string> = {
  nunca: 'Nunca',
  algunas_veces: 'Alguna vez',
  habitual: 'De forma habitual',
  bastante: 'Tengo bastante experiencia',
};

export const NIVEL_TEXTO: Record<Nivel, string> = {
  principiante: 'Principiante',
  basico: 'Básico',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
  // Se ofrece a propósito, y no es relleno: obligar a elegir un nivel a quien
  // no lo sabe produce un dato inventado, que es peor que no tenerlo. La
  // instructora prefiere «no lo sé» a un «intermedio» que no lo es.
  no_segura: 'No estoy segura',
};

export const CUERPO_TEXTO: Record<EstadoCuerpo, string> = {
  agil: 'Me siento ágil y con buena movilidad',
  algo_rigida: 'Me noto algo rígida',
  bastante_rigida: 'Tengo bastante rigidez',
  recuperandome: 'Estoy recuperándome de algo',
  no_segura: 'No estoy segura',
};

export const ZONA_TEXTO: Record<Zona, string> = {
  cuello: 'Cuello', hombros: 'Hombros', espalda: 'Espalda',
  lumbar: 'Zona lumbar', cadera: 'Cadera', rodillas: 'Rodillas',
  tobillos: 'Tobillos o pies', munecas: 'Muñecas o manos', otra: 'Otra zona',
};

export const FRECUENCIA_TEXTO: Record<Frecuencia, string> = {
  nada: 'Ahora mismo, nada',
  menos_1: 'Menos de una vez por semana',
  una_dos: '1 o 2 veces por semana',
  tres_cuatro: '3 o 4 veces por semana',
  cinco_mas: '5 veces o más',
};

export interface CopyPaso {
  /** La pregunta, en grande. */
  titulo: string;
  /** Por qué se pregunta. Va siempre: una pregunta sin motivo se contesta peor. */
  ayuda?: string;
}

export const PASO_COPY: Record<IdPaso, CopyPaso> = {
  // La puerta del consentimiento tiene su propia pantalla, con su propio texto
  // (`CONSENTIMIENTO_SALUD_TITULO` de abajo); esta entrada existe para que el
  // `Record` esté completo y nadie tenga que acordarse de excluirla.
  consentimiento: { titulo: CONSENTIMIENTO_SALUD_TITULO },
  objetivos: {
    titulo: '¿Qué te gustaría conseguir?',
    ayuda: 'Marca todo lo que encaje contigo. No hay respuestas mejores ni peores.',
  },
  principal: {
    titulo: '¿Y si tuvieras que quedarte con una?',
    ayuda: 'Nos ayuda a saber por dónde empezar contigo.',
  },
  experiencia: {
    titulo: '¿Habías hecho Pilates antes?',
  },
  nivel: {
    titulo: '¿Cómo dirías que estás ahora?',
    ayuda: 'Es tu impresión, no un examen. Puedes cambiarla cuando quieras.',
  },
  cuerpo: {
    titulo: '¿Cómo sientes tu cuerpo?',
    ayuda: 'Piensa en un día normal, no en tu mejor día.',
  },
  molestias: {
    titulo: '¿Hay algo que debamos tener en cuenta?',
    ayuda: 'Alguna molestia, lesión o limitación que convenga que sepamos antes de ponerte a trabajar.',
  },
  zonas: {
    titulo: '¿En qué zona?',
    ayuda: 'Marca las que correspondan.',
  },
  detalle: {
    titulo: '¿Quieres contarnos algo más?',
    ayuda: 'Con una frase basta. Si prefieres contarlo en persona, salta este paso.',
  },
  habitos: {
    titulo: '¿Te mueves fuera de aquí?',
    ayuda: 'Otro deporte, caminar, nadar… lo que sea. Todo esto es opcional.',
  },
  expectativas: {
    titulo: '¿Cómo te gustaría sentirte dentro de unas semanas?',
    ayuda: 'Opcional, pero es lo que más nos dice de ti.',
  },
  resumen: {
    titulo: 'Esto es lo que nos has contado',
    ayuda: 'Repásalo con calma. Puedes cambiar cualquier cosa.',
  },

};

/** El título corto de cada bloque en el resumen y en la ficha del panel. */
export const BLOQUE_TITULO: Partial<Record<IdPaso, string>> = {
  objetivos: 'Objetivos',
  experiencia: 'Experiencia',
  nivel: 'Nivel',
  cuerpo: 'Cómo se siente',
  molestias: 'A tener en cuenta',
  habitos: 'Actividad',
  expectativas: 'Lo que espera',
};

// ── Consentimiento de datos de salud ───────────────────────────────────────
//
// ⚠️ Se pide APARTE del contrato del alta, y ese es el punto entero. Meterlo
// dentro del texto legal que se acepta al registrarse lo convertiría en
// condición para usar el producto — art. 7.4 del RGPD, y el mismo criterio que
// este repo ya aplica al consentimiento de marketing.
//
// Se pide JUSTO ANTES de preguntar por molestias y no en el alta: a quien no
// llegue a esa pantalla no se le pide nada.

export function textoConsentimientoSalud(nombreEstudio: string): string {
  return [
    `Lo siguiente son molestias o lesiones, y eso es información sobre tu salud. La ley la protege de forma especial, así que solo la guardamos si tú nos dices que sí.`,
    `Si aceptas, ${nombreEstudio} podrá ver lo que cuentes aquí para adaptar tus clases. No lo verá nadie más, no se usa para nada que no sea eso, y puedes pedir que se borre cuando quieras.`,
    `Si prefieres que no, no pasa nada: terminas tu valoración igual y te saltas esta parte.`,
  ].join('\n\n');
}
