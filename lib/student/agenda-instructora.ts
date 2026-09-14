// La agenda de la instructora dentro de la app del estudio: tipos y reglas
// PURAS. Sin imports ni `@/`: lo prueba el runner de Node y lo comparten el
// servidor (`lib/portal-instructora/agenda-servidor.ts`) y las pantallas.
//
// ⚠️ Nada de aquí DECIDE nada sobre la clase. No dice si alguien la cubre ni si
// se cancela: eso lo resuelve el motor de sustituciones y, si no hay nadie, el
// estudio (decisión del fundador, 14-sep-2026: la instructora nunca cancela,
// pide la baja). Aquí solo se traduce lo que ya ha pasado a lo que ve ella.

/** La zona del negocio. Mismo criterio que `lib/student/formato.ts` (`ZONA`). */
export const ZONA_ESTUDIO = 'Europe/Madrid';

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_ESTUDIO });
const fmtHora = new Intl.DateTimeFormat('es-ES', {
  timeZone: ZONA_ESTUDIO, hour: '2-digit', minute: '2-digit', hour12: false,
});

/** El día de un instante en la zona del estudio (YYYY-MM-DD), no en UTC. */
export function fechaEnZona(iso: string): string {
  return fmtFecha.format(new Date(iso));
}

/** La hora de un instante en la zona del estudio («HH:mm»). */
export function horaEnZona(iso: string): string {
  return fmtHora.format(new Date(iso));
}

/**
 * Lo que ve la instructora de una baja que ha pedido.
 *
 * ⚠️ `pendiente_aprobacion` y `buscando` van JUNTOS a «revisando»: en modo
 * asistido el motor espera el visto bueno del estudio y todavía no ha escrito a
 * nadie, así que decirle «buscando quién la cubra» sería prometer algo que no
 * está pasando. Solo `contactando` es buscar de verdad.
 *
 * Un estado que no conocemos cae también en «revisando»: es lo único que no
 * promete nada.
 */
export type EstadoBajaVista = 'revisando' | 'buscando' | 'cubierta' | 'sin-cubrir' | 'resuelta';

export function estadoBajaVista(estado: string): EstadoBajaVista {
  switch (estado) {
    case 'contactando': return 'buscando';
    case 'confirmada': return 'cubierta';
    case 'agotada':
    case 'sin_sustituta': return 'sin-cubrir';
    case 'resuelta_fuera':
    case 'cancelada': return 'resuelta';
    default: return 'revisando';
  }
}

/** El texto de cada estado. `detalle` vacío = no hay nada más que decir. */
export function textoBaja(estado: EstadoBajaVista, sustituta?: string | null): { titulo: string; detalle: string } {
  const sigueATuNombre = 'Hasta que se confirme, la clase sigue a tu nombre.';
  switch (estado) {
    case 'revisando': return { titulo: 'El estudio lo está revisando', detalle: sigueATuNombre };
    case 'buscando': return { titulo: 'Buscando quién la cubra', detalle: sigueATuNombre };
    case 'cubierta': return { titulo: sustituta ? `La cubre ${sustituta}` : 'Ya hay quien la cubra', detalle: '' };
    case 'sin-cubrir': return { titulo: 'Nadie ha podido cubrirla', detalle: `Lo decide el estudio. ${sigueATuNombre}` };
    case 'resuelta': return { titulo: 'El estudio lo ha resuelto', detalle: 'Si tienes dudas, escribe al estudio.' };
  }
}

export interface BajaVista {
  sustitucionId: string;
  sesionId: string;
  estado: EstadoBajaVista;
  /** Nombre de quien la cubre, solo cuando ya está confirmada. */
  sustituta: string | null;
}

/** Una baja con lo mínimo de su clase, para listarla aunque la clase ya no sea suya. */
export interface BajaConClase extends BajaVista {
  inicio: string;
  fecha: string;
  hora: string;
  tipo: string;
}

/** Una clase que IMPARTE ella. */
export interface ClaseQueDa {
  id: string;
  inicio: string;
  fin: string;
  fecha: string;
  hora: string;
  horaFin: string;
  tipo: string;
  color: string | null;
  sala: string | null;
  aforo: number;
  /** Reservas que ocupan plaza (confirmadas y asistidas). */
  confirmadas: number;
  enEspera: number;
  cancelada: boolean;
  /** La última baja que pidió para esta clase, si la hay. */
  baja: BajaVista | null;
}

/** Una clase a la que VIENE como alumna (doble rol: agenda única, sin selector). */
export interface ClaseQueReserva {
  reservaId: string;
  claseId: string;
  inicio: string;
  fecha: string;
  hora: string;
  tipo: string;
  sala: string | null;
  enEspera: boolean;
}

export type FilaAgenda =
  | { tipo: 'da'; inicio: string; clase: ClaseQueDa }
  | { tipo: 'viene'; inicio: string; clase: ClaseQueReserva };

