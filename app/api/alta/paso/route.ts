import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { leerPasoDelNavegador } from '@/lib/alta/embudo';
import { apuntarPaso } from '@/lib/alta/embudo-servidor';
import { tuEstudioGuardado } from '@/lib/alta/tu-estudio';

// ─────────────────────────────────────────────────────────────────────────────
// Los pasos del embudo del alta que SOLO ve el navegador:
//   · que la propietaria copió, mandó por WhatsApp, compartió o bajó el QR de
//     su enlace de reservas («Tu estudio ya puede recibir reservas» y «… ya
//     está en marcha»);
//   · que terminó «Tu estudio» en la bienvenida del alta nueva. Esas escrituras
//     van del navegador a la base de datos sin pasar por ninguna ruta nuestra,
//     así que no hay otro sitio donde apuntarlo. Y no se apunta porque lo pida
//     la pantalla: antes se mira en la base de datos que la dirección y el
//     horario por día están guardados (`tuEstudioGuardado`).
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

  if (paso.paso === 'config_completada') {
    const [estudio, horario] = await Promise.all([
      admin.from('studios').select('direccion, codigo_postal, ciudad').eq('id', sesion.studioId).maybeSingle(),
      admin.from('studio_horario').select('dia_semana', { count: 'exact', head: true }).eq('studio_id', sesion.studioId),
    ]);
    if (estudio.error || horario.error) return NextResponse.json({ ok: true, apuntado: false });
    const guardado = tuEstudioGuardado({
      direccion: estudio.data?.direccion as string | null | undefined,
      codigoPostal: estudio.data?.codigo_postal as string | null | undefined,
      ciudad: estudio.data?.ciudad as string | null | undefined,
      filasHorario: horario.count ?? 0,
    });
    if (!guardado) return NextResponse.json({ ok: true, apuntado: false });
  }

  const apuntado = await apuntarPaso(admin, sesion.studioId, paso.paso, { detalle: paso.detalle });
  return NextResponse.json({ ok: true, apuntado });
}
