// ─────────────────────────────────────────────────────────────────────────────
// Las 12 herramientas de LECTURA del asistente, sin su ejecución: nombre,
// descripción, esquema de entrada, permiso y la etiqueta de «Mirando…».
//
// Separadas de su `ejecutar` (que lee la base de datos y vive en ./index.ts)
// para que el prompt, la caché y las guardias se puedan probar con `node --test`
// sin arrastrar Supabase.
//
// Reglas para todas (spec §2):
//   - NINGUNA acepta un estudio, una sede ni nada parecido: el estudio sale de la
//     sesión (`ctx.studioId`). Lo vigila herramientas-acotadas.test.ts.
//   - NUNCA `minimum`/`maximum`/`minLength`/`maxLength`… en un esquema: con `strict: true`
//     Anthropic los rechaza con un 400 (pasó con #2571). Ese límite va en zod, en servidor.
//   - `strict: true`, `additionalProperties: false` y TODAS las propiedades en
//     `required`: lo que sería un «por defecto» es un valor explícito del enum.
//   - El ORDEN de este array es el de la caché (las herramientas van las primeras
//     en el prompt): no se reordena ni se genera en caliente.
//   - El permiso sale de lib/permisos-reglas.ts, nunca a mano; `ejecutar` lo
//     vuelve a comprobar (el `tool_use` lo escribe el modelo).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import type Anthropic from '@anthropic-ai/sdk';
import {
  puedeGestionarCalendario, puedeGestionarClientas, puedeVerFinanzas,
} from '../../permisos-reglas.ts';
import type { Rol } from '../../types.ts';
import type { DefinicionHerramienta, NombreHerramienta } from '../tipos.ts';
import { ROLES_ASISTENTE } from '../roles.ts';
import { zCita, zClase, zEvento as zEventoPublicado, zSala, TIPOS_CITA } from '../acciones/esquemas.ts';
import { puedeEjecutarAccion } from '../acciones/permisos.ts';

