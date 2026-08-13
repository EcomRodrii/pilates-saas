import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverDestinoPostLogin } from '@/lib/network/routing-post-login';

// Único punto de decisión de "a dónde mando a esta cuenta tras iniciar
// sesión" — docs/NETWORK-AUDIT-2.md §2/§11. Antes esto no existía: cada
// pantalla de auth hacía su propio redirect duro, y /login siempre mandaba a
// /dashboard sin mirar si la cuenta tenía estudio de verdad. Una cuenta de
// Tentare Network (sin studio_id, sin fila en instructores) se quedaba en un
// skeleton infinito ahí — no un bug de UI, un bug de "a quién le pregunto".
//
// verificarSesionStaff ya es la respuesta correcta a "¿esta auth_user_id
// tiene un estudio de verdad?" (instructores O studios.owner_auth_user_id,
// lib/auth-server.ts) — no se reimplementa esa consulta aquí, solo se usa su
// resultado.
//
// Rediseño 2026-08 (Fase 4): con estudio real → /dashboard, sin cambios.
// Sin estudio, la rama binaria de antes ("todo lo demás a mi-perfil") ya no
// basta — mi-perfil dejó de ser el sitio del alta (PR de onboarding) y
// ahora distingue tres casos reales: sin perfil o con el onboarding a
// medias → /network/reanudar ("Hola de nuevo", 2f del brief, NUNCA el
// dashboard de propietaria); perfil ya publicado → /network/mi-perfil (el
// panel). El propio /network/reanudar usa el mismo cálculo de "paso
// incompleto" (lib/network/pasos-onboarding.ts) que el wizard usa al
// abrirse solo, así que las dos pantallas nunca pueden discrepar en qué
// paso toca.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (sesion) return NextResponse.json({ destino: resolverDestinoPostLogin(true, null) });

  const usuario = await verificarUsuarioSupabase(req);
  const admin = usuario ? getSupabaseAdmin() : null;
  const { data: perfil } = admin
    ? await admin.from('red_perfiles').select('estado').eq('auth_user_id', usuario!.userId).maybeSingle()
    : { data: null };

  return NextResponse.json({ destino: resolverDestinoPostLogin(false, perfil?.estado ?? null) });
}
