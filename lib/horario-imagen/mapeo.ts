// P2.1 — el horario desde una captura o un texto (diseño en investigacion-bonsai
// 18, versión recortada). Lo que el modelo LEE se convierte aquí en las filas
// de siempre del importador de horario (`/api/clases/import`, `FilaClase`): el
// importador ya empareja tipos, salas e instructoras, no duplica, aparta los
// solapes y registra cada serie. Esto solo traduce y comprueba.
//
// ⚠️ El modelo NUNCA pone fechas. La primera semana la decide el servidor:
// el lunes siguiente a hoy (día de Madrid), así que nada cae en el pasado por
// construcción, y el importador además rechaza una fecha anterior a hoy para
// este origen.
//
// Puro, sin `@/`: lo prueba el runner de Node.

import { z } from 'zod';
import { parsearHora, type FilaClase } from '../csv.ts';
import { masDias } from '../utils.ts';
import { emparejarPorNombreDePila, esNombreDeInstructora } from '../migracion/instructoras.ts';

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;
export type DiaLeido = (typeof DIAS)[number];

/** Lunes = 1 … domingo = 0, como `diaSemana` del importador (DOW de Postgres). */
const DOW: Record<DiaLeido, number> = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };

/**
 * Lo que devuelve el modelo, validado. Sin mínimos ni máximos en el esquema
 * (con salida estricta dan un 400): los límites se comprueban aquí.
 */
export const ClaseLeidaSchema = z.object({
  dia: z.enum(DIAS),
  inicio: z.string(),
  fin: z.string().nullable(),
  clase: z.string(),
  instructora: z.string().nullable(),
  sala: z.string().nullable(),
  aforo: z.number().nullable(),
  /** «baja» si el modelo no lo ha leído seguro: se pinta en ámbar. */
  seguridad: z.enum(['alta', 'baja']),
});
export const LecturaHorarioSchema = z.object({
  resultado: z.enum(['HORARIO', 'NO_ES_HORARIO', 'ILEGIBLE']),
  clases: z.array(ClaseLeidaSchema),
  avisos: z.array(z.string()),
});
export type ClaseLeida = z.infer<typeof ClaseLeidaSchema>;
export type LecturaHorario = z.infer<typeof LecturaHorarioSchema>;

/** Una fila de la tabla que revisa la propietaria antes de crear nada. */
export interface FilaRevisable {
  dia: DiaLeido;
  inicio: string; // 'HH:MM'
  fin: string | null; // 'HH:MM'
  clase: string;
  instructora: string | null;
  sala: string | null;
  aforo: number | null;
  dudosa: boolean;
}

/** Más que esto en una semana no es el horario de un estudio. */
export const MAX_CLASES_LEIDAS = 120;
const MAX_TEXTO = 80;

const limpiar = (s: string | null | undefined, max = MAX_TEXTO): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
};

const HHMM = /^\d{2}:\d{2}$/;

/**
 * Lo leído, a filas que se pueden revisar. Se descarta (con su motivo) lo que no
 * se puede crear: sin nombre de clase, una hora que no se entiende o un final
 * que no va después del inicio (una clase que cruza la medianoche, también). Un
 * aforo raro se deja vacío (manda el de la sala, o 10 sin sala). Una hora que el
 * modelo no ha dado en «HH:MM» (p. ej. «7:00pm») se traduce, pero la fila sale
 * DUDOSA: que alguien la mire.
 */
export function filasRevisables(lectura: LecturaHorario): { filas: FilaRevisable[]; descartadas: number } {
  if (lectura.resultado !== 'HORARIO') return { filas: [], descartadas: 0 };
  const filas: FilaRevisable[] = [];
  let descartadas = 0;
  for (const c of lectura.clases.slice(0, MAX_CLASES_LEIDAS)) {
    const clase = limpiar(c.clase);
    const inicio = parsearHora(c.inicio);
    const fin = c.fin ? parsearHora(c.fin) : null;
    if (!clase || !inicio || (c.fin && !fin) || (fin && fin <= inicio)) { descartadas++; continue; }
    const aforo = typeof c.aforo === 'number' && Number.isInteger(c.aforo) && c.aforo >= 1 && c.aforo <= 200 ? c.aforo : null;
    filas.push({
      dia: c.dia, inicio, fin, clase,
      instructora: limpiar(c.instructora), sala: limpiar(c.sala), aforo,
      dudosa: c.seguridad === 'baja' || !HHMM.test(c.inicio.trim()) || (!!c.fin && !HHMM.test(c.fin.trim())),
    });
  }
  descartadas += Math.max(0, lectura.clases.length - MAX_CLASES_LEIDAS);
  filas.sort((a, b) => ((DOW[a.dia] + 6) % 7) - ((DOW[b.dia] + 6) % 7) || a.inicio.localeCompare(b.inicio));
  return { filas, descartadas };
}

