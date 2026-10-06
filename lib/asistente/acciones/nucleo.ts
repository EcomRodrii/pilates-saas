// ─────────────────────────────────────────────────────────────────────────────
// Acciones del asistente (Fase 2): lo PURO. Valida lo que propone el modelo,
// lo resuelve contra el catálogo del estudio y devuelve la propuesta (o por qué
// no se puede). No toca la base de datos ni escribe nada: los datos entran ya
// leídos, y las referencias (`EQUIPO_2`) se resuelven con funciones inyectadas.
//
// Los conflictos (sala ocupada, instructora ocupada o ausente, cierre del
// centro, fecha pasada, aforo mayor que la sala) se DICEN aquí, al proponer, y
// se vuelven a comprobar al confirmar con los mismos datos frescos.
//
// Solo imports relativos con extensión: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { detectarConflictos, type SlotSesion } from '../../calendar-logic.ts';
import { diaSemanaLocal, esHoraHHMM } from '../../citas/slots.ts';
import { cierreDeFecha, avisoHorario, type HorarioDelEstudio } from '../../calendario/nueva-clase.ts';
import type { CierreGuardado } from '../../cierres/quitar-cierre.ts';
import { fechaEnZona } from '../../student/agenda-instructora.ts';
import { horaEstudio, instanteEnEstudio, masDias } from '../../utils.ts';
import { diaLargo } from '../herramientas/definiciones.ts';

export const TIPOS_ACCION = ['CREAR_CLASE', 'CREAR_SALA', 'CREAR_EVENTO', 'CREAR_CITA'] as const;
export type TipoAccion = typeof TIPOS_ACCION[number];

export const MINUTOS_CADUCIDAD = 15;
/** Una clase, evento o cita se programa como mucho con este margen. */
export const MAX_DIAS_ANTELACION = 180;

export { zClase, zSala, zEvento, zCita, TIPOS_CITA, MAX_CAPACIDAD } from './esquemas.ts';
export type { EntradaClase, EntradaSala, EntradaEvento, EntradaCita } from './esquemas.ts';
import { TIPOS_CITA, type EntradaCita, type EntradaClase, type EntradaEvento, type EntradaSala } from './esquemas.ts';

// ── Lo que se guarda y se ejecuta ──
export interface PayloadClase { tipoClaseId: string; salaId: string; instructorId: string | null; inicio: string; fin: string; aforo: number }
export interface PayloadSala { nombre: string; capacidad: number; color: string }
export interface PayloadEvento { texto: string; inicio: string; aforo: number | null; lugar: string | null }
export interface PayloadCita { socioId: string; instructorId: string; tipo: string; inicio: string; fin: string }
export type Payload = PayloadClase | PayloadSala | PayloadEvento | PayloadCita;

/** Lo que enseña la tarjeta: etiqueta y valor (el valor puede llevar marcas `[ALUMNA_3]`, que el panel pinta con el nombre). */
export interface LineaPropuesta { etiqueta: string; valor: string }

export interface PropuestaPreparada<P extends Payload = Payload> {
  ok: true;
  tipo: TipoAccion;
  payload: P;
  titulo: string;
  lineas: LineaPropuesta[];
  /** Avisos que no impiden (fuera de horario…). */
  avisos: string[];
  /** Lo que pasa fuera de la propuesta (un aviso a las alumnas). */
  efecto: string | null;
  /** Frase compacta con las cifras, para el modelo (el filtro de cifras las respalda). */
  resumen: string;
  destino: { href: string; texto: string };
}
export interface PropuestaImposible { ok: false; error: string }
export type Preparada<P extends Payload = Payload> = PropuestaPreparada<P> | PropuestaImposible;

const no = (error: string): PropuestaImposible => ({ ok: false, error });

// ── Nombres ──
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** El elemento que nombra el texto: exacto, o el único que lo contiene. `null` = ninguno; `'ambiguo'` = varios. */
export function resolverPorNombre<T extends { nombre: string }>(lista: readonly T[], pedido: string): T | null | 'ambiguo' {
  const q = normalizar(pedido);
  if (!q) return null;
  const exactos = lista.filter(x => normalizar(x.nombre) === q);
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) return 'ambiguo';
  const parecidos = lista.filter(x => normalizar(x.nombre).includes(q) || q.includes(normalizar(x.nombre)));
  return parecidos.length === 1 ? parecidos[0] : parecidos.length > 1 ? 'ambiguo' : null;
}

const listaDe = (nombres: readonly string[]) => nombres.slice(0, 12).join(', ');

