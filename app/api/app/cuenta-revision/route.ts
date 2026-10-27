import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { esCuentaDeRevision } from '@/lib/app-nativa/cuenta-revision';

// La entrada de la app (`/app`) pregunta aquí, antes de mandar el código por correo,
// si el email es la cuenta de demostración de la revisión de Apple: en ese caso pide
// directamente la contraseña. Solo contesta sí/no sobre las cuentas de la variable
// `CUENTA_REVISION_APPLE`; no toca ninguna cuenta ni da ningún otro dato.
export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  const limite = await rateLimit(`cuenta-revision:${clientIp(req)}`, { max: 30, windowSeconds: 60 });
  if (!limite.allowed) return NextResponse.json({ contrasena: false }, { status: 429, headers: SIN_CACHE });
  const cuerpo = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof cuerpo?.email === 'string' ? cuerpo.email.slice(0, 254) : '';
  return NextResponse.json({ contrasena: esCuentaDeRevision(email) }, { headers: SIN_CACHE });
}
