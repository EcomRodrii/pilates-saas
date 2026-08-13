// Del dominio de Tentare a la forma que pinta el portal en React.
//
// Todo puro: entra lo que el portal ya carga hoy (`useStudio()`) y sale un
// `DatosPortal`. Sin fetch, sin React y sin fechas implícitas — el "ahora"
// entra por parámetro, que es lo que permite probarlo sin congelar el reloj.
//
// ⚠️ La zona horaria es la del estudio (Europe/Madrid), no la del navegador ni
// UTC. Una clase de las 00:30 en Madrid cae el día ANTERIOR en UTC, y el
// horario la enseñaría en el día que no es. Mismo criterio que
// `serie-horario.ts` y la migración 0105, que ya se comió ese bug.

import type { Sesion, Reserva, Recibo, TipoClase, Sala, Instructor, Socio, Suscripcion, PlanTarifa } from '../types.ts';
import { TZ_ESTUDIO } from '../utils.ts';
import { fechaLocalDe } from '../citas/slots.ts';
// El aforo lo decide `plazasOcupadas` y solo ella. Contarlo aquí a mano sería
// un segundo criterio del mismo dato — y el primer intento ya se dejó fuera
// `ASISTIDA`, con lo que una clase pasada aparecería con plazas libres.
import { plazasOcupadas } from '../booking-logic.ts';
// Los objetivos son una lista FIJA y compartida con la página pública. Se
// resuelven a sus etiquetas aquí y no en el componente: si el estudio guardó un
// id de una versión anterior, `resolverObjetivos` lo descarta en vez de
// enseñar un objetivo que ya no existe.
import { OBJETIVOS, resolverObjetivos } from '../reservar/objetivos.ts';
// Quién sale en «Profesores» lo decide `queImparten`, la MISMA función que usa
// `/portal/[slug]/instructores`. Con un filtro propio, las dos pantallas
// acabarían enseñando listas distintas del mismo equipo.
import { queImparten } from '../equipo.ts';
import type {
  BonoCartera, BonoPortal, CompraPortal, DatosPortal, DiaPortal, FiltroPortal, PlanPortal,
  ProfesorPortal, ReservaPortal, SociaPortal, StudioClass,
} from './tipos.ts';

const ETIQUETA_DIA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const CLAVE_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
/** El día de la semana entero, para la cabecera del Inicio ("Miércoles, 14 de
 *  mayo"). En minúscula: quien lo pinta decide si va en versalitas. */
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/**
 * El nivel, en palabras. `tipos_clase.nivel` es un enum
 * (`TODOS`/`PRINCIPIANTE`/`MEDIO`/`AVANZADO`) y el portal lo pinta tal cual en
 * la píldora del detalle y en «Nivel …» — con datos de muestra no se vio
 * porque traían ya texto humano ("Intermedio", "Suave").
 *
 * ⚠️ Es el QUINTO sitio del repo con este mismo mapa (`reserva-calendario`,
 * `tab-clases`, `portal/[slug]/videos`, `portal/[slug]/clases/[sesionId]` y
 * aquí), y cada uno con su redacción. Unificarlos es un cambio aparte que toca
 * pantallas vivas; aquí se copia la redacción del PORTAL, que es la que ve la
 * misma persona.
 */
const NIVEL: Record<string, string> = {
  TODOS: 'Todos los niveles',
  PRINCIPIANTE: 'Iniciación',
  MEDIO: 'Intermedio',
  AVANZADO: 'Avanzado',
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'YYYY-MM-DD' (en Madrid) → sus partes, sin pasar por `Date` otra vez. */
function partes(fechaLocal: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaLocal.split('-').map(Number);
  return { anio, mes, dia };
}

/** Hora de pared en Madrid, 'HH:MM'. */
export function horaLocal(iso: string, tz = TZ_ESTUDIO): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/**
 * Los siete días de la semana que contiene `ahora`, de lunes a domingo.
 *
 * `num` es el día del MES, no el de la semana: es lo que casa con
 * `StudioClass.day`. Cuando la semana cruza de mes los números no se repiten
 * dentro de ella (29, 30, 1, 2…), así que sigue sirviendo de clave.
 */
function diasDeLaSemana(ahora: Date, tz: string): { fecha: string; dia: DiaPortal }[] {
  const { anio, mes, dia } = partes(fechaLocalDe(ahora, tz));
  // Mediodía UTC para que sumar/restar días nunca cruce de día por el cambio
  // de hora (a las 00:00 sí puede).
  const base = new Date(Date.UTC(anio, mes - 1, dia, 12));
  const diaSemana = (base.getUTCDay() + 6) % 7; // 0 = lunes
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - diaSemana + i);
    const idx = d.getUTCDay();
    const fecha = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { fecha, dia: { key: CLAVE_DIA[idx], label: ETIQUETA_DIA[idx], num: d.getUTCDate() } };
  });
}

