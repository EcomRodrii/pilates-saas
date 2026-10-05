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
import { nombresParaLista } from '../student/agenda-instructora.ts';
import type { NotificationRole, Recipient } from '../notifications/types.ts';

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
      // PROPIETARIO incluido a proposito: la RLS que decide QUIEN VE el hilo es
      // `puede_gestionar_calendario()` = rol in (PROPIETARIO, MANAGER,
      // RECEPCION), y este fan-out —quien SE ENTERA— se habia quedado en dos de
      // los tres. Una copropietaria dada de alta como fila de `instructores`
      // con rol PROPIETARIO (hay 7 activas en produccion) veia el hilo pero no
      // recibia aviso nunca. Con #1680 el mostrador es el canal real
      // socia -> estudio, asi que quien puede leer tiene que poder enterarse.
      .eq('studio_id', studioId).in('rol', ['PROPIETARIO', 'MANAGER', 'RECEPCION']).eq('activo', true),
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
    .select('auth_user_id, rol_en_conversacion')
    .eq('conversacion_id', conversacion.id);
  // En instructora–alumna, la parte STAFF solo se entera si sigue ACTIVA en el
  // estudio: dada de baja ya no puede abrir el hilo, y el aviso no le sirve.
  const staffInstructora: string[] = [];
  for (const p of participantes ?? []) {
    if (!p.auth_user_id) continue;
    if (conversacion.tipo === 'ALUMNA_INSTRUCTORA' && p.rol_en_conversacion === 'STAFF') {
      staffInstructora.push(p.auth_user_id as string);
    } else {
      ids.add(p.auth_user_id as string);
    }
  }
  if (staffInstructora.length > 0) {
    const { data: activas } = await admin.from('instructores').select('auth_user_id')
      .eq('studio_id', conversacion.studio_id).in('auth_user_id', staffInstructora).neq('activo', false);
    for (const a of activas ?? []) if (a.auth_user_id) ids.add(a.auth_user_id as string);
  }

  if (conversacion.tipo === 'EQUIPO') {
    for (const id of await equipoDinamico(admin, conversacion.studio_id)) ids.add(id);
  } else if (conversacion.tipo === 'ALUMNA_MOSTRADOR') {
    for (const id of await mostradorDinamico(admin, conversacion.studio_id)) ids.add(id);
  }

  ids.delete(remitenteAuthUserId);
  return [...ids];
}

// ── Avisos de un hilo con alumna: cada uno con SU papel en el hilo ───────────
//
// El motor resolvía el rol de quien recibe por su CUENTA, mirando primero en
// `socios` (`participanteConversacionPorAuthUserId`). Una cuenta que es socia
// y además del equipo del mismo estudio (hay al menos una propietaria así en
// producción, y una instructora puede ser alumna) recibía como SOCIA el aviso
// de un hilo en el que estaba como equipo: «Pilates Luz te ha escrito» cuando
// escribía otra alumna, y un enlace al hilo de la app de la alumna que le
// contesta 403. Aquí el rol sale del papel en el hilo:
//   · SOCIA solo la cuenta de la fila SOCIO (la de la fila o, si se volvió a
//     vincular, la de su ficha: `socios.auth_user_id`);
//   · el resto, con el rol de su ficha del equipo en ese estudio (o PROPIETARIO
//     si es la dueña). En el mostrador, la dueña siempre como PROPIETARIO.
// EQUIPO no pasa por aquí (canal congelado): sigue con la audiencia de siempre.

const ROLES_MOSTRADOR = ['PROPIETARIO', 'MANAGER', 'RECEPCION'];

export interface FichaEquipo { id: string; auth_user_id: string | null; rol: string; activo: boolean | null }

/** Puro: quién recibe el aviso de un mensaje en un hilo con alumna, y como qué. */
export function repartirAvisoMensaje(e: {
  tipo: string;
  remitente: string;
  socia: { socioId: string | null; cuenta: string | null };
  /** Cuentas de las filas STAFF del hilo. */
  staffDelHilo: string[];
  /** Fichas del equipo de ESTE estudio que pueden venir al caso. */
  fichas: FichaEquipo[];
  duena: string | null;
}): Recipient[] {
  const fuera = new Set([e.remitente, e.socia.cuenta].filter((x): x is string => !!x));
  const equipo = new Map<string, Recipient>();
  const anadir = (auth: string, preferirDuena: boolean) => {
    if (fuera.has(auth) || equipo.has(auth)) return;
    if (preferirDuena && auth === e.duena) { equipo.set(auth, { role: 'PROPIETARIO', userId: auth }); return; }
    const ficha = e.fichas.find(f => f.auth_user_id === auth && f.activo !== false);
    if (ficha) {
      equipo.set(auth, { role: ficha.rol as NotificationRole, userId: auth, instructorId: ficha.id });
    } else if (auth === e.duena) {
      equipo.set(auth, { role: 'PROPIETARIO', userId: auth });
    }
    // Sin ficha activa en este estudio y sin ser la dueña: dada de baja, no se entera.
  };
  for (const auth of e.staffDelHilo) anadir(auth, e.tipo === 'ALUMNA_MOSTRADOR');
  if (e.tipo === 'ALUMNA_MOSTRADOR') {
    if (e.duena) anadir(e.duena, true);
    for (const f of e.fichas) {
      if (f.auth_user_id && f.activo === true && ROLES_MOSTRADOR.includes(f.rol)) anadir(f.auth_user_id, true);
    }
  }
  const socia: Recipient[] = e.socia.cuenta && e.socia.cuenta !== e.remitente
    ? [{ role: 'SOCIA', userId: e.socia.cuenta, socioId: e.socia.socioId }]
    : [];
  return [...socia, ...equipo.values()];
}

