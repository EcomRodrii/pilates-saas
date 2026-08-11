// ─────────────────────────────────────────────────────────────────────────────
// Salud de los flujos críticos. La pregunta que responde no es "¿responde el
// servidor?" (eso es /api/health) sino "¿ha hecho Tentare lo que tenía que
// hacer?".
//
// DOS PUERTAS, a propósito, porque hay dos consumidores legítimos y distintos:
//
//   1. Una persona del equipo interno mirando el estado → sesión + `logs.read`.
//   2. Un vigilante automático que sondea y avisa → `Bearer CRON_SECRET`, el
//      mismo mecanismo que ya usan los crons de Vercel en este repo.
//
// El segundo no es un extra: sin él esto sería un panel que alguien tiene que
// acordarse de mirar, y el objetivo es enterarse ANTES de que lo descubra la
// propietaria. Un panel que hay que recordar mirar no detecta nada de noche.
//
// Devuelve 200 con el detalle aunque haya fallos: el código HTTP dice si la
// COMPROBACIÓN se pudo hacer, no si el sistema está sano — mezclarlo haría
// indistinguible "hay 3 cobros atascados" de "el endpoint está roto", que es
// justo la confusión que esto viene a eliminar. El veredicto va en el cuerpo,
// en `estado`.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { comprobarFlujos } from '@/lib/salud/comprobaciones.ts';
import { secretoValido } from '@/lib/salud/secreto.ts';

// ⚠️ `exigirPermiso` se importa DENTRO del handler, no arriba. No es manía:
// arrastra `lib/auth-server.ts` → `lib/db/supabase.ts`, que hace `createClient`
// a nivel de módulo y LANZA si falta NEXT_PUBLIC_SUPABASE_URL. Importado arriba,
// una variable de entorno mal puesta tumbaba este endpoint con un 500 y un
// stack, antes de ejecutar una sola línea propia.
//
// Para cualquier otra ruta eso es tolerable (si no hay config, no hay app). Aquí
// no: este endpoint existe precisamente para responder cuando algo está mal, y
// el momento en que más falta hace es justo el que lo tumbaba. Con el import
// diferido, el camino del CRON_SECRET no lo toca siquiera, y el de sesión falla
// con un 503 que se entiende en vez de con un stack.
async function guardaDeSesion(req: NextRequest): Promise<NextResponse | null> {
  try {
    const { exigirPermiso } = await import('@/lib/interno/auth.ts');
    // `logs.read`, no `studios.read`: esto es diagnóstico de plataforma, no
    // datos de cliente. Quien tiene panel pero no diagnóstico —marketing,
    // soporte— no necesita ver el estado interno de los cobros.
    const g = await exigirPermiso(req, 'logs.read');
    return 'error' in g ? g.error : null;
  } catch (e) {
    return NextResponse.json(
      {
        estado: 'fallo',
        motivo: 'la autenticación interna no se pudo cargar (¿falta configuración de entorno?)',
        detalle: e instanceof Error ? e.message : 'error desconocido',
        pista: 'Con CRON_SECRET en la cabecera Authorization este endpoint responde igualmente.',
      },
      { status: 503 },
    );
  }
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const porSecreto = secretoValido(req.headers.get('authorization'), process.env.CRON_SECRET ?? '');

  if (!porSecreto) {
    const cerrada = await guardaDeSesion(req);
    if (cerrada) return cerrada;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ estado: 'fallo', motivo: 'sin service-role' }, { status: 503 });
  }

  const informe = await comprobarFlujos(admin);
  return NextResponse.json(informe);
}