const delAsistente = (rol: Rol) => (ROLES_ASISTENTE as readonly Rol[]).includes(rol);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «martes 6 de octubre», sin `new Date('YYYY-MM-DD')` en la zona de nadie. */
export function diaLargo(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS[dow]} ${d} de ${MESES[m - 1]}`;
}

export function sumarDiasYmd(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

const TEXTO_PERIODO = {
  semana: { actual: 'esta semana', anterior: 'la semana pasada' },
  mes: { actual: 'este mes', anterior: 'el mes pasado' },
  trimestre: { actual: 'este trimestre', anterior: 'el trimestre pasado' },
  anio: { actual: 'este año', anterior: 'el año pasado' },
} as const;

type Esquema = Anthropic.Tool['input_schema'];
const objeto = (properties: Record<string, unknown>, opcionales: readonly string[] = []): Esquema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter(k => !opcionales.includes(k)),
  additionalProperties: false,
});
const enumerado = (valores: readonly (string | number)[], description: string) =>
  (typeof valores[0] === 'number' ? { type: 'integer', enum: valores, description } : { type: 'string', enum: valores, description });

const PERIODO = ['semana', 'mes', 'trimestre'] as const;
const PERIODO_CON_ANIO = ['semana', 'mes', 'trimestre', 'anio'] as const;
const CUAL = ['actual', 'anterior'] as const;

const sinEntrada = z.object({}).strict();
const zAgenda = z.object({ dia: z.enum(['hoy', 'manana', 'fecha']), fecha: z.string().max(10) }).strict();
const zHuecos = z.object({ dias: z.union([z.literal(3), z.literal(7), z.literal(14)]), cuales: z.enum(['flojas', 'llenas']) }).strict();
const zFranja = z.object({ periodo: z.enum(PERIODO), cual: z.enum(CUAL), orden: z.enum(['peor', 'mejor']) }).strict();
const zActividad = z.object({ periodo: z.enum(PERIODO), cual: z.enum(CUAL) }).strict();
const zFacturacion = z.object({ periodo: z.enum(PERIODO_CON_ANIO), cual: z.enum(CUAL) }).strict();
const zSinVenir = z.object({ orden: z.enum(['mas_recientes', 'mas_antiguas']) }).strict();
const zPendientes = z.object({ orden: z.enum(['mas_antiguos', 'mayor_importe']) }).strict();
const zBonos = z.object({ dias: z.union([z.literal(7), z.literal(14), z.literal(30)]) }).strict();
const zEvento = z.object({ semanas_historial: z.union([z.literal(4), z.literal(8)]), semanas_vista: z.union([z.literal(2), z.literal(4)]) }).strict();

export type EntradaAgenda = z.infer<typeof zAgenda>;
export type EntradaHuecos = z.infer<typeof zHuecos>;
export type EntradaFranja = z.infer<typeof zFranja>;
export type EntradaActividad = z.infer<typeof zActividad>;
export type EntradaFacturacion = z.infer<typeof zFacturacion>;
export type EntradaSinVenir = z.infer<typeof zSinVenir>;
export type EntradaPendientes = z.infer<typeof zPendientes>;
export type EntradaBonos = z.infer<typeof zBonos>;
export type EntradaEvento = z.infer<typeof zEvento>;

/** El día que pide la agenda ('YYYY-MM-DD'), o null si la fecha no vale. */
export function diaDeLaAgenda(input: EntradaAgenda, hoy: string): string | null {
  if (input.dia === 'hoy') return hoy;
  if (input.dia === 'manana') return sumarDiasYmd(hoy, 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) return null;
  const [y, m, d] = input.fecha.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return input.fecha;
}

// Cada una con su entrada tipada; el registro las guarda como `unknown` porque
// la entrada llega del modelo y se valida con su `zod` antes de usarla.
function def<I>(d: DefinicionHerramienta<I>): DefinicionHerramienta<unknown> {
  return d as unknown as DefinicionHerramienta<unknown>;
}

export const DEFINICIONES: readonly DefinicionHerramienta<unknown>[] = [
  def({
    nombre: 'resumen_del_estudio',
    clase: 'lectura',
    descripcion: 'Resumen general del estudio ahora mismo: alumnas activas y de prueba, cuántas llevan más de 30 días sin venir, las clases de hoy (cuántas, alumnas apuntadas, huecos libres) y lo que espera una decisión. Si quien pregunta puede ver el dinero, añade lo cobrado en lo que va de mes frente al mismo tramo del mes anterior y lo pendiente de cobro. Úsala para «hazme un resumen», «¿cómo va el estudio?» o como primera mirada cuando la pregunta es general.',
    esquema: objeto({}),
    zod: sinEntrada,
    permitida: rol => delAsistente(rol) && puedeGestionarClientas(rol) && puedeGestionarCalendario(rol),
    etiqueta: () => 'Repasando el estudio…',
  }),
  def({
    nombre: 'que_revisar_hoy',
    clase: 'lectura',
    descripcion: 'Lo que espera el visto bueno de quien pregunta (sustituciones por decidir, reservas por aprobar, cobros fallidos, renovaciones que nadie cobrará solas, bajas por revisar, series por renovar…) y lo que Tentare tiene en marcha, con cuántas hay de cada cosa. Es la misma bandeja que la home del panel. Si la propietaria tiene el Centro de Control, incluye además el mensaje del día. Úsala para «¿qué debería revisar hoy?», «¿tengo algo pendiente?» o «¿qué hay por decidir?».',
    esquema: objeto({}),
    zod: sinEntrada,
    permitida: rol => delAsistente(rol),
    etiqueta: () => 'Mirando qué espera tu visto bueno…',
  }),
  def({
    nombre: 'contar_alumnas',
    clase: 'lectura',
    descripcion: 'Cuántas alumnas hay en cada estado (activa, de prueba, sin renovar, pausada, inactiva, de baja, interesada), con la definición de cada estado. Son las mismas cifras que el chip de Clientas y que «Clientas activas» del Resumen. Úsala para «¿cuántas alumnas activas tengo?», «¿cuántas están de prueba?» o «¿cuántas se me han ido?».',
    esquema: objeto({}),
    zod: sinEntrada,
    permitida: rol => delAsistente(rol) && puedeGestionarClientas(rol),
    etiqueta: () => 'Contando tus alumnas…',
  }),
  def({
    nombre: 'alumnas_sin_venir',
    clase: 'lectura',
    descripcion: 'Las alumnas que llevan más de 30 días sin venir a clase (desde su última clase, o desde su alta si nunca han venido; las interesadas no cuentan). Es la misma lista que «Sin venir 30d» del Resumen. Devuelve el total y hasta 20, con los días que llevan sin venir y su estado. Úsala para «¿quién lleva más de un mes sin venir?» o «¿a quién debería escribir?».',
    esquema: objeto({ orden: enumerado(['mas_recientes', 'mas_antiguas'], 'mas_recientes: primero las que dejaron de venir hace menos (más fáciles de recuperar); mas_antiguas: primero las que llevan más tiempo.') }),
    zod: zSinVenir,
    permitida: rol => delAsistente(rol) && puedeGestionarClientas(rol),
    etiqueta: () => 'Buscando quién lleva tiempo sin venir…',
  }),
  def({
    nombre: 'agenda_del_dia',
    clase: 'lectura',
    descripcion: 'Las clases de un día con su ocupación: hora, tipo de clase, sala, instructora, plazas ocupadas sobre el aforo, lista de espera y si piden atención (sin instructora, huecos con gente esperando, falta pasar lista…). Incluye un resumen del día. Solo hasta 60 días antes o después de hoy. Úsala para «¿qué clases hay mañana?», «¿cómo va hoy?» o «¿qué tengo el jueves?».',
    esquema: objeto({
      dia: enumerado(['hoy', 'manana', 'fecha'], 'hoy, mañana, o fecha para un día concreto (entonces rellena fecha).'),
      fecha: { type: 'string', description: "El día en formato AAAA-MM-DD si dia es 'fecha'; cadena vacía si no." },
    }),
    zod: zAgenda,
    permitida: rol => delAsistente(rol) && puedeGestionarCalendario(rol),
    etiqueta: (input, hoy) => {
      const dia = diaDeLaAgenda(input, hoy);
      return dia ? `Mirando la agenda del ${diaLargo(dia)}…` : 'Mirando la agenda…';
    },
  }),
  def({
    nombre: 'clases_proximas_con_huecos',
    clase: 'lectura',
    descripcion: 'Las clases de los próximos días que van flojas (con la mitad del aforo o más libre) o que van llenas (sin sitio o con lista de espera), con su ocupación. Hasta 20 clases, de la más próxima a la más lejana. Úsala para «¿qué clases van flojas esta semana?», «¿dónde tengo sitio?» o «¿qué clases se llenan?».',
    esquema: objeto({
      dias: enumerado([3, 7, 14], 'Cuántos días mirar desde hoy.'),
      cuales: enumerado(['flojas', 'llenas'], 'flojas: con la mitad del aforo o más libre; llenas: sin huecos o con lista de espera.'),
    }),
    zod: zHuecos,
    permitida: rol => delAsistente(rol) && puedeGestionarCalendario(rol),
    etiqueta: (input) => `Mirando las clases de los próximos ${input.dias} días…`,
  }),
  def({
    nombre: 'ocupacion_por_franja',
    clase: 'lectura',
    descripcion: 'La ocupación de cada franja recurrente (día de la semana + hora + tipo de clase) en un periodo ya transcurrido, ordenada de peor a mejor o al revés, y la ocupación global. Solo franjas con 2 clases o más. Es la misma cifra que Informes › Clases. Úsala para «¿qué franja va peor este mes?», «¿qué horario funciona mejor?» o «¿qué clase debería quitar?».',
    esquema: objeto({
      periodo: enumerado(PERIODO, 'El periodo.'),
      cual: enumerado(CUAL, 'actual: el periodo en curso, hasta hoy; anterior: el periodo anterior entero.'),
      orden: enumerado(['peor', 'mejor'], 'peor: primero las de menos ocupación; mejor: primero las de más.'),
    }),
    zod: zFranja,
    permitida: rol => delAsistente(rol) && puedeGestionarCalendario(rol),
    etiqueta: (input) => `Comparando las franjas de ${TEXTO_PERIODO[input.periodo][input.cual]}…`,
  }),
  def({
    nombre: 'actividad_del_periodo',
    clase: 'lectura',
    descripcion: 'La actividad de un periodo: clases dadas, ocupación, cuántas alumnas distintas vinieron y las 5 que más vinieron, comparado con el mismo tramo del periodo anterior. Es la misma cifra que Informes. Úsala para «¿cómo ha ido la semana?», «¿viene más gente que el mes pasado?» o «¿quién viene más?».',
    esquema: objeto({
      periodo: enumerado(PERIODO, 'El periodo.'),
      cual: enumerado(CUAL, 'actual: el periodo en curso, hasta hoy; anterior: el periodo anterior entero.'),
    }),
    zod: zActividad,
    permitida: rol => delAsistente(rol) && puedeGestionarCalendario(rol),
    etiqueta: (input) => `Mirando la actividad de ${TEXTO_PERIODO[input.periodo][input.cual]}…`,
  }),
  def({
    nombre: 'facturacion_del_periodo',
    clase: 'lectura',
    descripcion: 'Lo cobrado en un periodo (bruto con IVA, antes de comisiones, neto de devoluciones, por la fecha de cobro), el número de cobros, el desglose por motivo (cuotas, bonos, clases sueltas, sesiones privadas, caja, otros), cuántas clientas pagaron y el ingreso medio por clienta, comparado con el mismo tramo del periodo anterior. Es la misma cifra que «Lo que he cobrado» y que Informes › Dinero. Úsala para «¿cuánto he facturado este mes?» o «¿cuánto cobré el trimestre pasado?».',
    esquema: objeto({
      periodo: enumerado(PERIODO_CON_ANIO, 'El periodo (anio = año natural).'),
      cual: enumerado(CUAL, 'actual: el periodo en curso, hasta hoy; anterior: el periodo anterior entero.'),
    }),
    zod: zFacturacion,
    permitida: rol => delAsistente(rol) && puedeVerFinanzas(rol),
    etiqueta: (input) => `Sumando lo cobrado ${TEXTO_PERIODO[input.periodo][input.cual]}…`,
  }),
  def({
    nombre: 'pagos_pendientes',
    clase: 'lectura',
    descripcion: 'Lo que está sin cobrar: lo que se debe (por cobrar más impagado), aparte lo que está en el banco sin confirmar, cuántas clientas deben algo y hasta 20 recibos con su importe, su situación y su vencimiento. Es la misma lista que «Sin cobrar» de Cobros. Úsala para «¿qué pagos tengo pendientes?» o «¿quién me debe dinero?».',
    esquema: objeto({ orden: enumerado(['mas_antiguos', 'mayor_importe'], 'mas_antiguos: primero los que vencieron antes; mayor_importe: primero los más grandes.') }),
    zod: zPendientes,
    permitida: rol => delAsistente(rol) && puedeVerFinanzas(rol),
    etiqueta: () => 'Mirando los pagos pendientes…',
  }),
  def({
    nombre: 'bonos_por_caducar',
    clase: 'lectura',
    descripcion: 'Los bonos activos con sesiones sin gastar que caducan en los próximos días: de quién son, de qué plan, cuántas sesiones les quedan y cuándo caducan. Hasta 20, el que antes caduca primero. Úsala para «¿qué bonos caducan esta semana?» o «¿a quién se le va a perder el bono?».',
    esquema: objeto({ dias: enumerado([7, 14, 30], 'Cuántos días mirar desde hoy.') }),
    zod: zBonos,
    permitida: rol => delAsistente(rol) && puedeGestionarClientas(rol),
    etiqueta: (input) => `Mirando los bonos que caducan en ${input.dias} días…`,
  }),
  def({
    nombre: 'datos_para_un_evento',
    clase: 'lectura',
    descripcion: 'Datos para elegir cuándo hacer algo especial (un taller, una masterclass, una clase nueva): las franjas con más demanda en las últimas semanas (ocupación del 85 % o más, o con lista de espera), las más flojas, y los días de la semana con menos clases programadas en las próximas semanas dentro del horario de apertura. Úsala para «quiero hacer un taller: ¿qué día me conviene?» o «¿dónde abro otra clase?».',
    esquema: objeto({
      semanas_historial: enumerado([4, 8], 'Cuántas semanas hacia atrás mirar la demanda.'),
      semanas_vista: enumerado([2, 4], 'Cuántas semanas hacia delante mirar lo programado.'),
    }),
    zod: zEvento,
    permitida: rol => delAsistente(rol) && puedeGestionarCalendario(rol),
    etiqueta: () => 'Buscando el mejor hueco…',
  }),
  // Fase 2: PROPONEN. Ninguna escribe nada: guardan la propuesta y la persona la confirma con un botón.
  def({
    nombre: 'proponer_clase',
    clase: 'accion',
    descripcion: 'Prepara (no crea) UNA clase suelta para que la propietaria la confirme. Nombres de tipo de clase y sala tal como los dice ella; instructora con su marca [EQUIPO_n] o "" si no dice ninguna; aforo solo si lo dice (si no, omítelo). Si falta tipo, sala, fecha u hora: pregunta, no llames. Errores: dilos y pregunta lo que falte.',
    esquema: objeto({
      tipo_clase: { type: 'string', description: 'Nombre del tipo de clase.' },
      fecha: { type: 'string', description: 'AAAA-MM-DD.' },
      hora: { type: 'string', description: 'HH:MM, hora de Madrid.' },
      sala: { type: 'string', description: 'Nombre de la sala.' },
      instructora: { type: 'string', description: '[EQUIPO_n] o "".' },
      aforo: { type: 'integer', description: 'Plazas (al menos 1); omítelo si no lo dice.' },
    }, ['aforo']),
    zod: zClase,
    permitida: rol => puedeEjecutarAccion(rol, 'CREAR_CLASE'),
    etiqueta: () => 'Preparando la clase…',
  }),
  def({
    nombre: 'proponer_sala',
    clase: 'accion',
    descripcion: 'Prepara (no crea) una sala nueva para que la propietaria la confirme.',
    esquema: objeto({ nombre: { type: 'string', description: 'No vacío.' }, capacidad: { type: 'integer', description: 'Plazas (al menos 1) que dice la persona; si no las dijo, pregunta (no pongas 0).' } }),
    zod: zSala,
    permitida: rol => puedeEjecutarAccion(rol, 'CREAR_SALA'),
    etiqueta: () => 'Preparando la sala…',
  }),
  def({
    nombre: 'proponer_evento',
    clase: 'accion',
    descripcion: 'Prepara (no publica) un evento o taller para la Comunidad de la app (avisa a las alumnas al confirmar). texto = el anuncio, sin nombres de alumnas; aforo y lugar solo si los dice (si no, omítelos).',
    esquema: objeto({
      texto: { type: 'string', description: 'El anuncio.' },
      fecha: { type: 'string', description: 'AAAA-MM-DD.' },
      hora: { type: 'string', description: 'HH:MM, hora de Madrid.' },
      aforo: { type: 'integer', description: 'Plazas (al menos 1); omítelo si no hay límite.' },
      lugar: { type: 'string' },
    }, ['aforo', 'lugar']),
    zod: zEventoPublicado,
    permitida: rol => puedeEjecutarAccion(rol, 'CREAR_EVENTO'),
    etiqueta: () => 'Preparando el evento…',
  }),
  def({
    nombre: 'proponer_cita',
    clase: 'accion',
    descripcion: 'Prepara (no crea) una cita 1:1, sin precio ni cobro, para que la propietaria la confirme. alumna e instructora con su marca exacta ([ALUMNA_n], [EQUIPO_n]); duracion_min solo si la dice (si no, omítela: 60).',
    esquema: objeto({
      alumna: { type: 'string', description: '[ALUMNA_n].' },
      instructora: { type: 'string', description: '[EQUIPO_n].' },
      fecha: { type: 'string', description: 'AAAA-MM-DD.' },
      hora: { type: 'string', description: 'HH:MM, hora de Madrid.' },
      duracion_min: { type: 'integer', description: 'Minutos (al menos 1); omítela si no la dice.' },
      tipo: enumerado(Object.keys(TIPOS_CITA), 'Tipo de cita.'),
    }, ['duracion_min']),
    zod: zCita,
    permitida: rol => puedeEjecutarAccion(rol, 'CREAR_CITA'),
    etiqueta: () => 'Preparando la cita…',
  }),
];

export function definicionDe(nombre: string): DefinicionHerramienta<unknown> | undefined {
  return DEFINICIONES.find(d => d.nombre === nombre);
}

/** Las que este rol puede EJECUTAR, en el orden fijo del registro (la puerta es
 *  `ejecutarHerramienta`, que lo vuelve a mirar con `permitida`). */
export function herramientasDelRol(rol: Rol): DefinicionHerramienta<unknown>[] {
  return DEFINICIONES.filter(d => d.permitida(rol));
}

/** Para Anthropic. Serialización estable: mismas claves, mismo orden, cada vez. */
export function aHerramientasAnthropic(defs: readonly DefinicionHerramienta<unknown>[]): Anthropic.Tool[] {
  return defs.map(d => ({ name: d.nombre, description: d.descripcion, input_schema: d.esquema, strict: true }));
}

/**
 * Lo que se le ENSEÑA al modelo, el MISMO juego para la propietaria y para la
 * gerente: las doce, en el orden fijo, serializadas una sola vez.
 *
 * Por qué no `herramientasDelRol(rol)`: las herramientas van las PRIMERAS en el
 * prompt, así que dos juegos son dos prefijos de caché distintos (~5.000
 * tokens cada uno, que se escriben por separado y caducan por separado). Con
 * uno solo, la pregunta de una gerente lee de caché lo que escribió la
 * propietaria de cualquier estudio, y al revés. La gerente sigue SIN dinero:
 * `ejecutarHerramienta` mira `permitida(rol)` antes de ejecutar (NO_PERMITIDA,
 * sin leer nada) y las dos de dinero lo vuelven a mirar dentro; el contexto del
 * día le dice al modelo que con ella no las use. Lo peor que pasa si las pide
 * es una vuelta más, barata, que acaba en «eso lo ve la propietaria».
 */
export const HERRAMIENTAS_DEL_ASISTENTE: readonly Anthropic.Tool[] = aHerramientasAnthropic(
  DEFINICIONES.filter(d => ROLES_ASISTENTE.some(r => d.permitida(r))),
);

export const NOMBRES_DEFINIDOS: readonly NombreHerramienta[] = DEFINICIONES.map(d => d.nombre);
