// Tarjeta regalo — resolver el estudio de una petición pública por su slug, con lo que
// hace falta para vender: ajustes encendidos y cuenta de cobro. Nunca se confía en un
// studioId del cliente en la compra.
import type { SupabaseClient } from '@supabase/supabase-js';
import { leerAjustes } from './servidor';
import type { AjustesRegalo } from './reglas';

export interface EstudioVendedor {
  id: string; nombre: string; slug: string; stripeAccountId: string | null; ajustes: AjustesRegalo;
}

export async function estudioDeSlug(admin: SupabaseClient, slug: unknown): Promise<EstudioVendedor | null> {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) return null;
  const { data } = await admin.from('studios').select('id, nombre, slug, stripe_account_id').eq('slug', slug).maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id), nombre: String(data.nombre ?? ''), slug: String(data.slug),
    stripeAccountId: (data.stripe_account_id as string | null) ?? null, ajustes: await leerAjustes(admin, String(data.id)),
  };
}
