import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { registrarAuditoriaServidor } from '@/lib/auditoria/registrar-servidor';
import { COLUMNAS_QUE_BLOQUEAN, puedeCambiarImporte, validarNuevoImporte, type FilaParaCambiarImporte } from '@/lib/cobros/cambiar-importe-reglas';

export const dynamic = 'force-dynamic';

// «Cambiar el importe» de un recibo PENDIENTE (lib/cobros/cambiar-importe-reglas.ts). El navegador no escribe `importe` de `recibos`: lo
// hace esta ruta, con service-role, con las mismas reglas que decide la pantalla y UN compare-and-set (solo si sigue pendiente, con el
// importe que se leyó y sin ningún pago abierto), así que dos clics, otra pestaña o un cobro a medias no pisan nada.
// Escribe con service-role: el trigger del libro no ve quién fue (`auth.uid()` es NULL), así que lo anota aquí con la sesión como actor.

const CAMPOS = ['id', 'estado', 'importe', 'concepto', 'socio_id', 'intentos_reintento', 'factura_pendiente_sellar', 'entrega_aplicada', ...COLUMNAS_QUE_BLOQUEAN].join(', ');

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json({ error: 'Tu rol no puede cambiar importes de cobros' }, { status: 403 });

  const limitado = await enforceRateLimit(req, 'cobros-cambiar-importe', { max: 30, windowSeconds: 60 }, sesion.userId);
  if (limitado) return limitado;

  const cuerpo = (await req.json().catch(() => null)) as { reciboId?: unknown; importe?: unknown } | null;
  const reciboId = typeof cuerpo?.reciboId === 'string' && cuerpo.reciboId.length > 0 && cuerpo.reciboId.length <= 200 ? cuerpo.reciboId : null;
  if (!reciboId) return NextResponse.json({ error: 'Falta el recibo' }, { status: 400 });
  const nuevo = validarNuevoImporte(cuerpo?.importe);
  if (!nuevo.ok) return NextResponse.json({ error: nuevo.error }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  // El estudio sale SIEMPRE de la sesión: un id de otro estudio es «no encontrado».
  const { data, error: errLeer } = await admin.from('recibos').select(CAMPOS).eq('id', reciboId).eq('studio_id', sesion.studioId).maybeSingle();
  if (errLeer) {
    Sentry.captureMessage('[cobros] cambiar importe: no se pudo leer el recibo', { level: 'error', tags: { area: 'cobros', tipo: 'cambiar-importe' }, extra: { reciboId, error: errLeer.message } });
    return NextResponse.json({ error: 'No se ha podido leer el recibo. Inténtalo otra vez.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Recibo no encontrado' }, { status: 404 });
  const fila = data as unknown as FilaParaCambiarImporte & { concepto: string | null; socio_id: string | null };

  const puede = puedeCambiarImporte(fila);
  if (!puede.ok) return NextResponse.json({ error: puede.motivo }, { status: 409 });
  const anterior = Number(fila.importe);
  if (anterior === nuevo.importe) return NextResponse.json({ ok: true, importe: nuevo.importe, sinCambios: true });

  // Compare-and-set: solo si SIGUE pendiente, con el mismo importe y sin ninguna columna de pago escrita.
  let q = admin.from('recibos').update({ importe: nuevo.importe })
    .eq('id', reciboId).eq('studio_id', sesion.studioId).eq('estado', 'PENDIENTE').eq('importe', fila.importe as number)
    .eq('intentos_reintento', fila.intentos_reintento ?? 0);
  for (const c of COLUMNAS_QUE_BLOQUEAN) q = q.is(c, null);
  const { data: escrito, error: errEscribir } = await q.select('id');
  if (errEscribir) {
    Sentry.captureMessage('[cobros] cambiar importe: no se pudo escribir', { level: 'error', tags: { area: 'cobros', tipo: 'cambiar-importe' }, extra: { reciboId, error: errEscribir.message } });
    return NextResponse.json({ error: 'No se ha podido guardar el importe. Inténtalo otra vez.' }, { status: 500 });
  }
  if (!escrito || escrito.length === 0) {
    return NextResponse.json({ error: 'Este recibo acaba de cambiar (se ha cobrado o tiene un pago abierto). Recarga y vuelve a mirarlo.' }, { status: 409 });
  }

  await registrarAuditoriaServidor(admin, {
    sesion, tabla: 'recibos', filaId: reciboId, operacion: 'UPDATE', socioId: fila.socio_id,
    antes: { importe: anterior }, despues: { importe: nuevo.importe },
    contexto: { accion: 'RECIBO_IMPORTE_CAMBIADO', concepto: fila.concepto ?? undefined },
  });

  return NextResponse.json({ ok: true, importe: nuevo.importe });
}
