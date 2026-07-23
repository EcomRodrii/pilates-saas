import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { horaParedAInstante } from '@/lib/citas/slots';
import { uid } from '@/lib/utils';
import type { FilaCita } from '@/lib/csv';
import { errorInterno } from '@/lib/errores-servidor';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';

// Una importación con miles de filas hace varios lotes secuenciales de INSERT;
// damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

// Importación de CITAS 1:1 desde CSV — última pieza de la migración asistida.
//
// A diferencia de las reservas, una cita NO necesita que exista una sesión: se
// crea entera con su hora y duración. Solo hace falta la socia (por email).
//
// El servicio se empareja con el catálogo `citas_servicios` por nombre: si
// existe, hereda su duración y precio cuando el CSV no los trae. Si no existe,
// NO se crea — el catálogo define qué se puede auto-reservar, y darlo de alta a
// espaldas del estudio abriría reservas públicas que nadie ha autorizado. El
// tipo se deduce del texto (el CHECK de la BD solo admite 4 valores).
//
// La instructora solo se empareja por nombre; si no cuadra, la cita entra sin
// instructora en vez de inventar a alguien.
//
// No se usa la RPC atómica `reservar_cita`: esa protege la auto-reserva pública
// de solapes, pero aquí manda el histórico. Si el programa anterior tenía dos
// citas pisándose, se importan igual y se avisa.

const MAX_FILAS = 5000;
const LOTE = 500;
const TZ = 'Europe/Madrid';
const DURACION_POR_DEFECTO = 60;

const RE_DIACRITICOS = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

const ACTIVAS = ['PENDIENTE', 'CONFIRMADA'];

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesionStaff.rol !== 'PROPIETARIO' && sesionStaff.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar citas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaCita[]; batchId?: string } | null;
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

  const studioId = sesionStaff.studioId;

  const [{ data: socios, error: eS }, { data: servicios, error: eSv }, { data: instructores, error: eI }, { data: citasExist, error: eC }] =
    await Promise.all([
      admin.from('socios').select('id, email').eq('studio_id', studioId).is('borrado_en', null),
      admin.from('citas_servicios').select('id, nombre, tipo, duracion_min, precio').eq('studio_id', studioId),
      admin.from('instructores').select('id, nombre').eq('studio_id', studioId),
      admin.from('citas').select('socio_id, inicio, estado').eq('studio_id', studioId),
    ]);
  if (eS || eSv || eI || eC) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase().trim(), s.id);

  const servicioPorNombre = new Map<string, { id: string; tipo: string; duracion: number; precio: number | null }>();
  for (const s of servicios ?? []) {
    servicioPorNombre.set(norm(s.nombre), {
      id: s.id, tipo: s.tipo, duracion: s.duracion_min ?? DURACION_POR_DEFECTO, precio: s.precio,
    });
  }

  const instructorPorNombre = new Map<string, string>();
  for (const i of instructores ?? []) instructorPorNombre.set(norm(i.nombre), i.id);

  // Dedup: no hay índice único en `citas`, así que se compara (socia, inicio).
  const existentes = new Set(
    (citasExist ?? [])
      .filter(c => c.socio_id && c.estado !== 'CANCELADA')
      .map(c => `${c.socio_id}|${new Date(c.inicio as string).toISOString()}`),
  );

  interface Pendiente {
    socioId: string; instructorId: string | null; servicioId: string | null;
    tipo: string; inicio: string; fin: string; estado: string; precio: number | null;
  }
  const pendientes: Pendiente[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  let sinSocia = 0, sinInstructor = 0, duplicadas = 0, sinServicioCatalogo = 0;
  const vistas = new Set<string>();

  filas.forEach((f, i) => {
    const socioId = socioPorEmail.get((f.email ?? '').toLowerCase().trim());
    if (!socioId) {
      sinSocia++;
      errores.push({ fila: i + 1, motivo: `No hay ninguna socia con el email ${f.email}` });
      return;
    }
    if (!f.fecha || !f.horaInicio) {
      errores.push({ fila: i + 1, motivo: 'Fecha u hora vacías' });
      return;
    }

    const servicio = f.servicio ? servicioPorNombre.get(norm(f.servicio)) : undefined;
    if (f.servicio && !servicio) sinServicioCatalogo++;

    const duracion = f.duracion ?? servicio?.duracion ?? DURACION_POR_DEFECTO;
    const inicio = horaParedAInstante(f.fecha, f.horaInicio, TZ);
    const inicioISO = inicio.toISOString();
    const finISO = new Date(inicio.getTime() + duracion * 60000).toISOString();

    const clave = `${socioId}|${inicioISO}`;
    if (ACTIVAS.includes(f.estado) && (existentes.has(clave) || vistas.has(clave))) { duplicadas++; return; }
    if (ACTIVAS.includes(f.estado)) vistas.add(clave);

    const instructorId = f.instructor ? instructorPorNombre.get(norm(f.instructor)) ?? null : null;
    if (f.instructor && !instructorId) sinInstructor++;

    pendientes.push({
      socioId, instructorId,
      servicioId: servicio?.id ?? null,
      // El tipo del catálogo manda sobre el deducido del texto: es el que el
      // estudio configuró de verdad.
      tipo: servicio?.tipo ?? f.tipo,
      inicio: inicioISO, fin: finISO,
      estado: f.estado,
      precio: f.precio ?? servicio?.precio ?? null,
    });
  });

  if (pendientes.length === 0) {
    return NextResponse.json(
      { error: 'Ninguna fila se pudo emparejar', sinSocia, duplicadas, errores: errores.slice(0, 50) },
      { status: 400 },
    );
  }

  let importadas = 0;
  const idsCreados: string[] = [];
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE).map(p => ({
      id: `cita-${uid()}`, studio_id: studioId, socio_id: p.socioId, instructor_id: p.instructorId,
      servicio_id: p.servicioId, tipo: p.tipo, inicio: p.inicio, fin: p.fin,
      estado: p.estado, precio: p.precio, notas: null,
      pagada: p.estado === 'COMPLETADA', creado_en: new Date().toISOString(),
    }));
    const { error } = await admin.from('citas').insert(lote);
    if (error) {
      if (batchId && idsCreados.length > 0) {
        await registrarIdsBatch(admin, { studioId, batchId, entidad: 'citas', ids: idsCreados });
      }
      return errorInterno('citas/import:POST', error, 'No se pudieron guardar las citas.', 500, { importadas });
    }
    idsCreados.push(...lote.map(l => l.id));
    importadas += lote.length;
  }
  const batchAviso = batchId && idsCreados.length > 0
    ? (await registrarIdsBatch(admin, { studioId, batchId, entidad: 'citas', ids: idsCreados })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  return NextResponse.json({
    ok: true,
    batchAviso,
    importadas,
    duplicadas,             // ya estaban: reimportar no duplica
    sinSocia,               // email que no existe en el estudio
    sinInstructor,          // nombre de instructora que no cuadra
    sinServicioCatalogo,    // servicio no está en el catálogo: se dedujo el tipo del texto
    errores: errores.slice(0, 50),
  });
}
