// ─────────────────────────────────────────────────────────────────────────────
// Liveness. Lo que un monitor externo (UptimeRobot y compañía) puede sondear
// cada minuto sin que eso se convierta en un problema de consumo por sí mismo.
//
// A propósito NO dice nada más que "en pie / no en pie":
//
// - Es PÚBLICO (no se puede exigir credenciales a un monitor de terceros), así
//   que no puede filtrar nada del negocio. Cuántos cobros están atascados o qué
//   estudio va mal es justo lo que NO va aquí: eso vive en /api/health/flujos,
//   detrás del permiso `logs.read`.
// - No llama a Stripe, ni a Resend, ni a Inngest. Sondear terceros cada minuto
//   desde un endpoint público es regalar cuota de API y una vía de abuso
//   gratuita. Esas comprobaciones van en el endpoint cerrado, que se consulta
//   con mucha menos frecuencia.
//
// La única dependencia que se comprueba es la base de datos, porque sin ella no
// hay nada que servir: un 200 aquí con Supabase caído sería exactamente el
// "parece que todo está bien" que no queremos.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

export const dynamic = 'force-dynamic';

// Corto a propósito: si la BD tarda más que esto, a efectos de una pantalla ya
// está caída. Sin techo, el propio health check se quedaría colgado y el
// monitor leería un timeout genérico en vez de un 503 claro.
const TIMEOUT_MS = 3000;

function conTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | { timeout: true }> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<{ timeout: true }>(r => setTimeout(() => r({ timeout: true }), ms)),
  ]);
}

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ estado: 'fallo', motivo: 'sin service-role' }, { status: 503 });
  }

  const inicio = Date.now();
  // `head: true` no devuelve filas: es lo más barato que confirma que hay
  // conexión, credenciales válidas y el esquema respondiendo.
  const res = await conTimeout(
    admin.from('studios').select('id', { count: 'exact', head: true }).limit(1),
    TIMEOUT_MS,
  );
  const ms = Date.now() - inicio;

  if ('timeout' in res) {
    return NextResponse.json({ estado: 'fallo', motivo: 'base de datos sin responder', ms }, { status: 503 });
  }
  if (res.error) {
    // El mensaje del driver no sale al exterior: puede llevar detalles de
    // esquema o de conexión. El detalle vive en el endpoint cerrado.
    return NextResponse.json({ estado: 'fallo', motivo: 'base de datos con error', ms }, { status: 503 });
  }

  return NextResponse.json({ estado: 'ok', ms });
}
