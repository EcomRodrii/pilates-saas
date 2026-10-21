import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { leerPasoDelNavegador } from '@/lib/alta/embudo';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';

// ─────────────────────────────────────────────────────────────────────────────
// Los pasos del embudo del alta que SOLO ve el navegador: hoy, que la
// propietaria copió, mandó por WhatsApp, compartió o bajó el QR de su enlace de
// reservas («Tu estudio ya puede recibir reservas» y «… ya está en marcha»).
//
// Lo demás lo apunta el servidor cuando lo ve (`apuntarPaso` en
// /api/billing/status y /api/onboarding/puede-reservar): la lista de lo que
// acepta esta ruta es CERRADA (`leerPasoDelNavegador`), para no medir lo que
// dice una pantalla en vez de lo que pasa.
//
// · Solo la PROPIETARIA: es quien monta el estudio, y el embudo es el suyo.
// · El estudio sale SIEMPRE de la sesión (`verificarSesionStaff`, con el segundo
//   paso igual que el resto del panel), nunca del cuerpo.
// · Best-effort: la pantalla no espera esta respuesta para nada.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const limitado = await enforceRateLimit(req, 'alta-paso', { max: 30, windowSeconds: 60 }, sesion.studioId);
  if (limitado) return limitado;

  const paso = leerPasoDelNavegador(await req.json().catch(() => null));
  if (!paso) return NextResponse.json({ error: 'Paso no válido' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const apuntado = await apuntarPaso(admin, sesion.studioId, paso.paso, { detalle: paso.detalle });
  return NextResponse.json({ ok: true, apuntado });
}
