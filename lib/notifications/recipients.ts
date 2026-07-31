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

// Staff de mostrador del estudio: recepción y quien lleva la sede (MANAGER).
// Sin auth_user_id no hay in-app/push, así que se descartan (una recepción sin
// cuenta no recibe).
async function recepcionistas(admin: SupabaseClient, studioId: string): Promise<Recipient[]> {
  const { data } = await admin.from('instructores')
    .select('id, nombre, email, auth_user_id, rol')
    .eq('studio_id', studioId).in('rol', ['RECEPCION', 'MANAGER']).eq('activo', true);
  return (data ?? [])
    .filter(r => r.auth_user_id)
    .map(r => ({
      role: (r.rol as 'RECEPCION' | 'MANAGER'), userId: r.auth_user_id as string,
      nombre: (r.nombre as string | null) ?? 'Mostrador',
      email: (r.email as string | null) ?? null,
    }));
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

// Exportada: la reutiliza también el envío server-side del email de "cambio de
// instructora" (lib/emails/enviar-cambio-instructora.ts), que necesita la misma
// resolución (CONFIRMADA de verdad, no el snapshot de cliente) pero fuera del
// Notification Engine porque ese canal no lo declara el catálogo (ver comentario
// en `resolverDestinatarios` sobre 'socias-e-instructora-de-la-sesion').
export async function sociasDeSesion(admin: SupabaseClient, studioId: string, sesionId: string): Promise<Recipient[]> {
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

// Quien imparte la sesión (si la tiene asignada y tiene cuenta).
async function instructoraDeSesion(admin: SupabaseClient, studioId: string, sesionId: string): Promise<Recipient[]> {
  const { data: ses } = await admin.from('sesiones')
    .select('instructor_id').eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
  if (!ses?.instructor_id) return [];
  const r = await instructoraPorId(admin, studioId, ses.instructor_id as string);
  // Sin cuenta no hay in-app ni push (y estos eventos no declaran email), así que
  // la fila nacería muerta: invisible para ella y ruido en el Notification Center.
  // Mismo criterio que `recepcionistas`. Ojo: NO aplica a las socias, que sí se
  // resuelven sin cuenta porque su fila ancla los canales externos.
  return r?.userId ? [r] : [];
}

// Dispatcher: audiencia → destinatarios reales. Ampliar = añadir un case.
export async function resolverDestinatarios(
  admin: SupabaseClient, audiencia: Audiencia, event: NotificationEvent,
): Promise<Recipient[]> {
  const d = event.data ?? {};
  const socioId = d.socioId as string | undefined;
  const instructorId = d.instructorId as string | undefined;
  const sesionId = d.sesionId as string | undefined;

  // Estas audiencias no pueden resolverse sin su id en `data`. Si falta, el aviso
  // se perdía sin rastro (le pasó a clase.cancelada en producción): grítalo.
  const falta = (clave: string): Recipient[] => {
    console.error(`[notifications] ${event.type}: audiencia '${audiencia}' necesita data.${clave} y no viene. Sin destinatarios.`);
    return [];
  };

  switch (audiencia) {
    case 'propietaria':
      return propietaria(admin, event.studioId);
    case 'socia-del-evento':
      return socioId ? [await sociaPorId(admin, event.studioId, socioId)].filter(Boolean) as Recipient[] : falta('socioId');
    case 'instructora-del-evento':
      return instructorId ? [await instructoraPorId(admin, event.studioId, instructorId)].filter(Boolean) as Recipient[] : falta('instructorId');
    case 'socias-de-la-sesion':
      return sesionId ? sociasDeSesion(admin, event.studioId, sesionId) : falta('sesionId');
    case 'socias-e-instructora-de-la-sesion': {
      if (!sesionId) return falta('sesionId');
      const [socias, instructora] = await Promise.all([
        sociasDeSesion(admin, event.studioId, sesionId),
        instructoraDeSesion(admin, event.studioId, sesionId),
      ]);
      return [...socias, ...instructora];
    }
    case 'mostrador': {
      const [p, r] = await Promise.all([
        propietaria(admin, event.studioId),
        recepcionistas(admin, event.studioId),
      ]);
      return [...p, ...r];
    }
    case 'mostrador-y-socia': {
      const [p, r] = await Promise.all([
        propietaria(admin, event.studioId),
        recepcionistas(admin, event.studioId),
      ]);
      const soc = socioId ? await sociaPorId(admin, event.studioId, socioId) : null;
      return soc ? [...p, ...r, soc] : [...p, ...r];
    }
    default:
      return [];
  }
}