export interface RepartoAvisoMensaje {
  /** Las cuentas que se enteran (quien escribe, fuera). */
  authUserIds: string[];
  /** Con su papel en el hilo; `null` en EQUIPO, que sigue con la audiencia de siempre. */
  recipients: Recipient[] | null;
  /**
   * La ficha de la alumna del hilo. Va en `data.socioId` del aviso para que
   * `anonimizar_socio` (cláusula `data->>'socioId'`) lo borre con su supresión:
   * el aviso al equipo lleva su nombre.
   */
  socioId: string | null;
}

export async function repartoAvisoMensaje(
  admin: SupabaseClient, conversacion: ConversacionInfo, remitenteAuthUserId: string,
): Promise<RepartoAvisoMensaje> {
  if (conversacion.tipo !== 'ALUMNA_INSTRUCTORA' && conversacion.tipo !== 'ALUMNA_MOSTRADOR') {
    const authUserIds = await authUserIdsParaNotificar(admin, conversacion, remitenteAuthUserId);
    return { authUserIds, recipients: null, socioId: null };
  }

  const [{ data: participantes }, { data: studio }] = await Promise.all([
    admin.from('conversacion_participantes')
      .select('auth_user_id, rol_en_conversacion, socio_id')
      .eq('conversacion_id', conversacion.id),
    admin.from('studios').select('owner_auth_user_id').eq('id', conversacion.studio_id).maybeSingle(),
  ]);
  const filas = (participantes ?? []) as { auth_user_id: string | null; rol_en_conversacion: string; socio_id: string | null }[];
  const filaSocia = filas.find(p => p.rol_en_conversacion === 'SOCIO') ?? null;
  const socioId = filaSocia?.socio_id ?? null;
  let cuentaSocia = filaSocia?.auth_user_id ?? null;
  if (socioId) {
    const { data: ficha } = await admin.from('socios').select('auth_user_id')
      .eq('id', socioId).eq('studio_id', conversacion.studio_id).maybeSingle();
    cuentaSocia = (ficha?.auth_user_id as string | null | undefined) ?? cuentaSocia;
  }
  const staffDelHilo = filas
    .filter(p => p.rol_en_conversacion === 'STAFF' && p.auth_user_id)
    .map(p => p.auth_user_id as string);

  const [{ data: delHilo }, { data: mostrador }] = await Promise.all([
    staffDelHilo.length > 0
      ? admin.from('instructores').select('id, auth_user_id, rol, activo')
        .eq('studio_id', conversacion.studio_id).in('auth_user_id', staffDelHilo)
      : Promise.resolve({ data: [] }),
    conversacion.tipo === 'ALUMNA_MOSTRADOR'
      ? admin.from('instructores').select('id, auth_user_id, rol, activo')
        .eq('studio_id', conversacion.studio_id).in('rol', ROLES_MOSTRADOR).eq('activo', true)
      : Promise.resolve({ data: [] }),
  ]);

  const recipients = repartirAvisoMensaje({
    tipo: conversacion.tipo,
    remitente: remitenteAuthUserId,
    socia: { socioId, cuenta: cuentaSocia },
    staffDelHilo,
    fichas: [...((delHilo ?? []) as FichaEquipo[]), ...((mostrador ?? []) as FichaEquipo[])],
    duena: (studio?.owner_auth_user_id as string | null | undefined) ?? null,
  });
  return { authUserIds: recipients.map(r => r.userId as string), recipients, socioId };
}

/**
 * El rol de equipo de una cuenta en un estudio, para el resumen diario de una
 * fila STAFF: su ficha activa, o PROPIETARIO si es la dueña. `null` si ya no es
 * del equipo (dada de baja): el resumen no le llega.
 */
export async function equipoDelResumen(
  admin: SupabaseClient, studioId: string, authUserId: string,
): Promise<Recipient | null> {
  const [{ data: fichas }, { data: studio }] = await Promise.all([
    admin.from('instructores').select('id, auth_user_id, rol, activo')
      .eq('studio_id', studioId).eq('auth_user_id', authUserId),
    admin.from('studios').select('owner_auth_user_id').eq('id', studioId).maybeSingle(),
  ]);
  const [r] = repartirAvisoMensaje({
    tipo: 'ALUMNA_INSTRUCTORA', remitente: '', socia: { socioId: null, cuenta: null },
    staffDelHilo: [authUserId], fichas: (fichas ?? []) as FichaEquipo[],
    duena: (studio?.owner_auth_user_id as string | null | undefined) ?? null,
  });
  return r ?? null;
}

// Nombre a mostrar del remitente ("María te ha escrito"). Prueba socia →
// instructora/staff → dueña, en ese orden; si no encuentra nada legible,
// deja que el caller ponga un genérico ("Alguien").
//
// `corto`: la alumna como la ve su instructora en la app («Lucía M.»,
// `nombresParaLista`), sin apellidos completos. Es lo que lleva el push que le
// llega a la instructora; al mostrador le sigue llegando el nombre entero.
export async function resolverNombreRemitente(
  admin: SupabaseClient, authUserId: string, studioId: string, opciones: { corto?: boolean } = {},
): Promise<string | null> {
  const { data: socio } = await admin
    .from('socios').select('nombre, apellidos')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  if (socio?.nombre) {
    if (opciones.corto) {
      return nombresParaLista([{ nombre: socio.nombre as string, apellidos: (socio.apellidos as string | null) ?? null }])[0];
    }
    return `${socio.nombre} ${socio.apellidos ?? ''}`.trim();
  }

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
