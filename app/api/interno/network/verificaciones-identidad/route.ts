import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// Fase 3 del rediseño de Tentare Network — cola de verificación de
// identidad. A diferencia de /api/interno/network/verificaciones (que es
// SOLO LECTURA: la experiencia laboral la confirma el estudio implicado),
// aquí SÍ resuelve el equipo de Tentare — es exactamente la pieza que
// faltaba tras diseñar el modelo de datos (red_verificaciones_identidad,
// service-role-only para UPDATE, sin policy de escritura para
// authenticated en ninguna dirección).
export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const estado = req.nextUrl.searchParams.get('estado') ?? 'pendiente';

  const { data, error } = await db
    .from('red_verificaciones_identidad')
    .select('id, estado, motivo_rechazo, documento_path, documento_path_reverso, creado_en, resuelto_en, red_perfiles ( id, nombre, slug )')
    .eq('estado', estado)
    .order('creado_en', { ascending: true }) // más antigua primero: la cola se vacía por orden de llegada
    .limit(500);
  if (error) return NextResponse.json({ error: 'No se han podido cargar las verificaciones.' }, { status: 500 });

  type FilaCruda = {
    id: string; estado: string; motivo_rechazo: string | null; documento_path: string; documento_path_reverso: string | null;
    creado_en: string; resuelto_en: string | null;
    red_perfiles: { id: string; nombre: string; slug: string | null } | null;
  };
  // El path crudo del bucket privado no viaja a este listado (igual que ya
  // no viajaba `documento_path` antes de este cambio) — solo un booleano
  // para que el panel sepa si pintar el botón "Ver reverso". La URL firmada
  // real se pide aparte, por documento, en el endpoint .../documento.
  const verificaciones = ((data ?? []) as unknown as FilaCruda[]).map(f => ({
    id: f.id,
    estado: f.estado,
    motivoRechazo: f.motivo_rechazo,
    creadoEn: f.creado_en,
    resueltoEn: f.resuelto_en,
    tieneReverso: f.documento_path_reverso != null,
    perfilId: f.red_perfiles?.id ?? null,
    perfilNombre: f.red_perfiles?.nombre ?? 'Perfil eliminado',
    perfilSlug: f.red_perfiles?.slug ?? null,
  }));

  return NextResponse.json({ verificaciones });
}

export async function PATCH(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; aprobar?: unknown; motivo?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const aprobar = typeof body?.aprobar === 'boolean' ? body.aprobar : null;
  const motivo = typeof body?.motivo === 'string' ? body.motivo.trim() : '';
  if (!id || aprobar === null) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
  // Motivo obligatorio al rechazar — validado aquí Y por el CHECK de la BD
  // (red_verificaciones_identidad_motivo_si_rechazado): el mensaje de aquí
  // es el que ve quien modera, el de la BD es la cerradura real.
  if (!aprobar && !motivo) return NextResponse.json({ error: 'Indica el motivo del rechazo.' }, { status: 400 });

  const { data: fila, error: errLeer } = await db
    .from('red_verificaciones_identidad')
    .select('id, perfil_id, estado')
    .eq('id', id)
    .maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se ha podido leer la verificación.' }, { status: 500 });
  if (!fila) return NextResponse.json({ error: 'Verificación no encontrada.' }, { status: 404 });
  if (fila.estado !== 'pendiente' && fila.estado !== 'en_revision') {
    return NextResponse.json({ error: 'Esta verificación ya está resuelta.' }, { status: 409 });
  }

  const ahora = new Date().toISOString();
  // .in('estado', [...]) también en el UPDATE (no solo en el SELECT de
  // arriba): sin esto, dos admins resolviendo la misma fila casi a la vez
  // (o un doble clic) pasan los dos la lectura en 'pendiente' y los dos
  // UPDATE se ejecutan sin error — gana el que escribe último, en silencio.
  // Con la condición en el WHERE, el segundo UPDATE afecta a 0 filas y se
  // detecta con `count`.
  const { error, count } = await db
    .from('red_verificaciones_identidad')
    .update({
      estado: aprobar ? 'verificado' : 'rechazado',
      motivo_rechazo: aprobar ? null : motivo,
      resuelto_en: ahora,
      resuelto_por: g.admin.userId,
    }, { count: 'exact' })
    .eq('id', id)
    .in('estado', ['pendiente', 'en_revision']);
  if (error) return NextResponse.json({ error: 'No se ha podido actualizar la verificación.' }, { status: 500 });
  if (!count) return NextResponse.json({ error: 'Esta verificación ya está resuelta.' }, { status: 409 });

  // "Perfil verificado" solo por criterios (README) — este es el ÚNICO
  // sitio del repo que escribe red_perfiles.identidad_verificada_en
  // (columna que existía desde la Fase 1 pero nunca tuvo caller real).
  //
  // Si este segundo UPDATE falla, se deshace el primero (compensación
  // manual, no una transacción real — no hay RPC compartida entre estas
  // dos tablas todavía): sin esto, la verificación quedaría 'verificado'
  // pero el perfil sin identidad_verificada_en, Y el guard de arriba
  // bloquearía cualquier reintento con un 409 "ya resuelta" — un estado
  // atascado sin salida. Revertir deja la fila en 'pendiente' de nuevo,
  // reintentable.
  if (aprobar) {
    const { error: errPerfil } = await db
      .from('red_perfiles')
      .update({ identidad_verificada_en: ahora })
      .eq('id', fila.perfil_id);
    if (errPerfil) {
      await db
        .from('red_verificaciones_identidad')
        .update({ estado: 'pendiente', resuelto_en: null, resuelto_por: null })
        .eq('id', id);
      return NextResponse.json({ error: 'No se ha podido actualizar el perfil. Vuelve a intentarlo.' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
