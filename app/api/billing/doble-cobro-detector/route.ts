/**
 * PAY-5: Endpoint privado para detectar y revisar dobles cobros
 *
 * GET /api/billing/doble-cobro-detector
 *   Devuelve lista de dobles cobros PENDIENTE_REVISION para este estudio.
 *
 * POST /api/billing/doble-cobro-detector
 *   Ejecuta la detección desde cero en los últimos 7 días.
 *   Uso: solo PROPIETARIO (via bisagra desde otro endpoint).
 *
 * PUT /api/billing/doble-cobro-detector/:id
 *   Marca un doble cobro como CONFIRMADO, FALSO_POSITIVO o RESUELTO
 *   con notas opcionales. Cambio de estado = PAY-6 (reembolso).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { detectarYRegistrarDoblesCobros, obtenerDoblesCobrosEnRevision } from '@/lib/billing/detectar-doble-cobro';
import { puedeVerEstudio } from '@/lib/permisos-reglas';

export async function GET(request: NextRequest) {
  try {
    const sesion = await getSupabaseClient();
    if (!sesion?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Resolver studio_id desde query param o sesión activa
    const studioId = request.nextUrl.searchParams.get('studio_id');
    if (!studioId) {
      return NextResponse.json({ error: 'Parámetro studio_id requerido' }, { status: 400 });
    }

    // Comprobar permiso: solo PROPIETARIO puede ver esto
    const perm = await puedeVerEstudio(sesion.user.id, studioId);
    if (!perm || !perm.puedeMoverDinero) {
      return NextResponse.json({ error: 'No tienes permiso para ver dobles cobros' }, { status: 403 });
    }

    // Obtener lista de dobles cobros PENDIENTE_REVISION
    const dobles = await obtenerDoblesCobrosEnRevision(studioId);

    return NextResponse.json({
      ok: true,
      studioId,
      total: dobles.length,
      doblesCobros: dobles,
    });
  } catch (err) {
    console.error('[doble-cobro-detector GET]', err);
    return NextResponse.json(
      { error: 'Error al obtener dobles cobros' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const sesion = await getSupabaseClient();
    if (!sesion?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const studioId = body.studio_id;
    const diasAtras = body.dias_atras ?? 7;

    if (!studioId) {
      return NextResponse.json({ error: 'Parámetro studio_id requerido' }, { status: 400 });
    }

    // Permiso: PROPIETARIO
    const perm = await puedeVerEstudio(sesion.user.id, studioId);
    if (!perm || !perm.puedeMoverDinero) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Ejecutar detección y registro
    const resultado = await detectarYRegistrarDoblesCobros(diasAtras);

    return NextResponse.json({
      ok: true,
      studioId,
      diasAtras,
      detectados: resultado.detectados,
      registrados: resultado.registrados,
      errores: resultado.errores,
    });
  } catch (err) {
    console.error('[doble-cobro-detector POST]', err);
    return NextResponse.json(
      { error: 'Error al detectar dobles cobros' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sesion = await getSupabaseClient();
    if (!sesion?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { id, estado, notas } = body;

    if (!id || !estado) {
      return NextResponse.json(
        { error: 'Parámetros id y estado requeridos' },
        { status: 400 }
      );
    }

    if (!['CONFIRMADO', 'FALSO_POSITIVO', 'RESUELTO'].includes(estado)) {
      return NextResponse.json(
        { error: 'Estado inválido' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Servicio no configurado' }, { status: 500 });
    }

    // Leer el registro actual para verificar permiso
    const { data: actual, error: readError } = await admin
      .from('dobles_cobros_detectados')
      .select('studio_id')
      .eq('id', id)
      .single();

    if (readError || !actual) {
      return NextResponse.json({ error: 'Doble cobro no encontrado' }, { status: 404 });
    }

    // Permiso: PROPIETARIO del estudio
    const perm = await puedeVerEstudio(sesion.user.id, actual.studio_id);
    if (!perm || !perm.puedeMoverDinero) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Actualizar estado
    const updatePayload: Record<string, unknown> = {
      estado,
      actualizado_en: new Date().toISOString(),
    };

    if (notas) {
      updatePayload.notas = notas;
    }

    if (estado === 'RESUELTO') {
      updatePayload.resuelto_en = new Date().toISOString();
      updatePayload.revisado_por = sesion.user.email ?? sesion.user.id;
    }

    const { data, error } = await admin
      .from('dobles_cobros_detectados')
      .update(updatePayload)
      .eq('id', id)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id,
      estado,
      notas,
      mensaje: `Doble cobro marcado como ${estado}`,
    });
  } catch (err) {
    console.error('[doble-cobro-detector PUT]', err);
    return NextResponse.json(
      { error: 'Error al actualizar doble cobro' },
      { status: 500 }
    );
  }
}
