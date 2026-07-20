import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { horaParedAInstante } from '@/lib/citas/slots';
import { uid } from '@/lib/utils';
import type { FilaClase } from '@/lib/csv';

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
// Instructora y sala solo se EMPAREJAN por nombre: si no cuadran se deja el hueco
// vacío y se informa, en vez de inventar personas o salas que no existen.

const MAX_FILAS = 2000;
const MAX_SESIONES = 5000;   // techo duro de sesiones generadas
const MAX_SEMANAS = 12;
const LOTE = 500;
const TZ = 'Europe/Madrid';

// Paleta para los tipos de clase creados al vuelo (el estudio los puede recolorear).
const COLORES = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6', '#A855F7'];

const RE_DIACRITICOS = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

interface Cuerpo {
  rows?: FilaClase[];
  semanas?: number;   // cuántas semanas expandir las filas recurrentes
  desde?: string;     // 'YYYY-MM-DD' — inicio de la expansión
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
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar el horario' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Cuerpo | null;
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
  const [{ data: tipos, error: eT }, { data: instructores, error: eI }, { data: salas, error: eS }] = await Promise.all([
    admin.from('tipos_clase').select('id, nombre, duracion_minutos').eq('studio_id', sesion.studioId),
    admin.from('instructores').select('id, nombre').eq('studio_id', sesion.studioId),
    admin.from('salas').select('id, nombre, capacidad').eq('studio_id', sesion.studioId),
  ]);
  if (eT || eI || eS) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const tipoPorNombre = new Map<string, { id: string; duracion: number }>();
  for (const t of tipos ?? []) tipoPorNombre.set(norm(t.nombre), { id: t.id, duracion: t.duracion_minutos ?? 60 });
  const instructorPorNombre = new Map<string, string>();
  for (const i of instructores ?? []) instructorPorNombre.set(norm(i.nombre), i.id);
  const salaPorNombre = new Map<string, { id: string; capacidad: number }>();
  for (const s of salas ?? []) salaPorNombre.set(norm(s.nombre), { id: s.id, capacidad: s.capacidad ?? 10 });

  // ── Tipos de clase que faltan: se crean (sin ellos no hay sesión posible) ──
  const nuevosTipos: Record<string, unknown>[] = [];
  let colorIdx = tipoPorNombre.size;
  for (const f of filas) {
    const nombre = (f.clase ?? '').trim();
    if (!nombre || tipoPorNombre.has(norm(nombre))) continue;
    const dur = f.duracion ?? (f.horaFin && f.horaInicio
      ? (Number(f.horaFin.slice(0, 2)) * 60 + Number(f.horaFin.slice(3))) - (Number(f.horaInicio.slice(0, 2)) * 60 + Number(f.horaInicio.slice(3)))
      : 60);
    const id = `tc-${uid()}`;
    tipoPorNombre.set(norm(nombre), { id, duracion: dur > 0 ? dur : 60 });
    nuevosTipos.push({
      id, studio_id: sesion.studioId, nombre,
      color: COLORES[colorIdx++ % COLORES.length],
      duracion_minutos: dur > 0 ? dur : 60,
      descripcion: null, nivel: 'TODOS', foto_url: null,
    });
  }
  if (nuevosTipos.length > 0) {
    const { error } = await admin.from('tipos_clase').insert(nuevosTipos);
    if (error) return errorInterno('clases:import:tipos', error,
      'No se han podido crear los tipos de clase del archivo. Revisa que la columna de clase no tenga celdas vacías y vuelve a subirlo.');
  }

  // ── Expansión de filas → sesiones concretas ────────────────────────────────
  interface Pendiente { tipoId: string; salaId: string | null; instructorId: string | null; inicio: string; fin: string; aforo: number; serieId: string | null }
  const pendientes: Pendiente[] = [];
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
    for (const fecha of fechas) {
      if (pendientes.length >= MAX_SESIONES) break;
      pendientes.push({
        tipoId: tipo.id, salaId: sala?.id ?? null, instructorId,
        inicio: horaParedAInstante(fecha, f.horaInicio, TZ).toISOString(),
        fin: horaParedAInstante(fecha, horaFin, TZ).toISOString(),
        aforo, serieId,
      });
    }
  });

  if (pendientes.length === 0) {
    return NextResponse.json({ error: 'Ninguna fila generó sesiones', errores }, { status: 400 });
  }

  // ── Dedup contra lo que ya existe (reimportar no duplica el horario) ───────
  const inicios = pendientes.map(p => p.inicio);
  const { data: existentes } = await admin
    .from('sesiones').select('tipo_clase_id, inicio')
    .eq('studio_id', sesion.studioId)
    .gte('inicio', inicios.reduce((a, b) => (a < b ? a : b)))
    .lte('inicio', inicios.reduce((a, b) => (a > b ? a : b)));
  const yaExiste = new Set((existentes ?? []).map(e => `${e.tipo_clase_id}|${new Date(e.inicio as string).toISOString()}`));

  const aInsertar = pendientes.filter(p => !yaExiste.has(`${p.tipoId}|${p.inicio}`));
  const omitidas = pendientes.length - aInsertar.length;

  let creadas = 0;
  for (let i = 0; i < aInsertar.length; i += LOTE) {
    const lote = aInsertar.slice(i, i + LOTE).map(p => ({
      id: `ses-${uid()}`, studio_id: sesion.studioId, tipo_clase_id: p.tipoId,
      sala_id: p.salaId, instructor_id: p.instructorId,
      inicio: p.inicio, fin: p.fin, aforo_maximo: p.aforo,
      cancelada: false, notas: null, precio_puntual: null, serie_id: p.serieId,
    }));
    const { error } = await admin.from('sesiones').insert(lote);
    if (error) return errorInterno('clases:import:sesiones', error,
      `Se han creado ${creadas} clases y el proceso se ha detenido ahí. `
      + 'Revisa que todas las filas tengan sala y hora, y vuelve a subir el archivo.',
      500, { creadas });
    creadas += lote.length;
  }

  return NextResponse.json({
    ok: true,
    creadas,
    omitidas,            // ya existían (reimportación)
    tiposCreados: nuevosTipos.length,
    sinInstructor,       // filas cuya instructora no se encontró por nombre
    sinSala,
    errores: errores.slice(0, 50),
  });
}