export function semanaDe(ahora: Date, tz = TZ_ESTUDIO): DiaPortal[] {
  return diasDeLaSemana(ahora, tz).map((d) => d.dia);
}

/** El día del MES de hoy en la zona del estudio. La clave con la que casan
 *  las clases (`StudioClass.day`) y la tira de la semana. */
export function diaDelMesHoy(ahora: Date, tz = TZ_ESTUDIO): number {
  return partes(fechaLocalDe(ahora, tz)).dia;
}

/**
 * Hoy, en la zona del estudio: el día del mes y su fecha en palabras.
 *
 * Las dos salen de la MISMA fecha local a propósito. Calcular el número por un
 * lado y la etiqueta por otro es lo que deja la cabecera diciendo «miércoles»
 * mientras el horario marca el jueves las noches de cambio de hora.
 */
export function hoyDe(ahora: Date, tz = TZ_ESTUDIO): { num: number; largo: string; mes: string } {
  const local = fechaLocalDe(ahora, tz);
  const { anio, mes, dia } = partes(local);
  // Mediodía UTC, mismo motivo que en `diasDeLaSemana`: a las 00:00 el
  // desplazamiento de zona puede cruzar de día.
  const idx = new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
  return { num: dia, largo: `${NOMBRE_DIA[idx]}, ${dia} de ${MESES[mes - 1]}`, mes: MESES[mes - 1] };
}

/** El lunes de la semana que contiene esa fecha local, como 'YYYY-MM-DD'.
 *  Es la clave con la que se agrupan las semanas de la racha. */
