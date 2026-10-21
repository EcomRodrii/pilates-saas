import { NextRequest, NextResponse, after } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { interruptoresDe } from '@/lib/estudio/interruptores';
import { estudioNacioConAltaNueva } from '@/lib/alta/bienvenida-nueva-servidor';
import { estadoDelAlta } from '@/lib/alta/estado-servidor';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que «Pon en marcha tu estudio» del alta nueva (PR-5) no puede saber desde
// el navegador: si una alumna nueva ya puede reservar, si compartió su enlace,
// si ya vio el recorrido o la tarjeta del plan… (lib/alta/estado.ts).
//
//   · Solo la PROPIETARIA: la lista es la suya, y lee con service-role.
//   · El estudio sale SIEMPRE de la sesión, nunca de la petición.
//   · Detrás del interruptor, como la pantalla que la pregunta: `ALTA_NUEVA`, o
//     el estudio que nació del alta nueva.
//   · La respuesta no lleva datos de nadie: booleanos, un número de sedes y,
//     como mucho, la frase genérica de qué falta para poder reservar.
//   · Con el SÍ recién preguntado, se apunta el hito `clase_reservable` después
//     de contestar, para no volver a preguntarle a Stripe en cada carga.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const limitado = await enforceRateLimit(req, 'alta-estado', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limitado) return limitado;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const studioId = sesion.studioId;

  const encendida = interruptoresDe(studioId, process.env).altaNueva || await estudioNacioConAltaNueva(admin, studioId);
  if (!encendida) return NextResponse.json({ error: 'No disponible' }, { status: 404 });

  try {
    const { estado, apuntarClaseReservable } = await estadoDelAlta(admin, studioId, new Date());
    if (apuntarClaseReservable) after(() => apuntarPaso(admin, studioId, 'clase_reservable'));
    return NextResponse.json(estado, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[alta:estado]', e instanceof Error ? e.message : 'error desconocido');
    return NextResponse.json({ error: 'No se ha podido comprobar' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
