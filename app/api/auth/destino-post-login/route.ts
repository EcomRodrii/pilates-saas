import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff, verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverDestinoPostLogin, resolverAccesoPorProducto, type Producto } from '@/lib/network/routing-post-login';

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
// ⚠️ Software vs Network vs Network-alumna, tres productos independientes
// (network-alumna añadido en F0 de Network 2.0, 2026-08-24). El bug
// real que motivó este cambio: esta ruta SOLO miraba "¿tiene estudio?" antes
// de mirar Network, sin saber por qué PÁGINA se había llamado. Una identidad
// dual (self-claim: instructora con ficha de Software y perfil de Network)
// entrando por /network/acceso acababa SIEMPRE en /dashboard, sin excepción
// — la puerta por la que entras dejaba de importar.
//
// Ahora `producto` es un parámetro de ENTRADA, no algo que se adivina de la
// cuenta: el contexto lo decide la página que llama (/login siempre manda
// `software`, /network/acceso siempre manda `network`), nunca la identidad.
// Con `producto`, la respuesta puede ser 'cuenta-de-otro-producto' — sin
// gate, /clave-nueva (recuperación de contraseña, donde no se está "entrando
// en" ningún producto) sigue usando la resolución vieja sin bloqueo.
export async function GET(req: NextRequest) {
  const productoParam = req.nextUrl.searchParams.get('producto');
  const producto: Producto | null =
    productoParam === 'software' || productoParam === 'network' || productoParam === 'network-alumna'
      ? productoParam : null;

  const sesion = await verificarSesionStaff(req);
  const tieneEstudio = !!sesion;

  const usuario = await verificarUsuarioSupabase(req);
  const admin = usuario ? getSupabaseAdmin() : null;
  const { data: perfil } = admin
    ? await admin.from('red_perfiles').select('estado').eq('auth_user_id', usuario!.userId).maybeSingle()
    : { data: null };
  const estadoPerfilNetwork = perfil?.estado ?? null;

  // F0: tercera vía, independiente de la de instructora — una identidad puede
  // tener perfil en las dos tablas a la vez (mismo criterio de self-claim).
  const { data: perfilAlumna } = admin
    ? await admin.from('red_perfiles_alumna').select('estado').eq('auth_user_id', usuario!.userId).maybeSingle()
    : { data: null };
  const estadoPerfilNetworkAlumna = perfilAlumna?.estado ?? null;

  if (!producto) {
    // Sin gate: solo /clave-nueva llega aquí sin `producto`. Se manda a donde
    // de verdad tiene algo esta identidad, sin bloquear nada — recuperar la
    // contraseña no es "entrar en" ningún producto en concreto.
    return NextResponse.json({
      destino: resolverDestinoPostLogin(tieneEstudio, estadoPerfilNetwork, estadoPerfilNetworkAlumna),
    });
  }

  const resultado = resolverAccesoPorProducto(producto, { tieneEstudio, estadoPerfilNetwork, estadoPerfilNetworkAlumna });
  return NextResponse.json(resultado);
}
