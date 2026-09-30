import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluarSalud, urlErroresSentry, type SaludEstudio, type SenalesEstudio } from './salud-estudio.ts';

/**
 * Las señales de UN estudio. Son conteos con `head: true` —ni una fila de
 * socias sale de aquí— y se piden solo para los clientes de pago, que son
 * pocos: por eso vale una consulta por estudio en vez de agregar a mano.
 */
export async function saludDe(
  db: SupabaseClient,
  studio: { id: string; owner_auth_user_id: string | null; subscription_status: string | null },
  ahora: Date = new Date(),
): Promise<SaludEstudio> {
  const hace7 = new Date(ahora.getTime() - 7 * 864e5).toISOString();
  const en7 = new Date(ahora.getTime() + 7 * 864e5).toISOString();
  const hace30 = new Date(ahora.getTime() - 30 * 864e5).toISOString().slice(0, 10);

  const [reservas, clases, fallidos, duena] = await Promise.all([
    db.from('reservas').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).gte('creado_en', hace7),
    db.from('sesiones').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).eq('cancelada', false)
      .gte('inicio', ahora.toISOString()).lt('inicio', en7),
    db.from('recibos').select('id', { count: 'exact', head: true }).eq('studio_id', studio.id).eq('estado', 'FALLIDO')
      .gte('fecha_vencimiento', hace30),
    studio.owner_auth_user_id ? db.auth.admin.getUserById(studio.owner_auth_user_id) : Promise.resolve(null),
  ]);

  const senales: SenalesEstudio = {
    estadoSuscripcion: studio.subscription_status,
    ultimoAccesoDuena: duena?.data?.user?.last_sign_in_at ?? null,
    reservas7d: reservas.error ? null : reservas.count ?? 0,
    clasesProximas7d: clases.error ? null : clases.count ?? 0,
    cobrosFallidos30d: fallidos.error ? null : fallidos.count ?? 0,
  };
  return { ...evaluarSalud(senales, ahora), senales, sentryUrl: urlErroresSentry(process.env.SENTRY_ORG, studio.id) };
}
