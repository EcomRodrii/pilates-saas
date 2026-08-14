import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

// Lista de hilos de mensajería (brief §9/§19) — una fila por solicitud de
// contacto ACEPTADA en la que participa quien pregunta, con no-leídos y
// último mensaje. Misma dualidad de auth que app/api/network/mensajes/route.ts:
// se prueba primero como instructora (perfil propio), luego como staff de
// estudio — nunca las dos cosas a la vez para una misma cuenta.
export interface HiloNetwork {
  solicitudId: string;
  // Solo relleno del lado estudio (para que la ficha de una instructora,
  // app/(dashboard)/network/[perfilId], pueda encontrar "¿ya tengo un hilo
  // con ESTA persona?" sin traerse la lista entera a mano). Del lado
  // instructora siempre null: ella ya sabe qué perfil es el suyo.
  perfilId: string | null;
  nombre: string;
  fotoUrl: string | null;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  noLeidos: number;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  const solicitudesIds: string[] = [];
  const infoPorSolicitud = new Map<string, { nombre: string; fotoUrl: string | null; perfilId: string | null }>();
  let miUserId: string | null = null;

  if (usuario) {
    const { data: perfil } = await admin.from('red_perfiles').select('id').eq('auth_user_id', usuario.userId).maybeSingle();
    if (perfil) {
      const { data, error } = await admin
        .from('red_solicitudes_contacto')
        .select('id, studios ( nombre )')
        .eq('perfil_id', perfil.id).eq('estado', 'aceptada');
      if (error) return errorInterno('network:mensajes:hilos:GET', error, 'No se han podido cargar los mensajes.');
      type Fila = { id: string; studios: { nombre: string | null } | null };
      for (const f of (data ?? []) as unknown as Fila[]) {
        solicitudesIds.push(f.id);
        infoPorSolicitud.set(f.id, { nombre: f.studios?.nombre ?? 'Un estudio', fotoUrl: null, perfilId: null });
      }
      miUserId = usuario.userId;
    }
  } else {
    const sesionStaff = await verificarSesionStaff(req);
    if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { data, error } = await admin
      .from('red_solicitudes_contacto')
      .select('id, perfil_id, red_perfiles ( nombre, foto_url )')
      .eq('studio_id', sesionStaff.studioId).eq('estado', 'aceptada');
    if (error) return errorInterno('network:mensajes:hilos:GET', error, 'No se han podido cargar los mensajes.');
    type Fila = { id: string; perfil_id: string; red_perfiles: { nombre: string | null; foto_url: string | null } | null };
    for (const f of (data ?? []) as unknown as Fila[]) {
      solicitudesIds.push(f.id);
      infoPorSolicitud.set(f.id, { nombre: f.red_perfiles?.nombre ?? 'Perfil eliminado', fotoUrl: f.red_perfiles?.foto_url ?? null, perfilId: f.perfil_id });
    }
    miUserId = sesionStaff.userId;
  }

  if (solicitudesIds.length === 0) return NextResponse.json({ hilos: [] });

  const { data: mensajes, error: errorMensajes } = await admin
    .from('red_mensajes')
    .select('solicitud_id, cuerpo, remitente, creado_en, leido_en')
    .in('solicitud_id', solicitudesIds)
    .order('creado_en', { ascending: true });
  if (errorMensajes) return errorInterno('network:mensajes:hilos:GET:mensajes', errorMensajes, 'No se han podido cargar los mensajes.');

  const hilos: HiloNetwork[] = solicitudesIds.map(id => {
    const propios = (mensajes ?? []).filter(m => m.solicitud_id === id);
    const ultimo = propios.at(-1) ?? null;
    const noLeidos = propios.filter(m => m.remitente !== miUserId && !m.leido_en).length;
    const info = infoPorSolicitud.get(id)!;
    return {
      solicitudId: id,
      perfilId: info.perfilId,
      nombre: info.nombre,
      fotoUrl: info.fotoUrl,
      ultimoMensaje: ultimo?.cuerpo ?? null,
      ultimoMensajeEn: ultimo?.creado_en ?? null,
      noLeidos,
    };
  }).sort((a, b) => (b.ultimoMensajeEn ?? '').localeCompare(a.ultimoMensajeEn ?? ''));

  return NextResponse.json({ hilos });
}
