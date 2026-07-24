// ─────────────────────────────────────────────────────────────────────────────
// Notification Engine — resolución de DESTINATARIOS (server-only).
// Traduce la "audiencia" declarada en catalog.ts a personas concretas (con su
// auth_user_id para in-app/push y su email/teléfono para canales externos).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Audiencia } from './catalog.ts';
import type { NotificationEvent, Recipient } from './types.ts';

async function propietaria(admin: SupabaseClient, studioId: string): Promise<Recipient[]> {
  const { data } = await admin.from('studios')
    .select('nombre, owner_auth_user_id, email, telefono').eq('id', studioId).maybeSingle();
  if (!data?.owner_auth_user_id) return [];
  return [{
    role: 'PROPIETARIO', userId: data.owner_auth_user_id as string,
    nombre: (data.nombre as string | null) ?? 'Propietaria',
    email: (data.email as string | null) ?? null,
    telefono: (data.telefono as string | null) ?? null,
  }];
}

async function sociaPorId(admin: SupabaseClient, studioId: string, socioId: string): Promise<Recipient | null> {
  const { data } = await admin.from('socios')
    .select('id, nombre, apellidos, email, telefono, auth_user_id')
    .eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!data) return null;
  return {
    role: 'SOCIA', userId: (data.auth_user_id as string | null) ?? null, socioId: data.id as string,
    nombre: `${data.nombre ?? ''} ${data.apellidos ?? ''}`.trim() || 'Socia',
    email: (data.email as string | null) ?? null, telefono: (data.telefono as string | null) ?? null,
  };
}

async function instructoraPorId(admin: SupabaseClient, studioId: string, instructorId: string): Promise<Recipient | null> {
  const { data } = await admin.from('instructores')
    .select('id, nombre, email, auth_user_id')
    .eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (!data) return null;
  return {
    role: 'INSTRUCTOR', userId: (data.auth_user_id as string | null) ?? null, instructorId: data.id as string,
    nombre: (data.nombre as string | null) ?? 'Instructora', email: (data.email as string | null) ?? null,
  };
}

async function sociasDeSesion(admin: SupabaseClient, studioId: string, sesionId: string): Promise<Recipient[]> {
  const { data: reservas } = await admin.from('reservas')
    .select('socio_id').eq('studio_id', studioId).eq('sesion_id', sesionId).eq('estado', 'CONFIRMADA');
  const ids = [...new Set((reservas ?? []).map(r => r.socio_id as string).filter(Boolean))];
  const out: Recipient[] = [];
  for (const id of ids) {
    const r = await sociaPorId(admin, studioId, id);
    if (r) out.push(r);
  }
  return out;
}

// Dispatcher: audiencia → destinatarios reales. Ampliar = añadir un case.
export async function resolverDestinatarios(
  admin: SupabaseClient, audiencia: Audiencia, event: NotificationEvent,
): Promise<Recipient[]> {
  const d = event.data ?? {};
  const socioId = d.socioId as string | undefined;
  const instructorId = d.instructorId as string | undefined;
  const sesionId = d.sesionId as string | undefined;

  switch (audiencia) {
    case 'propietaria':
      return propietaria(admin, event.studioId);
    case 'socia-del-evento':
      return socioId ? [await sociaPorId(admin, event.studioId, socioId)].filter(Boolean) as Recipient[] : [];
    case 'instructora-del-evento':
      return instructorId ? [await instructoraPorId(admin, event.studioId, instructorId)].filter(Boolean) as Recipient[] : [];
    case 'socias-de-la-sesion':
      return sesionId ? sociasDeSesion(admin, event.studioId, sesionId) : [];
    case 'propietaria-y-socia': {
      const p = await propietaria(admin, event.studioId);
      const soc = socioId ? await sociaPorId(admin, event.studioId, socioId) : null;
      return soc ? [...p, soc] : p;
    }
    default:
      return [];
  }
}
