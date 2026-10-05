import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { esCuentaDeTentare } from '@/lib/auth/obligatoria-tentare';

// Lo que la app del estudio necesita saber de la verificación en dos pasos de
// la cuenta y no puede leer ella misma: si no se puede quitar porque la cuenta
// es del equipo de Tentare (lib/auth/obligatoria-tentare.ts). El panel lo lee
// de /api/auth/doble-factor.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.json(
    { obligatoriaTentare: await esCuentaDeTentare(usuario.userId) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