function elegir<T extends { nombre: string }>(lista: readonly T[], pedido: string, que: string, plural: string): T | PropuestaImposible {
  const r = resolverPorNombre(lista, pedido);
  if (r && r !== 'ambiguo') return r;
  if (lista.length === 0) return no(`El estudio no tiene ${plural} todavía. Se crean en Configuración.`);
  return no(r === 'ambiguo'
    ? `«${pedido}» encaja con varias ${plural}. Pregunta cuál: ${listaDe(lista.map(x => x.nombre))}.`
    : `No hay ${que} que se llame «${pedido}». Las que hay: ${listaDe(lista.map(x => x.nombre))}. Pregunta cuál, no la inventes.`);
}

// ── Fechas ──
export const textoHora = (inicioIso: string, finIso?: string) => (finIso ? `${horaEstudio(inicioIso)}–${horaEstudio(finIso)}` : horaEstudio(inicioIso));

/** El instante de «fecha + hora» en hora del estudio, si existe y es futuro y no demasiado lejano. */
export function instanteFuturo(fecha: string, hora: string, ahoraMs: number, hoy: string): { ok: true; inicio: string } | PropuestaImposible {
  const inicio = instanteEnEstudio(fecha, hora);
  if (!inicio) return no('Esa fecha u hora no existen. Pregunta el día y la hora.');
  const ms = Date.parse(inicio);
  if (ms <= ahoraMs) return no(`Esa hora ya ha pasado (hoy es ${diaLargo(hoy)}). Pregunta otra.`);
  if (fecha > masDias(hoy, MAX_DIAS_ANTELACION)) return no(`Solo programo con ${MAX_DIAS_ANTELACION} días de antelación como mucho.`);
  return { ok: true, inicio };
}

const dia = (fecha: string) => diaLargo(fecha);

// ── Clase ──
export interface CatalogoClase {
  tipos: { id: string; nombre: string; duracionMin: number; aforo: number | null; archivado: boolean }[];
  salas: { id: string; nombre: string; capacidad: number }[];
  /** `null` = no se pidió o no se pudo resolver; `'ambigua'` = la marca no es una persona concreta. */
  instructora: { id: string; activa: boolean } | null | 'ambigua';
  /** Las clases del día de la candidata (todas las del estudio ese día; se filtra aquí). */
  existentes: readonly SlotSesion[];
  /** Bloqueos de la instructora ese día (ausencias incluidas), sin tipo ni motivo. */
  bloqueosInstructora: readonly { horaInicio: string | null; horaFin: string | null }[];
  cierres: readonly CierreGuardado[];
  horario: HorarioDelEstudio;
  marcaInstructora: (id: string) => string;
  nombreInstructora?: (id: string) => string;
}

export function bloqueada(b: { horaInicio: string | null; horaFin: string | null }, inicio: string, fin: string): boolean {
  if (!b.horaInicio || !b.horaFin) return true;
  const i = horaEstudio(inicio), f = horaEstudio(fin);
  return i < b.horaFin.slice(0, 5) && b.horaInicio.slice(0, 5) < f;
}