function lunesDe(fechaLocal: string): string {
  const { anio, mes, dia } = partes(fechaLocal);
  // Mediodía UTC, mismo motivo que en `diasDeLaSemana`.
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** La semana anterior a una clave de `lunesDe`. */
function semanaAnterior(lunes: string): string {
  const { anio, mes, dia } = partes(lunes);
  const d = new Date(Date.UTC(anio, mes - 1, dia, 12));
  d.setUTCDate(d.getUTCDate() - 7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Semanas seguidas en las que la socia ha ASISTIDO al menos a una clase.
 *
 * El prototipo pintaba «6 semanas seguidas — tu mejor racha» como texto fijo.
 * Esto lo calcula, y por eso tiene tres reglas que un número inventado no
 * necesita:
 *
 *  1. **Cuenta `ASISTIDA`, no `CONFIRMADA`.** Reservar no es venir. Una racha
 *     construida sobre reservas se rompería sola en cuanto alguien reserva y
 *     no aparece — y le habríamos dicho que la tenía.
 *  2. **La semana en curso no rompe la racha.** Es lunes por la mañana: nadie
 *     ha asistido a nada todavía. Si contara como semana en blanco, la racha
 *     se pondría a cero cada lunes y volvería el martes. Se cuenta si ya tiene
 *     una clase; si no, se empieza a contar desde la semana pasada.
 *  3. **«Tu mejor racha» solo se dice cuando LO ES.** Es una afirmación
 *     comprobable, así que se comprueba contra el resto de su historial en
 *     vez de escribirla siempre.
 *
 * `null` = no hay racha que enseñar (menos de dos semanas seguidas). Una
 * semana suelta no es una racha, y anunciarla como tal es ruido.
 */
export function rachaDe(
  reservas: Pick<Reserva, 'sesionId' | 'estado'>[] | undefined,
  sesiones: Pick<Sesion, 'id' | 'inicio'>[],
  ahora: Date,
  tz = TZ_ESTUDIO,
): { semanas: number; esMejor: boolean } | null {
  if (!reservas?.length) return null;
  const inicioPorSesion = new Map(sesiones.map((s) => [s.id, s.inicio]));

  const conAsistencia = new Set<string>();
  for (const r of reservas) {
    if (r.estado !== 'ASISTIDA') continue;
    const inicio = inicioPorSesion.get(r.sesionId);
    if (!inicio) continue;
    conAsistencia.add(lunesDe(fechaLocalDe(new Date(inicio), tz)));
  }
  if (conAsistencia.size === 0) return null;

  // ── La racha actual ──────────────────────────────────────────────────────
  const estaSemana = lunesDe(fechaLocalDe(ahora, tz));
  let cursor = conAsistencia.has(estaSemana) ? estaSemana : semanaAnterior(estaSemana);
  let semanas = 0;
  while (conAsistencia.has(cursor)) {
    semanas++;
    cursor = semanaAnterior(cursor);
  }
  if (semanas < 2) return null;

  // ── ¿Es la mejor? ────────────────────────────────────────────────────────
  // Se recorre el historial ordenado contando tramos seguidos. Con `Set` no
  // hay orden garantizado, de ahí el `sort` — las claves son 'YYYY-MM-DD', así
  // que ordenan bien como texto.
  const todas = [...conAsistencia].sort();
  let mejor = 0, tramo = 0, previa: string | null = null;
  for (const s of todas) {
    tramo = previa !== null && semanaAnterior(s) === previa ? tramo + 1 : 1;
    if (tramo > mejor) mejor = tramo;
    previa = s;
  }
  return { semanas, esMejor: semanas >= mejor };
}

/** "30 de septiembre". Vacío si no hay fecha — el portal no enseña un guion. */
export function fechaLarga(iso: string | null | undefined, tz = TZ_ESTUDIO): string {
  if (!iso) return '';
  const { mes, dia } = partes(fechaLocalDe(new Date(iso), tz));
  return `${dia} de ${MESES[mes - 1]}`;
}

/** Los objetivos guardados, en palabras. Vacío si el estudio no marcó ninguno. */
function etiquetasObjetivo(raw: unknown): string[] {
  const ids = new Set<string>(resolverObjetivos(raw));
  return OBJETIVOS.filter((o) => ids.has(o.id)).map((o) => o.label);
}

/**
 * TODOS sus bonos y planes activos, para «Mis bonos».
 *
 * ⚠️ A diferencia de `bonoDe`, aquí SÍ entran los ilimitados. `bonoDe` los
 * descarta con razón —no tienen sesiones que contar y su tarjeta del Inicio es
 * «quedan N clases»—, pero el efecto colateral era que una socia con plan
 * mensual no veía NINGÚN bono en ninguna pantalla, teniéndolo activo.
 *
 * Ordenados: primero lo que se agota (una socia mira cuánto le queda), y los
 * ilimitados después.
 */
export function bonosDe(suscripciones: Suscripcion[], planes: PlanTarifa[], tz = TZ_ESTUDIO): BonoCartera[] {
  return suscripciones
    .filter((s) => s.estado === 'ACTIVA')
    .map((s): BonoCartera => {
      const plan = planes.find((p) => p.id === s.planId);
      const ilimitado = s.sesionesRestantes === null;
      const left = s.sesionesRestantes ?? 0;
      const total = plan?.sesiones ?? left;
      const fecha = fechaLarga(s.fechaFin, tz);
      return {
        id: s.id,
        name: plan?.nombre ?? 'Bono',
        unlimited: ilimitado,
        left, total,
        subline: ilimitado ? 'Clases ilimitadas' : `${left} ${left === 1 ? 'clase restante' : 'clases restantes'}`,
        // Un bono CADUCA y un plan se RENUEVA: la misma fecha significa cosas
        // distintas y decir «caduca» de una mensualidad asusta sin motivo.
        footline: !fecha ? '' : ilimitado ? `Renovación el ${fecha}` : `Caduca el ${fecha}`,
        // Sin sesiones no hay porcentaje: `left/0` sería NaN y una barra al
        // 100 % en un ilimitado no significa nada.
        percent: !ilimitado && total > 0 ? Math.round((left / total) * 100) : 0,
      };
    })
    .sort((a, b) => Number(a.unlimited) - Number(b.unlimited));
}

/**
 * Sus compras, de la más reciente a la más antigua.
 *
 * Solo las COBRADAS: un recibo pendiente o fallido no es una compra hecha, y
 * listarlo en «Historial» le diría que pagó algo que el estudio no ha cobrado.
 */
export function comprasDe(recibos: Recibo[], tz = TZ_ESTUDIO): CompraPortal[] {
  return recibos
    .filter((r) => r.estado === 'COBRADO' && r.fechaCobro)
    .sort((a, b) => (b.fechaCobro ?? '').localeCompare(a.fechaCobro ?? ''))
    .map((r) => ({
      id: r.id,
      concepto: r.concepto,
      cuando: `Comprado el ${fechaLarga(r.fechaCobro, tz)}`,
      importe: `${r.importe.toFixed(2).replace('.', ',')} €`,
    }));
}

/** Los días de la semana, en el orden en que se leen (lunes primero). */
const DIA_LARGO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * El horario de apertura, en palabras.
 *
 * ⚠️ `dia_semana` usa 0=domingo (EXTRACT(DOW), igual que
 * `lib/sustituciones/franjas.ts`), pero una semana se LEE de lunes a domingo.
 * Reordenar aquí y no al pintar evita que cada pantalla lo resuelva a su
 * manera — que es como el domingo acaba el primero en una y el último en otra.
 *
 * Las horas llegan como 'HH:MM:SS' y se recortan a 'HH:MM': los segundos de
 * una hora de apertura no le dicen nada a nadie.
 */
export function horarioDe(dias: { diaSemana: number; abierto: boolean; horaApertura: string | null; horaCierre: string | null }[] | undefined): { dia: string; cuando: string }[] {
  if (!dias?.length) return [];
  const hhmm = (h: string | null) => (h ?? '').slice(0, 5);
  return [1, 2, 3, 4, 5, 6, 0].flatMap((dow) => {
    const d = dias.find((x) => x.diaSemana === dow);
    if (!d) return [];
    return [{
      dia: DIA_LARGO[dow],
      cuando: d.abierto && d.horaApertura && d.horaCierre ? `${hhmm(d.horaApertura)} – ${hhmm(d.horaCierre)}` : 'Cerrado',
    }];
  });
}

/** Las profesoras que salen en el portal. */
export function profesoresDe(instructores: Instructor[]): ProfesorPortal[] {
  return queImparten(instructores).map((i) => ({
    id: i.id,
    nombre: i.nombre,
    inicial: inicialDe(i.nombre),
    // `bio` es nullable de verdad: sin ella la ficha no pinta un párrafo
    // vacío ni un texto de relleno.
    bio: (i.bio ?? '').trim(),
  }));
}

/** La inicial que va en el avatar. Vacío si no hay nombre. */
export function inicialDe(nombre: string): string {
  return nombre.trim().charAt(0).toUpperCase();
}

export interface FuenteDatosPortal {
  ahora: Date;
  sesiones: Sesion[];
  // Solo se miran `sesionId` y `estado` (ver `plazasOcupadas`). El camino
  // público trae una fila recortada a propósito, para no sacar PII de nadie
  // que no sea quien mira; pedir la `Reserva` entera obligaría a castear.
  reservas: Pick<Reserva, 'sesionId' | 'estado'>[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  socio: Socio | null;
  /**
   * Las reservas de ESTA socia (no las del estudio). `undefined` = nadie
   * identificado; `[]` = identificada y sin ninguna reserva. Ver
   * `DatosPortal.reservadas`.
   */
  reservasPropias?: Pick<Reserva, 'id' | 'sesionId' | 'estado' | 'posicionEspera'>[];
  suscripciones: Suscripcion[];
  /** Los de la socia. `[]` = nadie identificado o sin compras. */
  recibos?: Recibo[];
  planes: PlanTarifa[];
  /**
   * Nombre y año de apertura, para el cierre de pantalla que firma el
   * estudio. `anioFundacion` es opcional de verdad: `studios.anio_fundacion`
   * es nullable y NO es `creadoEn` (el alta en Tentare, migr 0134) — sin él
   * el pie se pinta sin año en vez de inventarse uno.
   */
  estudio?: DatosPortal['estudio'];
  tz?: string;
}

/**
 * Las clases de la semana de `ahora`, ya resueltas contra tipo/sala/instructora.
 *
 * `seats` son plazas LIBRES, que es lo que el portal enseña ("quedan 3"), y
 * las ocupadas salen de `plazasOcupadas` — `LISTA_ESPERA` y
 * `PENDIENTE_APROBACION` no ocupan aforo (decisión de producto ya cerrada,
 * Fase 2a) pero `ASISTIDA` sí.
 */
export function clasesDeLaSemana(f: FuenteDatosPortal): StudioClass[] {
  const tz = f.tz ?? TZ_ESTUDIO;
  // ⚠️ El filtro va por FECHA completa ('2026-08-05'), no por día del mes.
  // Filtrar por `day` parecía bastar —dentro de una semana los números no se
  // repiten— pero al adaptador le llegan TODAS las sesiones del estudio, no
  // solo las de esta semana: una clase del 5 de septiembre tiene `day` 5 igual
  // que el 5 de agosto y se colaba en el horario. Salió mirando datos reales.
  const fechas = new Set(diasDeLaSemana(f.ahora, tz).map((d) => d.fecha));
  const porTipo = new Map(f.tiposClase.map((t) => [t.id, t]));
  const porSala = new Map(f.salas.map((s) => [s.id, s]));
  const porInstructor = new Map(f.instructores.map((i) => [i.id, i]));

  return f.sesiones
    .filter((s) => !s.cancelada)
    .map((s) => {
      const fecha = fechaLocalDe(new Date(s.inicio), tz);
      return { s, fecha, dia: partes(fecha).dia };
    })
    .filter(({ fecha }) => fechas.has(fecha))
    .sort((a, b) => a.s.inicio.localeCompare(b.s.inicio))
    .map(({ s, dia }) => {
      const tipo = porTipo.get(s.tipoClaseId);
      const sala = porSala.get(s.salaId);
      const instructor = porInstructor.get(s.instructorId);
      const minutos = Math.max(0, Math.round((new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 60000));
      const nombreInstructor = instructor?.nombre ?? '';
      return {
        id: s.id,
        name: tipo?.nombre ?? 'Clase',
        // La clave del filtro es el ID del tipo, no su nombre: dos tipos
        // pueden llamarse igual y el nombre además se puede renombrar.
        type: s.tipoClaseId,
        day: dia,
        time: horaLocal(s.inicio, tz),
        end: horaLocal(s.fin, tz),
        startsAt: s.inicio,
        endsAt: s.fin,
        duration: `${minutos} min`,
        room: sala?.nombre ?? '',
        level: tipo ? (NIVEL[tipo.nivel] ?? '') : '',
        teacher: nombreInstructor,
        initial: inicialDe(nombreInstructor),
        seats: Math.max(0, s.aforoMaximo - plazasOcupadas(s.id, f.reservas)),
        description: tipo?.descripcion ?? '',
        benefits: etiquetasObjetivo(tipo?.objetivos),
      };
    });
}

/**
 * Los filtros del horario: "Todas" + un tipo por cada clase que hay ESTA
 * semana. No el catálogo entero — un filtro que siempre devuelve cero es peor
 * que no ofrecerlo.
 */
export function filtrosDe(clases: StudioClass[], tiposClase: TipoClase[]): FiltroPortal[] {
  const presentes = new Set(clases.map((c) => c.type));
  return [
    { key: 'todas', label: 'Todas' },
    ...tiposClase.filter((t) => presentes.has(t.id)).map((t) => ({ key: t.id, label: t.nombre })),
  ];
}

/** Los planes que el estudio vende hoy, en el orden en que los tiene. */
export function planesDe(planes: PlanTarifa[]): PlanPortal[] {
  return planes.filter((p) => p.activo).map((p) => ({
    key: p.id,
    name: p.nombre,
    // `sesiones: null` = ilimitado. El portal ordena por este número, así que
    // el ilimitado tiene que quedar por encima de cualquier bono real.
    classes: p.sesiones ?? Number.MAX_SAFE_INTEGER,
    price: p.precio,
    badge: '',
    perks: p.descripcion ? [p.descripcion] : [],
  }));
}

/**
 * El bono que la socia tiene vivo. Si tiene varios, el que le quedan MENOS
 * sesiones — es el que va a gastar antes y el que le interesa vigilar.
 */
export function bonoDe(suscripciones: Suscripcion[], planes: PlanTarifa[], tz = TZ_ESTUDIO): BonoPortal {
  const vacio: BonoPortal = { name: '', total: 0, expires: '' };
  const activas = suscripciones.filter((s) => s.estado === 'ACTIVA' && s.sesionesRestantes !== null);
  if (activas.length === 0) return vacio;
  const elegida = activas.reduce((a, b) => ((a.sesionesRestantes ?? 0) <= (b.sesionesRestantes ?? 0) ? a : b));
  const plan = planes.find((p) => p.id === elegida.planId);
  return {
    name: plan?.nombre ?? '',
    total: plan?.sesiones ?? elegida.sesionesRestantes ?? 0,
    expires: fechaLarga(elegida.fechaFin, tz),
  };
}

export function sociaDe(socio: Socio | null): SociaPortal {
  if (!socio) return { name: '', short: '', initial: '' };
  const nombre = `${socio.nombre} ${socio.apellidos}`.trim();
  return { name: nombre, short: socio.nombre, initial: inicialDe(socio.nombre) };
}

/** El adaptador completo. Es lo único que necesita llamar quien monta el portal. */
export function construirDatosPortal(f: FuenteDatosPortal): DatosPortal {
  const tz = f.tz ?? TZ_ESTUDIO;
  const clases = clasesDeLaSemana({ ...f, tz });
  return {
    clases,
    hoy: hoyDe(f.ahora, tz),
    racha: rachaDe(f.reservasPropias, f.sesiones, f.ahora, tz),
    estudio: f.estudio ?? {
      nombre: '', anioFundacion: null, direccion: '', ciudad: '',
      codigoPostal: '', telefono: '', email: '', fotoUrl: null, normas: [], horario: [], privacidad: null,
    },
    dias: semanaDe(f.ahora, tz),
    filtros: filtrosDe(clases, f.tiposClase),
    planes: planesDe(f.planes),
    bono: bonoDe(f.suscripciones, f.planes, tz),
    bonos: bonosDe(f.suscripciones, f.planes, tz),
    compras: comprasDe(f.recibos ?? [], tz),
    socia: sociaDe(f.socio),
    profesores: profesoresDe(f.instructores),
    reservadas: f.reservasPropias && reservadasDe(f.reservasPropias, clases),
  };
}

/**
 * Las reservas que la socia tiene VIVAS sobre clases de esta semana.
 *
 * Se quedan fuera las canceladas y las que ya no tienen clase (la clase se
 * canceló, o cae fuera de la semana que se está mirando): pintar media fila es
 * peor que no pintarla. `LISTA_ESPERA` sí entra — la socia tiene que poder
 * verla y salirse de la cola.
 */
export function reservadasDe(
  reservas: Pick<Reserva, 'id' | 'sesionId' | 'estado' | 'posicionEspera'>[],
  clases: StudioClass[],
): ReservaPortal[] {
  const hayClase = new Set(clases.map((c) => c.id));
  return reservas
    .filter((r) => VIVAS.has(r.estado) && hayClase.has(r.sesionId))
    .map((r) => ({
      classId: r.sesionId,
      reservaId: r.id,
      estado: r.estado as ReservaPortal['estado'],
      // Solo tiene sentido en la cola. Fuera de ella el número existe en la
      // fila pero no significa nada, y enseñarlo diría «3ª» a quien ya tiene
      // su plaza.
      posicion: r.estado === 'LISTA_ESPERA' ? r.posicionEspera : null,
    }));
}

const VIVAS = new Set<Reserva['estado']>([
  'CONFIRMADA', 'ASISTIDA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION',
]);