/**
 * Las clases que da y las que ha reservado, en UNA lista ordenada por hora.
 *
 * Se ordena por instante (`Date.parse`) y no comparando cadenas: el servidor
 * devuelve `+00:00` y el catálogo de la alumna puede traer `Z`, y como texto
 * esos dos formatos no ordenan igual.
 *
 * Si reservó una clase que además imparte (datos raros, pero posibles), manda
 * la fila de «da clase»: es la que tiene consecuencias.
 */
export function unirAgenda(da: readonly ClaseQueDa[], viene: readonly ClaseQueReserva[]): FilaAgenda[] {
  const idsQueDa = new Set(da.map((c) => c.id));
  const filas: FilaAgenda[] = [
    ...da.map((clase) => ({ tipo: 'da' as const, inicio: clase.inicio, clase })),
    ...viene
      .filter((clase) => !idsQueDa.has(clase.claseId))
      .map((clase) => ({ tipo: 'viene' as const, inicio: clase.inicio, clase })),
  ];
  return filas.sort((a, b) => {
    const diferencia = Date.parse(a.inicio) - Date.parse(b.inicio);
    if (diferencia !== 0) return diferencia;
    return a.tipo === b.tipo ? 0 : a.tipo === 'da' ? -1 : 1;
  });
}

/** Agrupa filas YA ordenadas por día, conservando el orden. */
export function agruparPorDia(filas: readonly FilaAgenda[]): Array<{ fecha: string; filas: FilaAgenda[] }> {
  const grupos = new Map<string, FilaAgenda[]>();
  for (const fila of filas) {
    const lista = grupos.get(fila.clase.fecha);
    if (lista) lista.push(fila);
    else grupos.set(fila.clase.fecha, [fila]);
  }
  return [...grupos.entries()].map(([fecha, lista]) => ({ fecha, filas: lista }));
}

/** La siguiente clase que da y que aún no ha terminado. La que se está dando cuenta. */
export function proximaQueDa(da: readonly ClaseQueDa[], ahoraMs: number): ClaseQueDa | null {
  return [...da]
    .filter((c) => !c.cancelada && Date.parse(c.fin) > ahoraMs)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0] ?? null;
}

/** Bajas que todavía piden atención: todas menos las que el estudio ya resolvió. */
export function bajasEnCurso<T extends BajaVista>(bajas: readonly T[]): T[] {
  return bajas.filter((b) => b.estado !== 'resuelta');
}

/**
 * ¿Puede pedir la baja de esta clase ahora?
 *
 * Nunca de una cancelada ni de una que ya ha empezado (el servidor lo vuelve a
 * comprobar: `sesionYaEmpezada`), ni si ya hay una baja que el estudio no ha
 * cerrado. «Nadie ha podido cubrirla» tampoco reabre: ahí decide el estudio.
 */