export function prepararClase(input: EntradaClase, c: CatalogoClase, ahoraMs: number, hoy: string): Preparada<PayloadClase> {
  const t0 = instanteFuturo(input.fecha, input.hora, ahoraMs, hoy);
  if (!t0.ok) return t0;
  const tipo = elegir(c.tipos.filter(t => !t.archivado), input.tipo_clase, 'ningún tipo de clase', 'tipos de clase');
  if ('ok' in tipo) return tipo;
  const sala = elegir(c.salas, input.sala, 'ninguna sala', 'salas');
  if ('ok' in sala) return sala;

  const inicio = t0.inicio;
  const fin = new Date(Date.parse(inicio) + (tipo.duracionMin || 60) * 60_000).toISOString();
  if (fechaEnZona(fin) !== input.fecha) return no('La clase terminaría pasada la medianoche: pregunta una hora más temprana.');

  let aforo = tipo.aforo ?? sala.capacidad;
  if (input.aforo > 0) {
    if (input.aforo > sala.capacidad) return no(`${sala.nombre} tiene ${sala.capacidad} plazas: no puedo poner ${input.aforo}. Pregunta si quiere otro aforo u otra sala.`);
    aforo = input.aforo;
  }

  if (input.instructora && c.instructora === 'ambigua') return no('No sé a qué instructora se refiere. Pregunta cuál.');
  if (input.instructora && (!c.instructora || c.instructora === 'ambigua' || !c.instructora.activa)) return no('Esa persona no está activa en el equipo. Pregunta con quién.');
  const instructorId = input.instructora && c.instructora && c.instructora !== 'ambigua' ? c.instructora.id : null;

  const cierre = cierreDeFecha(input.fecha, c.cierres);
  if (cierre) return no(`El estudio está cerrado ese día${cierre.motivo ? ` (${cierre.motivo})` : ''}. Pregunta otro día.`);

  const choques = detectarConflictos({ salaId: sala.id, instructorId, inicio, fin }, [...c.existentes]);
  if (choques.sala.length) return no(`${sala.nombre} ya está ocupada de ${choques.sala.map(s => textoHora(s.inicio, s.fin)).join(' y ')}. Pregunta otra hora u otra sala.`);
  if (choques.instructor.length) return no(`Esa instructora ya da clase de ${choques.instructor.map(s => textoHora(s.inicio, s.fin)).join(' y ')}. Pregunta otra hora u otra instructora.`);
  if (instructorId && c.bloqueosInstructora.some(b => bloqueada(b, inicio, fin))) return no('Esa instructora no está disponible ese día (ausencia o bloqueo). Pregunta otro día u otra instructora.');

  const avisos: string[] = [];
  const horario = avisoHorario(diaSemanaLocal(input.fecha), horaEstudio(inicio), horaEstudio(fin), c.horario);
  if (horario) avisos.push(`${horario} La clase queda fuera de ese horario.`);
  if (!instructorId) avisos.push('Queda sin instructora asignada.');

  const quien = instructorId ? c.marcaInstructora(instructorId) : 'Sin asignar';
  return {
    ok: true, tipo: 'CREAR_CLASE', titulo: 'Crear una clase',
    payload: { tipoClaseId: tipo.id, salaId: sala.id, instructorId, inicio, fin, aforo },
    lineas: [
      { etiqueta: 'Clase', valor: tipo.nombre }, { etiqueta: 'Día', valor: dia(input.fecha) },
      { etiqueta: 'Hora', valor: textoHora(inicio, fin) }, { etiqueta: 'Sala', valor: sala.nombre },
      { etiqueta: 'Instructora', valor: quien }, { etiqueta: 'Plazas', valor: String(aforo) },
    ],
    avisos, efecto: null,
    resumen: `${tipo.nombre}, ${dia(input.fecha)}, ${textoHora(inicio, fin)}, ${sala.nombre}, ${instructorId ? quien : 'sin instructora'}, ${aforo} plazas`,
    destino: { href: '/calendario', texto: 'Ver en Calendario' },
  };
}

// ── Sala ──
export const COLORES_SALA = ['#F7A6C4', '#7FB2E5', '#8FC98A', '#E8B45C', '#B79BE0', '#5FC2C2'];

