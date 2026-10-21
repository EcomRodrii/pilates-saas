import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { interruptoresPara } from '@/lib/estudio/interruptores';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { estudioNacioConAltaNueva } from '@/lib/alta/bienvenida-nueva-servidor';

export const dynamic = 'force-dynamic';

// Qué funcionalidades que entran apagadas están encendidas para el estudio de
// la sesión (lib/estudio/interruptores.ts). Solo booleanos: ni las variables
// ni los ids de estudio salen de aquí. El estudio sale SIEMPRE de la sesión;
// `?estudio=` solo sirve para contestar 409 si no coincide (el navegador no
// recuerda entonces nada y vuelve a preguntar en la siguiente visita).
//
// `altaNueva` es el único que no sale solo de su variable: también lo tiene el
// estudio que nació del alta nueva (lib/alta/bienvenida-nueva-servidor.ts), y
// eso solo lo sabe la base de datos.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const pedido = req.nextUrl.searchParams.get('estudio');
  const valores = interruptoresPara(sesion.studioId, pedido, process.env);
  if (!valores) return NextResponse.json({ error: 'La sede ha cambiado' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  if (!valores.altaNueva) {
    const admin = getSupabaseAdmin();
    if (admin) valores.altaNueva = await estudioNacioConAltaNueva(admin, sesion.studioId);
  }
  return NextResponse.json(valores, { headers: { 'Cache-Control': 'no-store' } });
}
