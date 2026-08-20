import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/db/supabase';

// Google nunca rellena `user_metadata.nombre` — pone `full_name`/`name`, que
// es lo que el propio proveedor decide mandar. `nombre` es lo que leen
// sidebar, menú de perfil, notificaciones y los formularios de Network (7
// sitios, ver grep) — sin normalizar aquí, cualquier alta por Google se vería
// como "Instructora" o en blanco en todo el sitio.
//
// Antes vivía solo dentro del efecto de /login, con el argumento de que
// `signInWithGoogle()` siempre volvía ahí (Manager y Network por igual). Con
// la separación de productos (2026-08-19), el retorno de Google de Network ya
// no pasa por /login — /network/acceso tiene su propio punto de retorno, así
// que la normalización se extrae para no duplicarla a mano ni perderla en esa
// puerta.
export async function normalizarNombreDeGoogle(user: User): Promise<void> {
  if (user.user_metadata?.nombre) return;
  const nombreGoogle = user.user_metadata?.full_name || user.user_metadata?.name;
  if (nombreGoogle) await supabase.auth.updateUser({ data: { nombre: nombreGoogle } });
}
