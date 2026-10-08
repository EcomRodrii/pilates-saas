import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MENSAJE_MOTIVO_REGALO } from '@/lib/regalo/reglas';
import { anularTarjeta, usarSaldo } from '@/lib/regalo/servidor';
import { enviarCorreosRegalo } from '@/lib/regalo/enviar';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acciones sobre una tarjeta: { accion: 'usar' | 'anular' | 'reenviar' }.
//  · usar: gasta saldo en el mostrador. El cliente manda una clave de idempotencia POR CLIC
//    (`idemKey`): un doble clic o un reintento por red caída no gasta dos veces. Importe en
//    euros con hasta 2 decimales; el saldo lo decide la base de datos con candado de fila.
//  · anular: con motivo obligatorio; retira el saldo que quede (lo gastado no vuelve).
//  · reenviar: repite el correo a quien recibe (el justificante de quien compró no se repite).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json({ error: 'Tu rol no puede mover tarjetas regalo' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'regalo-staff-accion', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Tarjeta no válida' }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  // Sin `bloqueoPorSuscripcion` a propósito: gastar o anular saldo de una tarjeta YA vendida no es una
  // función de pago del estudio, y bloquearlo por una suscripción SaaS caducada dejaría a una clienta
  // sin poder usar lo que ya pagó. (Vender sí lo comprueba.)
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    if (b.accion === 'usar') {
      const importe = typeof b.importeEur === 'number' ? Math.round(b.importeEur * 100) / 100 : NaN;
      if (!Number.isFinite(importe) || importe <= 0 || importe > 2000) return NextResponse.json({ error: 'Indica un importe válido.' }, { status: 400 });
      const idem = typeof b.idemKey === 'string' ? b.idemKey : '';
      if (idem.length < 8 || idem.length > 80) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
      const nota = typeof b.nota === 'string' && b.nota.trim() ? b.nota.trim().slice(0, 300) : null;
      const r = await usarSaldo(admin, sesion.studioId, id, importe, idem, sesion.userId ?? null, nota);
      if (!r.ok) {
        return NextResponse.json({ error: MENSAJE_MOTIVO_REGALO[r.motivo ?? ''] ?? 'No se ha podido gastar el saldo.', saldo: r.saldo }, { status: r.motivo === 'error' ? 500 : 409 });
      }
      return NextResponse.json({ ok: true, saldo: r.saldo });
    }
    if (b.accion === 'anular') {
      const motivo = typeof b.motivo === 'string' ? b.motivo : '';
      const r = await anularTarjeta(admin, sesion.studioId, id, motivo, 'staff', sesion.userId ?? null);
      if (!r.ok) return NextResponse.json({ error: MENSAJE_MOTIVO_REGALO[r.motivo ?? ''] ?? 'No se ha podido anular.' }, { status: r.motivo === 'error' ? 500 : 400 });
      return NextResponse.json({ ok: true, saldoRetirado: r.saldoRetirado });
    }
    if (b.accion === 'reenviar') {
      // Enfriamiento por tarjeta: «Reenviar» manda un correo a un tercero; no se repite en bucle.
      const { data: previa } = await admin.from('tarjetas_regalo').select('correo_enviado_en').eq('id', id).eq('studio_id', sesion.studioId).maybeSingle();
      const ultimo = previa?.correo_enviado_en ? Date.parse(String(previa.correo_enviado_en)) : 0;
      if (Date.now() - ultimo < 60_000) return NextResponse.json({ error: 'Acabas de enviarlo. Espera un minuto antes de reenviarlo.' }, { status: 429 });
      const r = await enviarCorreosRegalo(admin, sesion.studioId, id, { soloDestinataria: true });
      if (!r.ok) return NextResponse.json({ error: r.skipped ? 'El envío de correos no está configurado.' : 'No se ha podido enviar el correo. Inténtalo de nuevo.' }, { status: 502 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err) {
    return errorInterno('regalo/[id]:POST', err, 'No se ha podido completar la operación.');
  }
}