export function puedePedirBaja(clase: ClaseQueDa, ahoraMs: number): boolean {
  if (clase.cancelada) return false;
  if (Date.parse(clase.inicio) <= ahoraMs) return false;
  return !clase.baja || clase.baja.estado === 'resuelta';
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Sus clases en la forma que usa «Rellenar con mis clases»
 * (`celdasDesdeClases`, lib/sustituciones/disponibilidad-desde-clases.ts):
 * día de la semana (0 = domingo) y minutos del día, ya en la zona del estudio.
 *
 * El día sale de `fecha` a mediodía UTC y no de `inicio`: `fecha` ya está en la
 * zona del estudio, e `inicio` a las 00:30 de Madrid cae el día anterior en UTC.
 */
export function clasesLocalesDesdeAgenda(clases: readonly ClaseQueDa[]): Array<{ dow: number; inicioMin: number; finMin: number }> {
  return clases
    .filter((c) => !c.cancelada)
    .map((c) => ({
      dow: new Date(`${c.fecha}T12:00:00Z`).getUTCDay(),
      inicioMin: aMinutos(c.hora),
      finMin: aMinutos(c.horaFin),
    }));
}

/** Una clase que el motor le está pidiendo cubrir AHORA: es la candidata a la que le toca. */
export interface OfertaSustitucion {
  sustitucionId: string;
  sesionId: string;
  inicio: string;
  fin: string;
  fecha: string;
  hora: string;
  horaFin: string;
  tipo: string;
  sala: string | null;
}

/**
 * Por qué no ha valido su respuesta a una oferta, dicho para ella.
 *
 * Son los motivos del enlace del email (`app/api/public/aceptar-sustitucion`)
 * más dos que solo existen en la app: `ya_no_te_toca` (allí el token prueba que
 * se le preguntó; aquí lo prueba ser la candidata a la que el motor le pregunta
 * ahora) y `no_encontrada`. Lo desconocido cae en «otra la cubrió antes», que es
 * lo único que no la culpa de nada.
 */
export function textoMotivoOferta(motivo: string | undefined): string {
  switch (motivo) {
    case 'ya_aceptaste': return 'Ya nos dijiste que la cubres. La tienes en tu agenda.';
    case 'ya_rechazaste': return 'Ya nos dijiste que esta no podías. No tienes que hacer nada más.';
    case 'clase_ya_empezada': return 'Esta clase ya ha empezado.';
    case 'conflicto_horario': return 'Ya tienes otra clase a esa hora, así que no podemos darte esta.';
    case 'ya_no_te_toca': return 'Ya se lo estamos preguntando a otra persona.';
    case 'no_encontrada': return 'Esta petición ya no existe.';
    default: return 'Otra persona la ha cubierto antes. ¡Gracias igualmente!';
  }
}

/**
 * Cuándo se puede pasar lista: desde una hora antes de empezar hasta 12 horas
 * después de terminar (para quien la pasa al acabar el día).
 *
 * El panel no deja marcar hasta que la clase empieza (#870, contra «última
 * asistencia: hace -1 días» en clases de OTRO día). Una hora antes no abre nada
 * nuevo: es la misma apertura que el pase de la alumna (`lib/pase-acceso.ts`),
 * que ya marca asistencia, y que la puerta de Kisi — la gente llega antes.
 */
export const LISTA_ABRE_MIN_ANTES = 60;
export const LISTA_CIERRA_HORAS_DESPUES = 12;

export function ventanaLista(clase: { inicio: string; fin: string }): { abreMs: number; cierraMs: number } {
  return {
    abreMs: Date.parse(clase.inicio) - LISTA_ABRE_MIN_ANTES * 60_000,
    cierraMs: Date.parse(clase.fin) + LISTA_CIERRA_HORAS_DESPUES * 3_600_000,
  };
}

export function puedePasarLista(clase: { inicio: string; fin: string; cancelada: boolean }, ahoraMs: number): boolean {
  if (clase.cancelada) return false;
  const { abreMs, cierraMs } = ventanaLista(clase);
  return ahoraMs >= abreMs && ahoraMs <= cierraMs;
}

/**
 * Cómo aparece cada alumna en la lista.
 *
 * ⚠️ Desde la app SOLO se marca «Asistió» (14-sep-2026): `NO_ASISTIO` dispara
 * `trg_penalizacion_no_show`, que abre una penalización de dinero a la alumna, y
 * eso lo decide el estudio. Un «no vino» que ya marcó el estudio se enseña tal
 * cual, sin nada que tocar.
 */
export type EstadoEnLista = 'por-marcar' | 'asistio' | 'no-vino';

export function estadoEnLista(estadoReserva: string): EstadoEnLista | null {
  switch (estadoReserva) {
    case 'CONFIRMADA': return 'por-marcar';
    case 'ASISTIDA': return 'asistio';
    case 'NO_ASISTIO': return 'no-vino';
    // Lista de espera, canceladas y pendientes de aprobar no tienen plaza en la clase.
    default: return null;
  }
}

export interface AlumnaEnLista {
  reservaId: string;
  /** Ver `nombresParaLista`. */
  nombre: string;
  estado: EstadoEnLista;
}

export interface ListaDeClase {
  clase: { id: string; tipo: string; inicio: string; fin: string; fecha: string; hora: string; horaFin: string; cancelada: boolean };
  alumnas: AlumnaEnLista[];
}

/**
 * El nombre con el que la reconoce en la puerta: nombre e inicial del primer
 * apellido («Laura M.»). Lo mínimo (RGPD): ni apellidos, ni contacto, ni nada de
 * salud. Solo si dos quedan iguales en la misma clase se escribe el primer
 * apellido entero, que es lo justo para no confundirlas.
 */
export function nombresParaLista(personas: ReadonlyArray<{ nombre: string | null; apellidos: string | null }>): string[] {
  const partes = personas.map((p) => ({
    nombre: (p.nombre ?? '').trim(),
    primerApellido: (p.apellidos ?? '').trim().split(/\s+/)[0] ?? '',
  }));
  const cortos = partes.map(({ nombre, primerApellido }) => {
    const inicial = primerApellido.charAt(0).toUpperCase();
    if (!nombre) return inicial ? `${inicial}.` : 'Sin nombre';
    return inicial ? `${nombre} ${inicial}.` : nombre;
  });
  const clave = (s: string) => s.toLocaleLowerCase('es');
  const veces = new Map<string, number>();
  for (const c of cortos) veces.set(clave(c), (veces.get(clave(c)) ?? 0) + 1);
  return partes.map((p, i) => (
    (veces.get(clave(cortos[i])) ?? 0) > 1 && p.nombre && p.primerApellido
      ? `${p.nombre} ${p.primerApellido}`
      : cortos[i]
  ));
}

/** Por nombre, como una lista en papel. */
export function ordenarLista<T extends { nombre: string }>(alumnas: readonly T[]): T[] {
  return [...alumnas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export function resumenLista(alumnas: ReadonlyArray<{ estado: EstadoEnLista }>): { vinieron: number; total: number } {
  return { vinieron: alumnas.filter((a) => a.estado === 'asistio').length, total: alumnas.length };
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Tope de días por petición: una agenda, no un informe. */
export const MAX_DIAS_AGENDA = 31;

export function rangoAgendaValido(desde: unknown, hasta: unknown): boolean {
  if (typeof desde !== 'string' || typeof hasta !== 'string') return false;
  if (!RE_FECHA.test(desde) || !RE_FECHA.test(hasta)) return false;
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return false;
  return (b - a) / 86_400_000 <= MAX_DIAS_AGENDA;
}