export function prepararSala(input: EntradaSala, salas: readonly { nombre: string }[]): Preparada<PayloadSala> {
  const nombre = input.nombre.replace(/[\r\n\t[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nombre) return no('Falta el nombre de la sala. Pregunta cómo se llama.');
  if (salas.some(s => normalizar(s.nombre) === normalizar(nombre))) return no(`Ya existe una sala que se llama «${nombre}».`);
  const color = COLORES_SALA[salas.length % COLORES_SALA.length];
  return {
    ok: true, tipo: 'CREAR_SALA', titulo: 'Crear una sala',
    payload: { nombre, capacidad: input.capacidad, color },
    lineas: [{ etiqueta: 'Sala', valor: nombre }, { etiqueta: 'Aforo', valor: `${input.capacidad} plazas` }],
    avisos: [], efecto: null,
    resumen: `Sala ${nombre} con ${input.capacidad} plazas`,
    destino: { href: '/configuracion?tab=estudio&abrir=salas', texto: 'Ver en Configuración' },
  };
}

// ── Evento (publicación de tipo EVENTO en la Comunidad de la app) ──
export function prepararEvento(
  input: EntradaEvento, ahoraMs: number, hoy: string, nombreDeMarca: (marca: string) => string | null,
): Preparada<PayloadEvento> {
  const t0 = instanteFuturo(input.fecha, input.hora, ahoraMs, hoy);
  if (!t0.ok) return t0;
  // Las marcas del modelo: la del equipo se vuelve su nombre (ya es público); una alumna o una persona sin identificar, nunca.
  let fallo: string | null = null;
  const limpio = input.texto.replace(/\[([A-Z]+_\d+)\]/g, (_m, ref: string) => {
    const n = ref.startsWith('EQUIPO_') ? nombreDeMarca(ref) : null;
    if (!n) fallo = 'El anuncio nombra a una persona que no puedo publicar. Pregunta el texto sin nombres de alumnas.';
    return n ?? '';
  }).replace(/\s+/g, ' ').trim();
  if (fallo) return no(fallo);
  if (limpio.length < 5) return no('Falta el texto del anuncio. Pregunta de qué trata el evento.');
  const lugar = input.lugar.replace(/[[\]]/g, ' ').replace(/\s+/g, ' ').trim() || null;
  const aforo = input.aforo > 0 ? input.aforo : null;
  const lineas: LineaPropuesta[] = [
    { etiqueta: 'Anuncio', valor: input.texto.replace(/\s+/g, ' ').trim() }, { etiqueta: 'Día', valor: dia(input.fecha) },
    { etiqueta: 'Hora', valor: textoHora(t0.inicio) },
    ...(lugar ? [{ etiqueta: 'Lugar', valor: lugar }] : []),
    { etiqueta: 'Plazas', valor: aforo ? String(aforo) : 'Sin límite' },
  ];
  return {
    ok: true, tipo: 'CREAR_EVENTO', titulo: 'Publicar un evento',
    payload: { texto: limpio, inicio: t0.inicio, aforo, lugar },
    lineas, avisos: ['Se publicará exactamente este texto, visible para todas las alumnas: revisa que no lleve nombres.'],
    efecto: 'Se publica en la Comunidad de la app y se avisa a todas las alumnas con una notificación.',
    resumen: `Evento «${input.texto.replace(/\s+/g, ' ').trim().slice(0, 60)}», ${dia(input.fecha)}, ${textoHora(t0.inicio)}${aforo ? `, ${aforo} plazas` : ', sin límite de plazas'}`,
    destino: { href: '/comunidad', texto: 'Ver en Comunidad' },
  };
}

// ── Cita ──
export interface CatalogoCita {
  socia: { id: string } | null | 'ambigua';
  instructora: { id: string; activa: boolean } | null | 'ambigua';
  /** Citas activas y clases de la instructora ese día. */
  ocupada: readonly { inicio: string; fin: string }[];
  bloqueosInstructora: readonly { horaInicio: string | null; horaFin: string | null }[];
  cierres: readonly CierreGuardado[];
  marcaSocia: (id: string) => string;
  marcaInstructora: (id: string) => string;
}
const ETIQUETA_CITA: Record<string, string> = { PRIVADA: 'Cita privada', EVALUACION: 'Valoración', FISIOTERAPIA: 'Fisioterapia', ONLINE: 'Cita online' };

export function prepararCita(input: EntradaCita, c: CatalogoCita, ahoraMs: number, hoy: string): Preparada<PayloadCita> {
  const t0 = instanteFuturo(input.fecha, input.hora, ahoraMs, hoy);
  if (!t0.ok) return t0;
  if (c.socia === 'ambigua') return no('No sé a qué alumna se refiere: hay varias con ese nombre. Pregunta cuál.');
  if (!c.socia) return no('No encuentro a esa alumna. Pregunta su nombre completo.');
  if (c.instructora === 'ambigua') return no('No sé a qué instructora se refiere. Pregunta cuál.');
  if (!c.instructora || !c.instructora.activa) return no('Falta la instructora de la cita. Pregunta con quién es.');
  const minutos = input.duracion_min > 0 ? input.duracion_min : 60;
  const inicio = t0.inicio;
  const fin = new Date(Date.parse(inicio) + minutos * 60_000).toISOString();
  if (fechaEnZona(fin) !== input.fecha) return no('La cita terminaría pasada la medianoche: pregunta una hora más temprana.');
  if (cierreDeFecha(input.fecha, c.cierres)) return no('El estudio está cerrado ese día. Pregunta otro día.');
  const choque = c.ocupada.filter(o => Date.parse(o.inicio) < Date.parse(fin) && Date.parse(inicio) < Date.parse(o.fin));
  if (choque.length) return no(`Esa instructora ya tiene algo de ${choque.map(o => textoHora(o.inicio, o.fin)).join(' y ')}. Pregunta otra hora.`);
  if (c.bloqueosInstructora.some(b => bloqueada(b, inicio, fin))) return no('Esa instructora no está disponible ese día (ausencia o bloqueo). Pregunta otro día u otra instructora.');
  const tipo = TIPOS_CITA[input.tipo];
  return {
    ok: true, tipo: 'CREAR_CITA', titulo: 'Crear una cita',
    payload: { socioId: c.socia.id, instructorId: c.instructora.id, tipo, inicio, fin },
    lineas: [
      { etiqueta: 'Alumna', valor: c.marcaSocia(c.socia.id) }, { etiqueta: 'Con', valor: c.marcaInstructora(c.instructora.id) },
      { etiqueta: 'Tipo', valor: ETIQUETA_CITA[tipo] }, { etiqueta: 'Día', valor: dia(input.fecha) },
      { etiqueta: 'Hora', valor: textoHora(inicio, fin) },
    ],
    avisos: ['La cita se crea sin precio ni cobro.'], efecto: null,
    resumen: `${ETIQUETA_CITA[tipo]} de ${c.marcaSocia(c.socia.id)} con ${c.marcaInstructora(c.instructora.id)}, ${dia(input.fecha)}, ${textoHora(inicio, fin)}`,
    destino: { href: '/citas', texto: 'Ver en Citas' },
  };
}

/** ¿Es válida una hora 'HH:MM'? (re-export para quien no quiere importar slots) */
export const horaValida = esHoraHHMM;
