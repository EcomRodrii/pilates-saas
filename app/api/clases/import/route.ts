import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { horaParedAInstante } from '@/lib/citas/slots';
import { uid, TZ_ESTUDIO } from '@/lib/utils';
import type { FilaClase } from '@/lib/csv';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';
import { catalogo } from '@/lib/migracion/catalogo';
import { detectarSolapes, textoConflicto } from '@/lib/migracion/solapes-horario';
import { puedeGestionarClientas, puedeGestionarEquipo, puedeGestionarSede } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { capturar } from '@/lib/analytics';
import { MAX_ERRORES_DEVUELTOS } from '@/lib/migracion/incidencias';

// Una importación con miles de filas hace varios lotes secuenciales de INSERT;
// damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

// Importación del HORARIO (clases y sesiones) desde CSV — tercera pieza de la
// migración asistida, tras socias y membresías. Sin horario el calendario llega
// vacío y no puede colgar nada de él.
//
// Autenticada (JWT staff) y scopeada al estudio de la sesión: el studio_id sale
// SIEMPRE del token, nunca del body.
//
// Acepta las dos formas de exportar un horario:
//   · fila con FECHA        → una sesión concreta,
//   · fila con DÍA DE SEMANA → se expande a `semanas` semanas desde `desde`.
//
// Los tipos de clase que no existan se CREAN (sin ellos no hay nada que importar).
// Las INSTRUCTORAS que no existan también se crean, si quien importa puede gestionar
// el equipo (propietaria o gerencia): sin ellas el horario entraba con cientos de
// clases «sin instructora» y la propietaria tenía que darlas de alta una a una
// antes de migrar. Se crean SIN email y sin invitar a nadie (una ficha de equipo,
// no una cuenta) y entran en el lote, así que «Deshacer migración» las borra.
// La sala solo se EMPAREJA por nombre: si no cuadra se deja el hueco vacío y se
// informa, en vez de inventar una sala que no existe.

const MAX_FILAS = 2000;
const MAX_SESIONES = 5000;   // techo duro de sesiones generadas
const MAX_SEMANAS = 12;
const LOTE = 500;
const TZ = TZ_ESTUDIO;

// Paleta para los tipos de clase creados al vuelo (el estudio los puede recolorear).
const COLORES = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6', '#A855F7'];
// Y para las instructoras creadas al vuelo (la de la ficha de Equipo es la rosa de siempre).
const COLORES_INSTRUCTORA = ['#F7A6C4', '#8B5CF6', '#10B981', '#F59E0B', '#3B82F6', '#14B8A6', '#EC4899', '#A855F7'];

const RE_DIACRITICOS = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

interface Cuerpo {
  rows?: FilaClase[];
  semanas?: number;   // cuántas semanas expandir las filas recurrentes
  desde?: string;     // 'YYYY-MM-DD' — inicio de la expansión
  /** De dónde viene el horario. El propuesto por Tentare al empezar y el que
   *  la propietaria importa de un Excel son dos caminos con conversiones muy
   *  distintas, y mezclarlos en la misma métrica oculta cuál funciona. */
  origen?: 'onboarding' | 'importacion';
}

