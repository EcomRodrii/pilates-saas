import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { tieneFeature, type Entitlements } from '@/lib/billing/entitlements';

// Gate de plan para rutas de servidor que solo tienen el studioId (la sesión de
// staff no trae el plan): carga plan + estado de suscripción y consulta el
// entitlement. Mismo criterio que el gate de multiCentro en /api/cadena/sedes.
// Sin service-role configurada devuelve false (no hay forma de verificar).
export async function featureDeEstudio(
  studioId: string,
  feature: keyof Entitlements['features'],
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data: studio } = await admin
    .from('studios').select('plan, subscription_status').eq('id', studioId).maybeSingle();
  return tieneFeature({ plan: studio?.plan, subscriptionStatus: studio?.subscription_status }, feature);
}
