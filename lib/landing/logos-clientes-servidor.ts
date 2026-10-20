import 'server-only';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  ESTADOS_VIVOS, hostDeSupabase, seleccionarLogos, type FilaLogoEstudio, type LogoCliente,
} from './logos-clientes.ts';
import { logosDePrueba } from './logos-clientes-prueba.ts';

// La lectura de la franja de clientes de la landing (ver `logos-clientes.ts` para
// el criterio). Con el cliente de servicio, porque `anon` no lee `logo_url` ni el
// consentimiento: va por servidor y sale por una lista blanca de DOS campos
// (nombre y URL del logo), nunca la fila.
//
// ⚠️ Si no se puede leer —la base no contesta, falta la clave, o la columna aún no
// existe porque la migración no está aplicada— la franja NO se pinta: sin hueco y
// sin error. Eso se decide FUERA de la caché: `unstable_cache` no guarda un fallo,
// pero sí guardaría durante una hora un `[]` devuelto desde dentro.

const SEGUNDOS_CACHE = 3600;
const LEIDOS_COMO_MUCHO = 60;

async function leerLogos(): Promise<LogoCliente[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('sin cliente de servicio');
  const { data, error } = await admin
    .from('studios')
    .select('nombre, logo_url, es_demo, subscription_status, mostrar_logo_en_landing, creado_en')
    .eq('mostrar_logo_en_landing', true)
    .eq('es_demo', false)
    .in('subscription_status', [...ESTADOS_VIVOS])
    .not('logo_url', 'is', null)
    .neq('logo_url', '')
    .order('creado_en', { ascending: true })
    .limit(LEIDOS_COMO_MUCHO);
  if (error) throw new Error(error.message);
  return seleccionarLogos((data ?? []) as FilaLogoEstudio[], hostDeSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL));
}

const leerLogosEnCache = unstable_cache(leerLogos, ['landing-logos-clientes'], {
  revalidate: SEGUNDOS_CACHE,
  tags: ['landing-logos-clientes'],
});

/** Los logos que se pintan hoy en la landing. Nunca lanza: ante cualquier fallo, `[]` (= sin franja). */
export async function logosClientesLanding(): Promise<LogoCliente[]> {
  // Palanca de e2e (no existe en producción): el servidor de las pruebas usa env
  // dummy y `page.route` no llega a lo que se resuelve en servidor.
  if (process.env.E2E_TEST === '1') return logosDePrueba(Number(process.env.E2E_LOGOS_LANDING ?? 0));
  try {
    return await leerLogosEnCache();
  } catch (e) {
    console.warn('[landing] la franja de logos no se pinta:', e instanceof Error ? e.message : e);
    return [];
  }
}