/** Suma días a una fecha local 'YYYY-MM-DD' sin tocar zonas horarias. */
function sumarDias(fechaLocal: string, dias: number): string {
  const [y, m, d] = fechaLocal.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/** Día de la semana (DOW Postgres, 0=domingo) de una fecha local. */
function dowDe(fechaLocal: string): number {
  const [y, m, d] = fechaLocal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function sumarMinutos(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + min;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'clases-import', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para importar el horario' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as (Cuerpo & { batchId?: string }) | null;
  // Migración Mágica: registrar los ids creados para poder deshacer el lote.
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
  const filas = body?.rows;
  if (!Array.isArray(filas)) {
    return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  }
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });
  }

  const semanas = Math.max(1, Math.min(MAX_SEMANAS, Math.trunc(body?.semanas ?? 4)));
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(body?.desde ?? '')
    ? (body!.desde as string)
    : new Date().toISOString().slice(0, 10);

  // ── Catálogo del estudio para emparejar ────────────────────────────────────
  // Paginado con `catalogo()` como los otros siete importadores: sin `.range()`
  // PostgREST corta en 1000 filas EN SILENCIO. Un estudio con más de 1000 tipos/
  // salas/instructores recibía un catálogo incompleto y se le creaban tipos de
  // clase duplicados por no encontrar los que ya tenía.
  const [{ data: tipos, error: eT }, { data: instructores, error: eI }, { data: salas, error: eS }] = await Promise.all([
    catalogo<{ id: string; nombre: string; duracion_minutos: number | null; archivado_en: string | null }>(
      (d, h) => admin.from('tipos_clase').select('id, nombre, duracion_minutos, archivado_en').eq('studio_id', sesion.studioId).order('id').range(d, h)),
    catalogo<{ id: string; nombre: string }>(
      (d, h) => admin.from('instructores').select('id, nombre').eq('studio_id', sesion.studioId).order('id').range(d, h)),
    catalogo<{ id: string; nombre: string; capacidad: number | null }>(
      (d, h) => admin.from('salas').select('id, nombre, capacidad').eq('studio_id', sesion.studioId).order('id').range(d, h)),
  ]);
  if (eT || eI || eS) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  // Un tipo ARCHIVADO cuenta como existente (no se crea otro con su nombre),
  // pero pierde frente a uno activo que se llame igual. Y con él solo se
  // importa historial: una clase futura suya la rechazaría el trigger de
  // `sesiones` (migr 20260930215125), así que se avisa en su fila.
  const tipoPorNombre = new Map<string, { id: string; duracion: number; archivado: boolean }>();
  for (const t of tipos ?? []) {
    const clave = norm(t.nombre);
    const archivado = !!t.archivado_en;
    const previo = tipoPorNombre.get(clave);
    if (previo && (archivado || !previo.archivado)) continue;
    tipoPorNombre.set(clave, { id: t.id, duracion: t.duracion_minutos ?? 60, archivado });
  }
  const instructorPorNombre = new Map<string, string>();
  for (const i of instructores ?? []) instructorPorNombre.set(norm(i.nombre), i.id);
  const salaPorNombre = new Map<string, { id: string; capacidad: number }>();
  for (const s of salas ?? []) salaPorNombre.set(norm(s.nombre), { id: s.id, capacidad: s.capacidad ?? 10 });

  // ── Tipos de clase que faltan: se crean (sin ellos no hay sesión posible) ──
  const nuevosTipos: Record<string, unknown>[] = [];
  let tiposFueraDelDeshacer = false;
  let colorIdx = tipoPorNombre.size;
  for (const f of filas) {
    const nombre = (f.clase ?? '').trim();
    if (!nombre || tipoPorNombre.has(norm(nombre))) continue;
    const dur = f.duracion ?? (f.horaFin && f.horaInicio
      ? (Number(f.horaFin.slice(0, 2)) * 60 + Number(f.horaFin.slice(3))) - (Number(f.horaInicio.slice(0, 2)) * 60 + Number(f.horaInicio.slice(3)))
      : 60);
    const id = `tc-${uid()}`;
    tipoPorNombre.set(norm(nombre), { id, duracion: dur > 0 ? dur : 60, archivado: false });
    nuevosTipos.push({
      id, studio_id: sesion.studioId, nombre,
      color: COLORES[colorIdx++ % COLORES.length],
      duracion_minutos: dur > 0 ? dur : 60,
      descripcion: null, nivel: 'TODOS', foto_url: null,
    });
  }
  // Crear tipos de clase es de la propietaria y la gerencia (misma regla que la RLS de
  // `tipos_clase`); recepción importa horario solo con los tipos que ya existen.
  if (nuevosTipos.length > 0 && !puedeGestionarSede(sesion.rol)) {
    const nombres = nuevosTipos.map(t => `«${t.nombre as string}»`).join(', ');
    return NextResponse.json({
      error: `Estas clases no existen todavía en tu estudio: ${nombres}. Solo la propietaria o la gerencia pueden crearlas: pídeselo o usa el nombre de una clase que ya tengas.`,
    }, { status: 403 });
  }
  // Los tipos nuevos se insertan más abajo, ya con las clases validadas: antes se
  // creaban primero y, si luego fallaba el insert de sesiones o se descartaban
  // las filas, quedaban tipos sueltos («Mat Pilates») sin ninguna clase.

  // ── Instructoras que faltan: se crean (si quien importa gestiona el equipo) ──
  // Se apuntan aquí y se insertan más abajo, ya con las clases validadas, solo las
  // que de verdad van a tener alguna (misma regla que los tipos de clase).
  const nuevasInstructoras: { id: string; nombre: string; color: string }[] = [];
  if (puedeGestionarEquipo(sesion.rol)) {
    for (const f of filas) {
      const nombre = (f.instructor ?? '').trim();
      if (nombre.length < 2 || instructorPorNombre.has(norm(nombre))) continue;
      const id = `inst-${uid()}`;
      nuevasInstructoras.push({ id, nombre, color: COLORES_INSTRUCTORA[(instructorPorNombre.size + nuevasInstructoras.length) % COLORES_INSTRUCTORA.length] });
      instructorPorNombre.set(norm(nombre), id);
    }
  }

  // ── Expansión de filas → sesiones concretas ────────────────────────────────
  interface Pendiente { tipoId: string; salaId: string | null; instructorId: string | null; inicio: string; fin: string; aforo: number; serieId: string | null; fila: number; clase: string }
  const pendientes: Pendiente[] = [];
  const ahoraMs = Date.now();
  const errores: { fila: number; motivo: string }[] = [];
  let sinInstructor = 0, sinSala = 0;

  filas.forEach((f, i) => {
    if (pendientes.length >= MAX_SESIONES) return;
    const nombre = (f.clase ?? '').trim();
    const tipo = nombre ? tipoPorNombre.get(norm(nombre)) : undefined;
    if (!tipo || !f.horaInicio) { errores.push({ fila: i + 1, motivo: 'Fila sin clase u hora válida' }); return; }

    const dur = f.duracion ?? tipo.duracion;
    const horaFin = f.horaFin ?? sumarMinutos(f.horaInicio, dur);

    const instructorId = f.instructor ? instructorPorNombre.get(norm(f.instructor)) ?? null : null;
    if (f.instructor && !instructorId) sinInstructor++;
    const sala = f.sala ? salaPorNombre.get(norm(f.sala)) : undefined;
    if (f.sala && !sala) sinSala++;
    const aforo = f.aforo ?? sala?.capacidad ?? 10;

    // Fechas concretas a generar: una si la fila trae fecha; N si es recurrente.
    const fechas: string[] = [];
    if (f.fecha) {
      fechas.push(f.fecha);
    } else if (f.diaSemana != null) {
      // Primer día >= `desde` que caiga en ese día de la semana.
      let cursor = desde;
      for (let d = 0; d < 7; d++) { if (dowDe(cursor) === f.diaSemana) break; cursor = sumarDias(cursor, 1); }
      for (let s = 0; s < semanas; s++) fechas.push(sumarDias(cursor, s * 7));
    }

    const serieId = fechas.length > 1 ? `serie-${uid()}` : null;
    let futurasDeArchivado = 0;
    for (const fecha of fechas) {
      if (pendientes.length >= MAX_SESIONES) break;
      const inicio = horaParedAInstante(fecha, f.horaInicio, TZ);
      // Una clase que cruza la medianoche (o con la hora de fin antes que la de
      // inicio) la rechaza la base de datos y tumbaba el lote entero.
      if (horaParedAInstante(fecha, horaFin, TZ).getTime() <= inicio.getTime()) {
        if (!errores.some(e => e.fila === i + 1)) errores.push({ fila: i + 1, motivo: `«${nombre}»: la hora de fin (${horaFin}) no es posterior a la de inicio (${f.horaInicio}). No se ha creado.` });
        continue;
      }
      if (tipo.archivado && inicio.getTime() > ahoraMs) { futurasDeArchivado++; continue; }
      pendientes.push({
        tipoId: tipo.id, salaId: sala?.id ?? null, instructorId,
        inicio: inicio.toISOString(),
        fin: horaParedAInstante(fecha, horaFin, TZ).toISOString(),
        aforo, serieId, fila: i + 1, clase: nombre,
      });
    }
    if (futurasDeArchivado > 0) {
      errores.push({
        fila: i + 1,
        motivo: `«${nombre}» está archivada en tu estudio: ${futurasDeArchivado === 1 ? 'su clase futura no se ha creado' : `sus ${futurasDeArchivado} clases futuras no se han creado`}. Recupérala en Configuración → Mis clases y citas y vuelve a importar.`,
      });
    }
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ error: 'Ninguna fila generó sesiones', errores }, { status: 400 });
  }

  // ── Dedup contra lo que ya existe (reimportar no duplica el horario) ───────
  const inicios = pendientes.map(p => p.inicio);
  const desdeVentana = new Date(inicios.reduce((a, b) => (a < b ? a : b)).slice(0, 10) + 'T00:00:00Z');
  // Un día antes: una clase existente que EMPIEZA antes que ninguna del archivo
  // pero acaba dentro de su rango también se pisa con ella.
  desdeVentana.setUTCDate(desdeVentana.getUTCDate() - 1);
  const hastaVentana = pendientes.map(p => p.fin).reduce((a, b) => (a > b ? a : b));
  // Paginado: la ventana del dedup abarca hasta 12 semanas. Un estudio con 10
  // clases al día pasa de 1000 sesiones y, sin `.range()`, PostgREST devolvía
  // solo las 1000 primeras sin avisar → el dedup no veía el resto y reimportar
  // DUPLICABA el horario entero, que es justo lo que este bloque evita.
  const { data: existentes, error: eDedup } = await catalogo<{ tipo_clase_id: string; inicio: string; fin: string; sala_id: string | null; instructor_id: string | null; cancelada: boolean }>(
    (d, h) => admin
      .from('sesiones').select('tipo_clase_id, inicio, fin, sala_id, instructor_id, cancelada')
      .eq('studio_id', sesion.studioId)
      .gte('inicio', desdeVentana.toISOString())
      .lte('inicio', hastaVentana)
      .order('id').range(d, h),
  );
  // Un fallo aquí NO puede seguir adelante: sin dedup fiable se duplica el
  // horario del estudio, que es peor que no importar. Y va por `errorInterno`
  // para que llegue a Sentry, como sus gemelos.
  if (eDedup) {
    return errorInterno('clases:import:dedup', eDedup,
      'No se ha podido comprobar qué clases tienes ya, así que no se ha creado ninguna clase '
      + 'para no duplicarte el horario. Vuelve a intentarlo.',
      500, { tiposCreados: 0 });
  }
  const yaExiste = new Set((existentes ?? []).map(e => `${e.tipo_clase_id}|${new Date(e.inicio).toISOString()}`));

  const sinDuplicar = pendientes.filter(p => !yaExiste.has(`${p.tipoId}|${p.inicio}`));
  const omitidas = pendientes.length - sinDuplicar.length;

  // Solapes ANTES de escribir: la base de datos no admite dos clases a la vez en
  // la misma sala ni con la misma instructora, y un lote de 500 es atómico, así
  // que una fila que se pisa tumbaba todas. Aquí se aparta y se cuenta.
  const { validas: aInsertar, conflictos } = detectarSolapes(sinDuplicar, (existentes ?? []).map(e => ({
    salaId: e.sala_id, instructorId: e.instructor_id, inicio: e.inicio, fin: e.fin, cancelada: e.cancelada,
  })));
  const nombreSala = (id: string) => salas?.find(x => x.id === id)?.nombre;
  const nombreInstructora = (id: string) => instructores?.find(x => x.id === id)?.nombre;
  const fmtCuando = (iso: string) => new Intl.DateTimeFormat('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(iso));
  // Una fila semanal que se pisa lo hace en cada semana: un aviso por fila y
  // recurso (con cuántas semanas afecta), no doce idénticos.
  const porFilaYRecurso = new Map<string, { c: (typeof conflictos)[number]; n: number }>();
  for (const c of conflictos) {
    const k = `${c.fila}|${c.recurso}`;
    const previo = porFilaYRecurso.get(k);
    if (previo) previo.n++; else porFilaYRecurso.set(k, { c, n: 1 });
  }
  const erroresSolape = [...porFilaYRecurso.values()].map(({ c, n }) => ({
    fila: c.fila,
    motivo: textoConflicto(c, { sala: nombreSala, instructora: nombreInstructora }, fmtCuando)
      + (n > 1 ? ` Pasa en ${n} semanas; no se han creado.` : ' No se ha creado.'),
  }));
  const omitidasPorSolape = new Set(conflictos.map(c => `${c.fila}|${c.inicio}`)).size;
  errores.push(...erroresSolape);

  if (aInsertar.length === 0 && omitidasPorSolape > 0) {
    return errorPeticion(
      `No se ha creado ninguna clase: las ${omitidasPorSolape} se pisan con otras en la misma sala o con la misma instructora. Corrige esas filas y vuelve a subir el archivo.`,
      422, { errores: errores.slice(0, MAX_ERRORES_DEVUELTOS), omitidasPorSolape, tiposCreados: 0 },
    );
  }

  // Tipos nuevos: solo los que de verdad van a tener clases.
  const tipoUsados = new Set(aInsertar.map(p => p.tipoId));
  const tiposAcrear = nuevosTipos.filter(t => tipoUsados.has(t.id as string));
  if (tiposAcrear.length > 0) {
    const { error } = await admin.from('tipos_clase').insert(tiposAcrear);
    if (error) return errorInterno('clases:import:tipos', error,
      'No se han podido crear los tipos de clase del archivo. Revisa que la columna de clase no tenga celdas vacías y vuelve a subirlo.');
  }
  // Instructoras nuevas: solo las que de verdad van a tener clases. Entran en el
  // lote ANTES de las clases para que «Deshacer» las borre aunque algo falle luego.
  const instructorasUsadas = new Set(aInsertar.map(p => p.instructorId).filter((x): x is string => !!x));
  const instructorasAcrear = nuevasInstructoras.filter(i => instructorasUsadas.has(i.id));
  let instructorasFueraDelDeshacer = false;
  if (instructorasAcrear.length > 0) {
    const { error } = await admin.from('instructores').insert(instructorasAcrear.map(i => ({
      id: i.id, studio_id: sesion.studioId, nombre: i.nombre, color: i.color,
      activo: true, rol: 'INSTRUCTOR', email: null, telefono: null, avatar: null, foto_url: null, bio: null, auth_user_id: null,
    })));
    if (error) {
      // Los tipos nuevos que ya se crearon tampoco se quedan sueltos.
      const sueltosT = tiposAcrear.map(t => t.id as string);
      if (sueltosT.length > 0) await admin.from('tipos_clase').delete().in('id', sueltosT).eq('studio_id', sesion.studioId);
      return errorInterno('clases:import:instructoras', error,
        'No se han podido crear las instructoras del archivo. Dalas de alta en Equipo y vuelve a subirlo.');
    }
    if (batchId) {
      instructorasFueraDelDeshacer = !(await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'instructores', ids: instructorasAcrear.map(i => i.id) }));
    }
  }
  // Los tipos que se quedan solo se registran en el lote de deshacer cuando se
  // sabe cuáles (abajo, al terminar o al fallar): `registrarIdsBatch` solo añade.
  const tiposCreadosIds = new Set<string>();

  let creadas = 0;
  const idsCreados: string[] = [];
  for (let i = 0; i < aInsertar.length; i += LOTE) {
    const lote = aInsertar.slice(i, i + LOTE).map(p => ({
      id: `ses-${uid()}`, studio_id: sesion.studioId, tipo_clase_id: p.tipoId,
      sala_id: p.salaId, instructor_id: p.instructorId,
      inicio: p.inicio, fin: p.fin, aforo_maximo: p.aforo,
      cancelada: false, notas: null, precio_puntual: null, serie_id: p.serieId,
    }));
    const { error } = await admin.from('sesiones').insert(lote);
    if (error) {
      // Los tipos nuevos sin ninguna clase creada no se quedan sueltos.
      const sueltos = tiposAcrear.map(t => t.id as string).filter(id => !tiposCreadosIds.has(id));
      if (sueltos.length > 0) await admin.from('tipos_clase').delete().in('id', sueltos).eq('studio_id', sesion.studioId);
      // Y las instructoras creadas que se quedaron sin ninguna clase.
      const conClase = new Set(aInsertar.slice(0, creadas).map(p => p.instructorId));
      const sinClase = instructorasAcrear.map(i => i.id).filter(id => !conClase.has(id));
      if (sinClase.length > 0) await admin.from('instructores').delete().in('id', sinClase).eq('studio_id', sesion.studioId);
      if (batchId) {
        if (idsCreados.length > 0) await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'sesiones', ids: idsCreados });
        if (tiposCreadosIds.size > 0) await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'tipos_clase', ids: [...tiposCreadosIds] });
      }
      // La causa real, no «revisa sala y hora»: casi siempre es que otra clase se
      // ha cruzado mientras se importaba (los solapes del archivo ya se apartaron).
      const motivo = error.code === '23P01'
        ? 'Otra clase ha ocupado esa sala o esa instructora a la misma hora mientras importábamos. Vuelve a subir el archivo: las ya creadas no se duplican.'
        : error.code === '23503'
          ? 'Una sala, instructora o tipo de clase del archivo ya no existe en tu estudio. Revísalos y vuelve a subir el archivo: las ya creadas no se duplican.'
          : 'Vuelve a subir el archivo: las ya creadas no se duplican.';
      return errorInterno('clases:import:sesiones', error,
        `Se han creado ${creadas} clases y el proceso se ha detenido ahí. ${motivo}`,
        500, { creadas, omitidasPorSolape, errores: errores.slice(0, MAX_ERRORES_DEVUELTOS), batchAviso: tiposFueraDelDeshacer ? 'No se pudo registrar el lote para deshacer' : null });
    }
    idsCreados.push(...lote.map(l => l.id));
    for (const l of lote) tiposCreadosIds.add(l.tipo_clase_id);
    creadas += lote.length;
  }
  const sesionesFueraDelDeshacer = batchId && idsCreados.length > 0
    ? !(await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'sesiones', ids: idsCreados }))
    : false;
  if (batchId && tiposCreadosIds.size > 0) {
    tiposFueraDelDeshacer = !(await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'tipos_clase', ids: [...tiposCreadosIds] }));
  }
  const batchAviso = sesionesFueraDelDeshacer || tiposFueraDelDeshacer || instructorasFueraDelDeshacer
    ? 'No se pudo registrar el lote para deshacer'
    : null;

  // El paso donde se pierde más de la mitad de los estudios: 4 de 10 llegan a
  // tener alguna clase programada, y sin clases la página pública no tiene
  // nada que enseñar.
  if (creadas > 0) {
    capturar(sesion.studioId, {
      nombre: 'horario_creado',
      props: { origen: body?.origen === 'onboarding' ? 'onboarding' : 'importacion', sesiones: creadas },
    });
  }

  return NextResponse.json({
    ok: true,
    batchAviso,
    creadas,
    omitidas,            // ya existían (reimportación)
    tiposCreados: tiposCreadosIds.size,
    instructorasCreadas: instructorasAcrear.map(i => i.nombre), // dadas de alta desde el archivo
    omitidasPorSolape,   // se pisaban con otra clase (sala o instructora): no se crearon
    sinInstructor,       // filas cuya instructora no se encontró por nombre (y no se pudo crear)
    sinSala,
    errores: errores.slice(0, MAX_ERRORES_DEVUELTOS),
  });
}
