import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { uid } from '@/lib/utils';

// Cambiar el estado de una candidatura — "revisar" (abrir, sin endpoint
// propio), "descartar"→rechazada, "contactar"→contactada, "avanzar"→el
// siguiente paso de la secuencia, "guardar" es /api/network/favoritos ya
// existente, reutilizado tal cual (no un estado más aquí).
//
// Sin política INSERT/UPDATE para authenticated en red_candidaturas
// (migración 20260814050000): la máquina de estados se valida SOLO aquí,
// con service-role.
const SECUENCIA = ['recibida', 'contactada', 'entrevista', 'propuesta', 'aceptada'] as const;
const ESTADOS_TERMINALES = new Set(['aceptada', 'rechazada', 'retirada']);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar candidaturas.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { estado?: unknown; notasEstudio?: unknown } | null;
  const estadoDestino = typeof body?.estado === 'string' ? body.estado : null;
  if (!estadoDestino) return errorPeticion('Falta el estado.');
  if (!(SECUENCIA as readonly string[]).includes(estadoDestino) && estadoDestino !== 'rechazada') {
    return errorPeticion('Estado no válido.');
  }

  const { id } = await params;
  const { data: fila, error: errLeer } = await admin
    .from('red_candidaturas')
    .select('id, studio_id, perfil_id, estado, solicitud_id')
    .eq('id', id)
    .maybeSingle();
  if (errLeer) return errorInterno('network:candidaturas:id:leer', errLeer, 'No se ha podido leer la candidatura.');
  if (!fila || fila.studio_id !== sesion.studioId) return NextResponse.json({ error: 'Candidatura no encontrada.' }, { status: 404 });
  if (ESTADOS_TERMINALES.has(fila.estado)) {
    return errorPeticion('Esta candidatura ya se ha resuelto y no se puede cambiar de estado.');
  }

  if (estadoDestino !== 'rechazada') {
    const idxActual = SECUENCIA.indexOf(fila.estado as (typeof SECUENCIA)[number]);
    const idxDestino = SECUENCIA.indexOf(estadoDestino as (typeof SECUENCIA)[number]);
    if (idxActual === -1 || idxDestino !== idxActual + 1) {
      return errorPeticion(`No se puede pasar de "${fila.estado}" a "${estadoDestino}" directamente.`);
    }
  }

  const ahora = new Date().toISOString();
  const update: Record<string, unknown> = { estado: estadoDestino, actualizado_en: ahora };
  if (ESTADOS_TERMINALES.has(estadoDestino)) update.resuelto_en = ahora;
  if (typeof body?.notasEstudio === 'string') update.notas_estudio = body.notasEstudio.trim() || null;

  // Puente con la formalización ya construida (#1073): "aceptada" activa el
  // hilo de contacto/chat SIN reinventar el alta a equipo — a partir de ahí,
  // red_mensajes y /api/network/formalizacion funcionan sin tocar código.
  let solicitudId = fila.solicitud_id;
  if (estadoDestino === 'aceptada' && !solicitudId) {
    const { data: existente } = await admin
      .from('red_solicitudes_contacto')
      .select('id')
      .eq('perfil_id', fila.perfil_id).eq('studio_id', sesion.studioId).eq('estado', 'aceptada')
      .order('creado_en', { ascending: false }).limit(1).maybeSingle();
    if (existente) {
      solicitudId = existente.id;
    } else {
      const nuevaId = `redsol-${uid()}`;
      // Se inserta YA aceptada: aceptar la candidatura ES el consentimiento
      // de las dos partes (a diferencia del flujo normal de contacto, donde
      // el estudio propone y la instructora acepta después). El índice
      // único parcial de la tabla solo cubre filas 'pendiente', así que no
      // colisiona con esta inserción directa en 'aceptada'.
      const { error: errSolicitud } = await admin.from('red_solicitudes_contacto').insert({
        id: nuevaId,
        perfil_id: fila.perfil_id,
        studio_id: sesion.studioId,
        solicitado_por: sesion.userId,
        estado: 'aceptada',
        resuelto_en: ahora,
      });
      if (errSolicitud) return errorInterno('network:candidaturas:id:puente', errSolicitud, 'No se ha podido activar el contacto.');
      solicitudId = nuevaId;
    }
    update.solicitud_id = solicitudId;
  }

  const { error } = await admin.from('red_candidaturas').update(update).eq('id', id);
  if (error) return errorInterno('network:candidaturas:id:PATCH', error, 'No se ha podido cambiar el estado de la candidatura.');

  return NextResponse.json({ ok: true, solicitudId });
}
