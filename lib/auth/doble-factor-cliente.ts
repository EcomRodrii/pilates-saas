// Qué paso de verificación en dos pasos le falta a la sesión del panel
// (reglas en lib/auth/doble-factor-reglas.ts). Lo usa DashboardShell al
// arrancar para mandar a /verificar-acceso antes de pintar un panel que, sin
// ese paso, la base de datos dejaría vacío.
//
// Es una guardia de USABILIDAD: la cerradura es la base de datos (política
// `exige_doble_factor`) y `verificarSesionStaff`. Por eso, si algo falla aquí,
// devuelve 'ok' y deja que el panel siga: el servidor no dará nada que no deba.
import { supabase } from '@/lib/db/supabase';
import type { PasoDobleFactor } from '@/lib/auth/doble-factor-reglas';

export async function pasoDobleFactorDelPanel(accessToken: string): Promise<PasoDobleFactor> {
  try {
    // Sin red: el nivel sale del propio token y los factores, de la sesión.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') return 'ok';
    if (aal?.nextLevel === 'aal2') return 'verificar';
    // Sin factor: solo falta algo si su estudio la exige, y eso lo sabe el servidor.
    const res = await fetch('/api/auth/doble-factor', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!res.ok) return 'ok';
    const { paso } = await res.json() as { paso?: PasoDobleFactor };
    return paso === 'activar' || paso === 'verificar' ? paso : 'ok';
  } catch {
    return 'ok';
  }
}
