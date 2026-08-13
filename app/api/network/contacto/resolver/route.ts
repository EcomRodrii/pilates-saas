import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { emitirRedContactoAceptado } from '@/lib/notifications/emit';

// Aceptar/rechazar una solicitud de contacto — docs/NETWORK-IMPLEMENTATION-
// PLAN.md §6/§9. Al aceptar, el email/teléfono de contacto del perfil se
// revela AQUÍ y solo aquí: en el envío de la notificación al solicitante,
// nunca en un listado ni en la API de búsqueda/detalle.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown; aceptar?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  const aceptar = typeof body?.aceptar === 'boolean' ? body.aceptar : null;
  if (!id || aceptar == null) return errorPeticion('Faltan datos.');

  const { data: perfil } = await admin
    .from('red_perfiles').select('id, nombre, email_contacto, telefono_contacto').eq('auth_user_id', usuario.userId).maybeSingle();
  if (!perfil) return errorPeticion('No tienes ningún perfil.', 404);

  const { data: solicitud } = await admin
    .from('red_solicitudes_contacto')
    .select('id, studio_id, solicitado_por, estado')
    .eq('id', id)
    .eq('perfil_id', perfil.id) // nunca resolver una solicitud ajena
    .maybeSingle();
  if (!solicitud) return errorPeticion('Solicitud no encontrada.', 404);
  if (solicitud.estado !== 'pendiente') return errorPeticion('Esta solicitud ya se resolvió.');

  if (aceptar && !perfil.email_contacto) {
    return errorPeticion('Añade un email de contacto en tu perfil antes de aceptar — es lo que se le enviará al estudio.');
  }

  const { error } = await admin
    .from('red_solicitudes_contacto')
    .update({ estado: aceptar ? 'aceptada' : 'rechazada', resuelto_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return errorInterno('network:contacto:resolver', error, 'No se ha podido resolver la solicitud.');

  if (aceptar) {
    await emitirRedContactoAceptado(admin, {
      studioId: solicitud.studio_id as string,
      solicitanteAuthUserId: solicitud.solicitado_por as string,
      solicitudId: solicitud.id as string,
      profesional: perfil.nombre as string,
      emailContacto: perfil.email_contacto as string,
      telefonoContacto: (perfil.telefono_contacto as string | null) ?? null,
    });
  }

  return NextResponse.json({ ok: true });
}
