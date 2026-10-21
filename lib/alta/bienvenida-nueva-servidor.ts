import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Rutas relativas, como el resto de lib/alta.
import { nacioConAltaNueva } from './bienvenida-nueva.ts';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Nació este estudio del alta nueva? Lo pregunta `/api/estudio/interruptores`
// cuando `ALTA_NUEVA` no lo enciende ya: la versión del alta es de la CUENTA que
// lo creó (`altas_estudio`, la escribe el trigger de auth.users con
// `pending_studio.version`), así que se mira la de su dueña.
//
// ⚠️ Cliente service-role: `altas_estudio` no tiene políticas para el cliente.
// El estudio sale SIEMPRE de la sesión de quien llama.
//
// Nunca lanza: si no se puede leer, `false` (la bienvenida de siempre). Esa
// ruta contesta también a los demás interruptores y no puede caerse por esto.
// ─────────────────────────────────────────────────────────────────────────────

export async function estudioNacioConAltaNueva(admin: Pick<SupabaseClient, 'from'>, studioId: string): Promise<boolean> {
  try {
    const { data: estudio, error } = await admin
      .from('studios').select('owner_auth_user_id, cadena_id').eq('id', studioId).maybeSingle();
    if (error || !estudio?.owner_auth_user_id || estudio.cadena_id) return false;
    const { data: alta, error: e2 } = await admin
      .from('altas_estudio').select('version').eq('auth_user_id', estudio.owner_auth_user_id as string).maybeSingle();
    if (e2) return false;
    return nacioConAltaNueva((alta?.version as string | null | undefined) ?? null, (estudio.cadena_id as string | null) ?? null);
  } catch {
    return false;
  }
}
