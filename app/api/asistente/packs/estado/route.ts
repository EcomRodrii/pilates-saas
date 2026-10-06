import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeComprarPacks } from '@/lib/asistente/packs';
import { estadoDeCompra } from '@/lib/asistente/packs-servidor';

// GET /api/asistente/packs/estado?session_id=cs_… — la página de vuelta del
// Checkout pregunta en qué ha quedado su compra. SOLO LEE: el pack lo crea el
// webhook de la plataforma cuando Stripe confirma el pago. Si aún no está, se
// consulta la sesión a Stripe para poder decir «estamos confirmando tu pago» o
// «tu pago se está procesando» en vez de felicitar a ciegas.
//
// Solo la propietaria (es su compra), y solo sesiones de packs de SU estudio:
// cualquier otra cosa es un 404.
const SESION = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeComprarPacks(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });
  const limitado = await enforceRateLimit(req, 'asistente-packs-estado', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;
  const id = req.nextUrl.searchParams.get('session_id') ?? '';
  if (!SESION.test(id)) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const key = process.env.STRIPE_SECRET_KEY;
  const stripe = key && !key.startsWith('sk_test_XXXX') ? new Stripe(key, { apiVersion: '2026-06-24.dahlia' }) : null;
  try {
    const estado = await estadoDeCompra(admin, stripe, sesion.studioId, id);
    if (!estado) return NextResponse.json({ error: 'Compra no encontrada' }, { status: 404 });
    return NextResponse.json(estado, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorInterno('asistente/packs/estado:GET', err, 'No se pudo comprobar la compra ahora mismo.');
  }
}
