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

// Gerencia del estudio: dueña + managers activos (SIN recepción — verificar
// una experiencia de Network es decisión de gerencia, no de mostrador).
async function gerencia(admin: SupabaseClient, studioId: string): Promise<Recipient[]> {
  const [p, { data }] = await Promise.all([
    propietaria(admin, studioId),
    admin.from('instructores')
      .select('id, nombre, email, auth_user_id')
      .eq('studio_id', studioId).eq('rol', 'MANAGER').eq('activo', true),
  ]);
  const managers = (data ?? [])
    .filter(r => r.auth_user_id)
    .map(r => ({
      role: 'MANAGER' as const, userId: r.auth_user_id as string,
      nombre: (r.nombre as string | null) ?? 'Manager', email: (r.email as string | null) ?? null,
    }));
  return [...p, ...managers];
}

// Tentare Network: la profesional dueña de un perfil, resuelta por su
// auth_user_id — nunca por una fila `instructores` de ESTE estudio, porque
// puede no tener ninguna (es la razón de ser de Network, ver docs/NETWORK-
// AUDIT.md §1). El email es el de su cuenta (auth.users), no el `email_
// contacto` opcional de `red_perfiles` — ese es para que OTROS la contacten,
// no para que Tentare le escriba a ella.
async function porAuthUserId(admin: SupabaseClient, authUserId: string, nombre?: string | null): Promise<Recipient[]> {
  const { data } = await admin.auth.admin.getUserById(authUserId);
  return [{
    role: 'INSTRUCTOR',
    userId: authUserId,
    nombre: nombre ?? (data.user?.user_metadata?.nombre as string | undefined) ?? 'Profesional',
    email: data.user?.email ?? null,
  }];
}

// Tentare Network (Fase 2, matching): N profesionales cuyo perfil encaja con
// una vacante nueva, ya filtradas y resueltas por `data.authUserIds` — el
// endpoint que publica la vacante hace el cálculo de encaje (sin cron), esto
// solo traduce cada id a un Recipient. Sin studioId (mismo motivo que
// `porAuthUserId`: no pertenecen al estudio del evento).
async function porListaAuthUserIds(admin: SupabaseClient, authUserIds: string[]): Promise<Recipient[]> {
  const out = await Promise.all(authUserIds.map(id => porAuthUserId(admin, id)));
  return out.flat();
}

