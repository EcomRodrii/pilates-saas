import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { resolverSociaAutenticada } from '@/lib/supabase-data';

// Resuelve la sesión de una socia del portal a partir de su JWT de Supabase Auth
// (obtenido con magic link / OTP en el cliente). Sustituye a /api/public/login,
// que solo comprobaba que el email existiera —sin ninguna prueba de control—.
// Aquí el usuario ya demostró que controla el email al autenticarse con
// Supabase; este endpoint vincula (claim) su fila de socia y devuelve su perfil.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { slug?: string } | null;
  if (!body?.slug) {
    return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });
  }

  const user = await verificarUsuarioSupabase(req);
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const socia = await resolverSociaAutenticada(body.slug, user.userId, user.email);
    if (!socia) {
      // Autenticada, pero su email no corresponde a ninguna socia de este
      // estudio (o ya está vinculada a otro usuario).
      return NextResponse.json({ error: 'No hay ninguna socia con este email en el estudio' }, { status: 404 });
    }
    return NextResponse.json(socia);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error al iniciar sesión';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
