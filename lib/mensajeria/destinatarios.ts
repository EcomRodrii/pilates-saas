// ─────────────────────────────────────────────────────────────────────────────
// Community & Messaging OS (P0) — quién debe enterarse de un mensaje nuevo.
//
// Para ALUMNA_INSTRUCTORA y la fila SOCIO de ALUMNA_MOSTRADOR basta con leer
// `conversacion_participantes` (lista estática). Para EQUIPO y el lado STAFF
// de ALUMNA_MOSTRADOR no hay fila propia — es resolución DINÁMICA por rol
// (misma decisión de diseño que ya aplica en la RLS, migración
// `community_messaging_os_rls`), así que aquí se recalcula igual que ya hace
// `resolverDestinatarios('mostrador', ...)` en lib/notifications/recipients.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';

interface ConversacionInfo { id: string; studio_id: string; tipo: string; }

async function equipoDinamico(admin: SupabaseClient, studioId: string): Promise<string[]> {
  const [{ data: studio }, { data: staff }] = await Promise.all([
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
    admin.from('instructores').select('auth_user_id').eq('studio_id', studioId).eq('activo', true),
  ]);
  const ids = new Set<string>();
  if (studio?.owner_auth_user_id) ids.add(studio.owner_auth_user_id as string);
  for (const s of staff ?? []) if (s.auth_user_id) ids.add(s.auth_user_id as string);
  return [...ids];
}

async function mostradorDinamico(admin: SupabaseClient, studioId: string): Promise<string[]> {
  const [{ data: studio }, { data: staff }] = await Promise.all([
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
    admin.from('instructores').select('auth_user_id')
      .eq('studio_id', studioId).in('rol', ['MANAGER', 'RECEPCION']).eq('activo', true),
  ]);
  const ids = new Set<string>();
  if (studio?.owner_auth_user_id) ids.add(studio.owner_auth_user_id as string);
  for (const s of staff ?? []) if (s.auth_user_id) ids.add(s.auth_user_id as string);
  return [...ids];
}

// Todos los que deben enterarse de un mensaje nuevo en `conversacion`,
// EXCLUYENDO a quien lo escribió.
export async function authUserIdsParaNotificar(
  admin: SupabaseClient, conversacion: ConversacionInfo, remitenteAuthUserId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: participantes } = await admin
    .from('conversacion_participantes')
    .select('auth_user_id')
    .eq('conversacion_id', conversacion.id);
  for (const p of participantes ?? []) if (p.auth_user_id) ids.add(p.auth_user_id as string);

  if (conversacion.tipo === 'EQUIPO') {
    for (const id of await equipoDinamico(admin, conversacion.studio_id)) ids.add(id);
  } else if (conversacion.tipo === 'ALUMNA_MOSTRADOR') {
    for (const id of await mostradorDinamico(admin, conversacion.studio_id)) ids.add(id);
  }

  ids.delete(remitenteAuthUserId);
  return [...ids];
}

// Nombre a mostrar del remitente ("María te ha escrito"). Prueba socia →
// instructora/staff → dueña, en ese orden; si no encuentra nada legible,
// deja que el caller ponga un genérico ("Alguien").
export async function resolverNombreRemitente(
  admin: SupabaseClient, authUserId: string, studioId: string,
): Promise<string | null> {
  const { data: socio } = await admin
    .from('socios').select('nombre, apellidos')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  if (socio?.nombre) return `${socio.nombre} ${socio.apellidos ?? ''}`.trim();

  const { data: staff } = await admin
    .from('instructores').select('nombre')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  if (staff?.nombre) return staff.nombre as string;

  const { data: studio } = await admin
    .from('studios').select('nombre')
    .eq('id', studioId).eq('owner_auth_user_id', authUserId).maybeSingle();
  if (studio?.nombre) return `${studio.nombre} (propietaria)`;

  return null;
}
