import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Ausencias de instructoras (vacaciones / baja médica / otro). Al crearlas se
// materializan los bloqueos día a día en instructora_disponibilidad_excepciones
// (lo que ya lee rankear_candidatas), así la instructora deja de salir en el
// ranking de sustituciones durante esas fechas. Borrar la ausencia borra sus
// bloqueos en cascada (FK ON DELETE CASCADE).
//
// Todo acotado al estudio de la sesión de staff: nunca se fía del cliente.

export const dynamic = 'force-dynamic';

const TIPOS = ['VACACIONES', 'BAJA_MEDICA', 'OTRO'];
const MAX_DIAS = 366; // tope defensivo: una ausencia no materializa años de bloqueos

function dias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (d <= fin && out.length <= MAX_DIAS) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ items: [] });

  const instructorId = req.nextUrl.searchParams.get('instructorId');
  let q = admin.from('instructora_ausencias')
    .select('id, instructor_id, tipo, desde, hasta, motivo')
    .eq('studio_id', staff.studioId)
    .order('desde', { ascending: false });
  if (instructorId) q = q.eq('instructor_id', instructorId);
  const { data } = await q;

  return NextResponse.json({
    items: (data ?? []).map(r => ({
      id: r.id, instructorId: r.instructor_id, tipo: r.tipo,
      desde: r.desde, hasta: r.hasta, motivo: r.motivo ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as
    | { instructorId?: string; tipo?: string; desde?: string; hasta?: string; motivo?: string }
    | null;
  const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  if (!b?.instructorId || !b?.tipo || !TIPOS.includes(b.tipo)) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }
  if (!RE_FECHA.test(b.desde ?? '') || !RE_FECHA.test(b.hasta ?? '') || b.hasta! < b.desde!) {
    return NextResponse.json({ error: 'Fechas no válidas' }, { status: 400 });
  }

  // La instructora debe ser de SU estudio.
  const { data: instr } = await admin.from('instructores')
    .select('id, nombre').eq('id', b.instructorId).eq('studio_id', staff.studioId).maybeSingle();
  if (!instr) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  const fechas = dias(b.desde!, b.hasta!);
  if (fechas.length > MAX_DIAS) {
    return NextResponse.json({ error: 'El periodo es demasiado largo (máximo 1 año)' }, { status: 400 });
  }

  const id = `aus-${crypto.randomUUID()}`;
  const { error } = await admin.from('instructora_ausencias').insert({
    id, studio_id: staff.studioId, instructor_id: b.instructorId, tipo: b.tipo,
    desde: b.desde, hasta: b.hasta, motivo: b.motivo?.trim().slice(0, 300) || null,
  });
  if (error) {
    console.error('[equipo:ausencias]', error.message);
    return NextResponse.json({ error: 'No se ha podido guardar la ausencia' }, { status: 500 });
  }

  // Materializa un bloqueo de TODO EL DÍA por fecha (hora_inicio/fin NULL).
  const bloqueos = fechas.map(f => ({
    id: `exc-${crypto.randomUUID()}`,
    studio_id: staff.studioId, instructor_id: b.instructorId,
    fecha: f, hora_inicio: null, hora_fin: null, tipo: 'bloqueo', ausencia_id: id,
  }));
  const { error: errExc } = await admin.from('instructora_disponibilidad_excepciones').insert(bloqueos);
  if (errExc) console.error('[equipo:ausencias] bloqueos', errExc.message);

  // Clases YA programadas de esa instructora dentro del periodo: es lo accionable
  // (hay que cubrirlas). Se cuentan para devolverlo y para el aviso.
  const { data: choques } = await admin.from('sesiones')
    .select('id').eq('studio_id', staff.studioId).eq('instructor_id', b.instructorId)
    .eq('cancelada', false)
    .gte('inicio', `${b.desde}T00:00:00`).lte('inicio', `${b.hasta}T23:59:59`);
  const clasesAfectadas = choques?.length ?? 0;

  // Notification Engine: la dueña ve la ausencia y, sobre todo, cuántas clases
  // quedan sin cubrir en esas fechas.
  const { emitirInstructoraAusencia } = await import('@/lib/notifications/emit');
  await emitirInstructoraAusencia(admin, {
    studioId: staff.studioId, ausenciaId: id,
    instructora: (instr.nombre as string | null) ?? 'Una instructora',
    tipo: b.tipo, desde: b.desde!, hasta: b.hasta!, clasesAfectadas,
  });

  return NextResponse.json({ ok: true, id, clasesAfectadas });
}

export async function DELETE(req: NextRequest) {
  const staff = await verificarSesionStaff(req);
  if (!staff) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const b = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!b?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  // Los bloqueos se borran solos (FK ON DELETE CASCADE).
  const { error } = await admin.from('instructora_ausencias')
    .delete().eq('id', b.id).eq('studio_id', staff.studioId);
  if (error) return NextResponse.json({ error: 'No se ha podido borrar' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