/** Lo que una fila revisada tiene que cumplir para crearse (la tabla es editable). */
export function filaValida(f: FilaRevisable): boolean {
  return problemasDeFila(f).length === 0;
}

export type CampoConProblema = 'clase' | 'inicio' | 'fin' | 'aforo' | 'dia';

/** Qué campos de una fila editada no valen (para marcarlos uno a uno en la tabla). */
export function problemasDeFila(f: FilaRevisable): CampoConProblema[] {
  const out: CampoConProblema[] = [];
  const inicio = parsearHora(f.inicio);
  const fin = f.fin ? parsearHora(f.fin) : null;
  if (!DIAS.includes(f.dia)) out.push('dia');
  if (!limpiar(f.clase)) out.push('clase');
  if (!inicio) out.push('inicio');
  if (f.fin && (!fin || (inicio && fin <= inicio))) out.push('fin');
  if (f.aforo != null && !(Number.isInteger(f.aforo) && f.aforo >= 1 && f.aforo <= 200)) out.push('aforo');
  return out;
}

const normClave = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Las filas que se van a crear: las válidas, sin repetir la misma clase el mismo día a la misma hora. */
export function filasQueSeCrean(filas: FilaRevisable[]): FilaRevisable[] {
  const vistas = new Set<string>();
  return filas.filter((f) => {
    if (!filaValida(f)) return false;
    const clave = `${f.dia}|${parsearHora(f.inicio)}|${normClave(f.clase)}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/**
 * Las filas revisadas, en el formato del importador: una clase SEMANAL por fila
 * (sin fecha). Sin duplicados: el importador solo los ve contra lo que ya hay en
 * la base de datos, y sin sala ni instructora una fila repetida crearía la misma
 * clase dos veces.
 */
export function filasParaImportar(filas: FilaRevisable[]): FilaClase[] {
  return filasQueSeCrean(filas).map((f) => ({
    clase: limpiar(f.clase)!,
    fecha: null,
    diaSemana: DOW[f.dia],
    horaInicio: parsearHora(f.inicio)!,
    horaFin: f.fin ? parsearHora(f.fin) : null,
    duracion: null,
    instructor: limpiar(f.instructora),
    sala: limpiar(f.sala),
    aforo: f.aforo,
  }));
}

/**
 * El lunes estrictamente posterior a `hoy` (día del ESTUDIO, 'YYYY-MM-DD'). Un
 * lunes, el siguiente: la semana en curso ya ha empezado y crear su lunes sería
 * crear en el pasado o con la clase a punto de empezar.
 */
export function proximoLunes(hoy: string): string {
  const [y, m, d] = hoy.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  const hasta = ((8 - dow) % 7) || 7;
  return masDias(hoy, hasta);
}

// ── Límites de la lectura (los aplica `/api/horario/leer`) ──────────────────

/** Una captura ya reducida en el navegador pesa mucho menos: 3 MB es de sobra. */
export const MAX_BYTES_IMAGEN = 3 * 1024 * 1024;
export const MAX_CARACTERES_TEXTO = 4000;
/** Lecturas por estudio y día (día de Madrid). Se usa en el alta y en los cambios de temporada. */
export const TOPE_LECTURAS_ESTUDIO_DIA = 10;
/** Y por CUENTA: crear estudios es libre, y sin esto una sola cuenta con 15 estudios agotaría el total. */
export const TOPE_LECTURAS_CUENTA_DIA = 10;
/** Y en total, por si algo se desmanda: el gasto de IA tiene techo. */
export const TOPE_LECTURAS_TOTAL_DIA = 150;

/** Un aviso del modelo nunca lleva enlaces ni números largos (un teléfono): lo que el texto le haga decir no sale. */
export function avisosLimpios(avisos: string[]): string[] {
  return avisos
    .filter((a) => !/https?:|www\.|\d{6,}/i.test(a))
    .slice(0, 5)
    .map((a) => a.slice(0, 200));
}

const normNombre = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/**
 * ¿Al crear se daría de ALTA esta instructora? Con la misma regla que el
 * importador (`/api/clases/import`): igual al nombre de alguien del equipo, o el
 * nombre de pila de UNA sola persona, no es nueva; «-» o «Sin asignar» no crea
 * nada. Lo usa la tabla para avisar: si la captura traía el nombre de una
 * alumna, se ve antes de crear y se borra.
 */
export function instructoraNueva(nombre: string | null, equipo: readonly string[]): boolean {
  if (!nombre || !esNombreDeInstructora(nombre)) return false;
  const n = normNombre(nombre);
  const existentes = new Map(equipo.map((e, i) => [normNombre(e), String(i)]));
  if (existentes.has(n)) return false;
  return emparejarPorNombreDePila(n, existentes) === null;
}

