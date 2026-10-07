// ─────────────────────────────────────────────────────────────────────────────
// El asistente rápido de bienvenida: TRES pantallas en vez de once preguntas.
//
// Qué cambió y por qué (7-oct-2026, tras ver que 5 de 7 altas externas se
// quedaban con CERO alumnas cargadas): las once preguntas ponían entre la
// propietaria y SU estudio funcionando un cuestionario. Ahora todo lo que
// cambia lo que se le enseña viaja en dos pantallas con los valores más
// comunes ya marcados, y lo opcional (cobro, prioridad, ayuda) en una tercera
// que se salta con un toque. Nada se pierde: cada respuesta sigue siendo la
// misma clave de `RespuestasWizard` y `interpretarRespuestasWizard` /
// `planificarConfiguracion` no se tocan.
//
// Puro y sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────
import type { RespuestasWizard } from './borrador-wizard.ts';
import { OPCIONES_AYUDA } from '../llamada/solicitud.ts';

export type PantallaId = 'estudio' | 'espacio' | 'cierre';
export const PANTALLAS: readonly { id: PantallaId; etiqueta: string }[] = [
  { id: 'estudio', etiqueta: 'Tu estudio' },
  { id: 'espacio', etiqueta: 'Tus clases' },
  { id: 'cierre', etiqueta: 'Antes de entrar' },
];

// ⚠️ Solo plataformas de GESTIÓN de estudio: con qué lleva HOY su agenda, sus
// alumnas y sus cobros (misma lista y mismo motivo que tenía el asistente
// anterior; sale de los competidores de /comparativa más las dos respuestas
// honestas que no son un producto: la hoja de cálculo y no usar nada).
export const SIN_SOFTWARE = 'Todavía ninguno';
export const OTRO_SOFTWARE = 'Otro';
export const OPCIONES_SOFTWARE = [
  SIN_SOFTWARE, 'Bsport', 'TIMP', 'Eversports', 'Momence', 'Mindbody', 'Glofox', 'Bonsai', 'Lorari',
  'Excel o Google Sheets', OTRO_SOFTWARE,
] as const;
export const OPCIONES_CENTROS = ['1 estudio', '2-3 estudios', '4-10 estudios', 'Más de 10'] as const;
export const OPCIONES_ALUMNOS = ['Menos de 50', '50-150', '150-300', '300-600', 'Más de 600'] as const;
export const OPCIONES_FOCO = [
  'Conseguir más alumnas', 'Gestionar reservas', 'Cobros', 'Sustituciones de instructoras',
  'Automatizar tareas', 'Marketing', 'Otro',
] as const;

/** ¿Hay datos que traer de otro sitio? Ni «ninguno» ni «otro» son migrables. */
export function vieneDeOtraPlataforma(software: string | undefined): boolean {
  return !!software && software !== SIN_SOFTWARE && software !== OTRO_SOFTWARE;
}

/**
 * Lo más común en un estudio de Pilates, ya marcado: se ve, se puede cambiar
 * con un toque y evita contestar para llegar a lo que ya es verdad en casi
 * todos. NO se marca el horario ni «das clases tú»: el primero pisaría la
 * franja del calendario sin que lo haya decidido, y el segundo crea una ficha de
 * instructora a su nombre.
 */
export const POR_DEFECTO: Pick<RespuestasWizard, 'salas' | 'aforos' | 'duracion' | 'clases'> = {
  salas: '1 sala',
  aforos: ['8 plazas'],
  duracion: '55 minutos',
  clases: ['Reformer', 'Mat'],
};

/** Tope de preguntas de aforo (una por sala). Con «4 o más» se pregunta por tres y el resto hereda la última. */
export const MAX_AFOROS = 3;

export function numSalasDe(ans: Pick<RespuestasWizard, 'salas'>): number {
  const m = ans.salas?.trim().match(/^(\d+)/);
  const n = m ? Number(m[1]) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.trunc(n), MAX_AFOROS) : 1;
}

/** Rellena SOLO lo que falta con el valor por defecto; lo contestado no se toca. */
export function conDefectos(ans: RespuestasWizard): RespuestasWizard {
  return {
    ...ans,
    salas: ans.salas ?? POR_DEFECTO.salas,
    aforos: ans.aforos ?? [...(POR_DEFECTO.aforos ?? [])],
    duracion: ans.duracion ?? POR_DEFECTO.duracion,
    clases: ans.clases ?? [...(POR_DEFECTO.clases ?? [])],
  };
}

/**
 * Un aforo por sala (hasta `MAX_AFOROS`). Al subir de 1 a 3 salas, las nuevas
 * heredan el de la primera —se ve marcado y se cambia con un toque—; al bajar,
 * sobran los últimos. Sin esto, el aforo de la sala 2 desaparecía al cambiar
 * el número de salas, o quedaba huérfano.
 */
export function alinearAforos(ans: RespuestasWizard): RespuestasWizard {
  const n = numSalasDe(ans);
  const actual = ans.aforos ?? [];
  const base = actual.find(Boolean) ?? POR_DEFECTO.aforos?.[0] ?? '';
  const aforos = Array.from({ length: n }, (_, i) => actual[i] || base);
  return { ...ans, aforos };
}

/** Una etiqueta de ayuda que ya no existe (un borrador de la versión anterior) se descarta. */
export function ayudaVigente(ayuda: string | undefined): string | undefined {
  return (OPCIONES_AYUDA as readonly string[]).includes(ayuda ?? '') ? ayuda : undefined;
}

/** Un borrador viejo trae «Quiero una videollamada»: ya no es una opción, así que no se arrastra. */
export function sanearBorrador(ans: RespuestasWizard): RespuestasWizard {
  const limpia = { ...ans, ayuda: ayudaVigente(ans.ayuda) };
  return alinearAforos(conDefectos(limpia));
}

/**
 * Lo que se guarda en `studios.onb_*` al terminar. Una respuesta sin contestar
 * es `null`, no un valor inventado.
 */
export function camposOnb(ans: RespuestasWizard) {
  return {
    onbCentros: ans.centros ?? null,
    onbSoftwareAnterior: ans.software ?? null,
    onbAlumnosActivos: ans.alumnos ?? null,
    onbImportarDatos: ans.importar ?? null,
    onbPrioridad: ans.foco && ans.foco.length > 0 ? ans.foco : null,
    onbAyudaAlta: ans.ayuda ?? null,
  };
}
