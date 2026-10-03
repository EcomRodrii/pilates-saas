import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { escaparLike } from '@/lib/escapar-like';
import { EMAIL_VALIDO } from '@/lib/recursos/descargas';

// ¿Este correo tiene ficha de equipo en algún estudio? Lo pregunta /login antes
// de dejar crear una cuenta de equipo: si no la tiene, la persona no es del
// equipo de nadie y lo que le toca es /crear-estudio.
//
// PÚBLICO y sin sesión (la persona aún no tiene cuenta). Devuelve SOLO un
// booleano — nunca el estudio, el nombre ni el rol — y va con tope por IP
// estricto, porque un sí/no por correo es, aun así, una forma de averiguar quién
// trabaja en un estudio de Tentare. No es la cerradura: vincular la cuenta a la
// ficha sigue exigiendo el enlace firmado (lib/equipo/reclamar-reglas.ts).
export async function POST(req: NextRequest) {
  const limitado =
    (await enforceRateLimit(req, 'public-equipo-email', { max: 6, windowSeconds: 60 })) ??
    (await enforceRateLimit(req, 'public-equipo-email-dia', { max: 40, windowSeconds: 86_400 }));
  if (limitado) return limitado;

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_VALIDO.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Escribe un email válido.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // Una baja EXPLÍCITA no cuenta (`activo === null` sí), igual que en
  // `motivoNoReclamable`; `.neq('activo', false)` dejaría fuera los NULL.
  // `ilike` con los comodines escapados: `_` y `%` sí pasan EMAIL_VALIDO.
  const { data, error } = await admin
    .from('instructores')
    .select('id')
    .ilike('email', escaparLike(email))
    .or('activo.is.null,activo.eq.true')
    .limit(1);
  if (error) return NextResponse.json({ error: 'No hemos podido comprobarlo.' }, { status: 503 });

  return NextResponse.json({ esDelEquipo: (data?.length ?? 0) > 0 });
}