// Tentare Network (Fase 9): quien envió una solicitud de contacto, para
// avisarle cuando la profesional la acepta — nunca toda la gerencia, para
// no convertir el contacto (que incluye email/teléfono privados) en un
// listado (docs/NETWORK-IMPLEMENTATION-PLAN.md §6, comentario de
// red_solicitudes_contacto). Puede ser la propietaria O cualquier staff con
// sesión (POST /api/network/contacto no lo restringe a gerencia).
async function staffPorAuthUserId(admin: SupabaseClient, studioId: string, authUserId: string): Promise<Recipient[]> {
  const { data: studio } = await admin.from('studios')
    .select('owner_auth_user_id, nombre, email, telefono').eq('id', studioId).maybeSingle();
  if (studio?.owner_auth_user_id === authUserId) {
    return [{
      role: 'PROPIETARIO', userId: authUserId,
      nombre: (studio.nombre as string | null) ?? 'Propietaria',
      email: (studio.email as string | null) ?? null,
      telefono: (studio.telefono as string | null) ?? null,
    }];
  }
  const { data } = await admin.from('instructores')
    .select('nombre, email, rol').eq('studio_id', studioId).eq('auth_user_id', authUserId).maybeSingle();
  if (!data) return [];
  return [{
    role: data.rol as Recipient['role'], userId: authUserId,
    nombre: (data.nombre as string | null) ?? 'Equipo', email: (data.email as string | null) ?? null,
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

// Community & Messaging OS (P1): N socias resueltas por `data.socioIds` — a
// diferencia de `sociasDeSesion` (deriva los ids de `reservas`), aquí el
// caller ya tiene los ids (salen de `resolverDestinatariasCampana`). Una sola
// query `.in('id', …)`, no un bucle de `sociaPorId` por id — el fan-out de un
// post puede alcanzar a cientos de socias.
async function sociasPorLista(admin: SupabaseClient, studioId: string, socioIds: string[]): Promise<Recipient[]> {
  const { data } = await admin.from('socios')
    .select('id, nombre, apellidos, email, telefono, auth_user_id')
    .eq('studio_id', studioId).in('id', socioIds);
  return (data ?? []).map(r => ({
    role: 'SOCIA' as const, userId: (r.auth_user_id as string | null) ?? null, socioId: r.id as string,
    nombre: `${r.nombre ?? ''} ${r.apellidos ?? ''}`.trim() || 'Socia',
    email: (r.email as string | null) ?? null, telefono: (r.telefono as string | null) ?? null,
  }));
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

// Community & Messaging OS (P0): un participante de conversación resuelto por
// su auth_user_id, DENTRO del studioId del evento — a diferencia de
// `porAuthUserId` (Network), que fuerza role: 'INSTRUCTOR' y nunca mira el
// estudio. Aquí no se sabe de antemano si es socia o staff, así que se
// prueba en orden: `socios`, `instructores`, y por último la propietaria
// (que puede no tener fila en `instructores`, ver `propietaria()` arriba).
async function participanteConversacionPorAuthUserId(
  admin: SupabaseClient, studioId: string, authUserId: string,
): Promise<Recipient | null> {
  const { data: socio } = await admin.from('socios')
    .select('id, nombre, apellidos, email, telefono')
    .eq('studio_id', studioId).eq('auth_user_id', authUserId).maybeSingle();
  if (socio) {
    return {
      role: 'SOCIA', userId: authUserId, socioId: socio.id as string,
      nombre: `${socio.nombre ?? ''} ${socio.apellidos ?? ''}`.trim() || 'Socia',
      email: (socio.email as string | null) ?? null, telefono: (socio.telefono as string | null) ?? null,
    };
  }
  const { data: staff } = await admin.from('instructores')
    .select('id, nombre, email, rol')
    .eq('studio_id', studioId).eq('auth_user_id', authUserId).maybeSingle();
  if (staff) {
    return {
      role: staff.rol as Recipient['role'], userId: authUserId, instructorId: staff.id as string,
      nombre: (staff.nombre as string | null) ?? 'Equipo', email: (staff.email as string | null) ?? null,
    };
  }
  const { data: studio } = await admin.from('studios')
    .select('owner_auth_user_id, nombre, email, telefono').eq('id', studioId).maybeSingle();
  if (studio?.owner_auth_user_id === authUserId) {
    return {
      role: 'PROPIETARIO', userId: authUserId,
      nombre: (studio.nombre as string | null) ?? 'Propietaria',
      email: (studio.email as string | null) ?? null, telefono: (studio.telefono as string | null) ?? null,
    };
  }
  return null;
}

async function participantesConversacion(
  admin: SupabaseClient, studioId: string, authUserIds: string[],
): Promise<Recipient[]> {
  const out = await Promise.all(
    authUserIds.map(id => participanteConversacionPorAuthUserId(admin, studioId, id)),
  );
  return out.filter((r): r is Recipient => r !== null);
}

// Dispatcher: audiencia → destinatarios reales. Ampliar = añadir un case.
export async function resolverDestinatarios(
  admin: SupabaseClient, audiencia: Audiencia, event: NotificationEvent,
): Promise<Recipient[]> {
  const d = event.data ?? {};
  const socioId = d.socioId as string | undefined;
  const instructorId = d.instructorId as string | undefined;
  const sesionId = d.sesionId as string | undefined;
  const authUserId = d.authUserId as string | undefined;
  const nombreProfesional = d.profesional as string | undefined;
  const solicitanteAuthUserId = d.solicitanteAuthUserId as string | undefined;
  const authUserIds = d.authUserIds as string[] | undefined;
  const socioIds = d.socioIds as string[] | undefined;

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
    case 'gerencia':
      return gerencia(admin, event.studioId);
    case 'red-profesional':
      return authUserId ? porAuthUserId(admin, authUserId, nombreProfesional) : falta('authUserId');
    case 'red-solicitante-contacto':
      return solicitanteAuthUserId
        ? staffPorAuthUserId(admin, event.studioId, solicitanteAuthUserId)
        : falta('solicitanteAuthUserId');
    case 'red-instructoras-lista':
      return authUserIds && authUserIds.length > 0 ? porListaAuthUserIds(admin, authUserIds) : falta('authUserIds');
    case 'participantes-conversacion':
      return authUserIds && authUserIds.length > 0
        ? participantesConversacion(admin, event.studioId, authUserIds)
        : falta('authUserIds');
    case 'socias-de-lista':
      return socioIds && socioIds.length > 0
        ? sociasPorLista(admin, event.studioId, socioIds)
        : falta('socioIds');
    default:
      return [];
  }
}
