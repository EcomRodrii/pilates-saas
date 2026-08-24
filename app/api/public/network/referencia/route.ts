import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';

// Endpoint PÚBLICO (sin login): el referente confirma/rechaza desde el
// enlace del email (app/network/referencia/[token]), sin cuenta de Tentare —
// mismo patrón que app/api/public/aceptar-sustitucion. Token simple de texto
// (crypto.randomUUID(), columna `red_referencias.token`), NO un JWT firmado
// como lib/sustituciones/token.ts — otro propósito, otra forma de token.
//
// De un solo uso: solo actúa si `estado = 'pendiente'` Y `token_expira_en >
// now()`. Sin ninguna policy de UPDATE nueva para `anon`/`authenticated` —
// se resuelve con service-role, igual que red_resenas (comentario de la
// propia tabla en la migración 20260813111231).
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-referencia-network', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { token?: string; accion?: string; relacion?: string; comentario?: string } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const accion = body?.accion;
  if (!token || (accion !== 'confirmar' && accion !== 'rechazar')) {
    return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { data: referencia, error: errBuscar } = await admin
    .from('red_referencias')
    .select('id, estado, token_expira_en')
    .eq('token', token)
    .maybeSingle();
  if (errBuscar) return errorInterno('public:network:referencia:buscar', errBuscar, 'No se ha podido comprobar el enlace.');
  if (!referencia) return NextResponse.json({ ok: false, motivo: 'no_encontrada', error: 'Enlace no válido' }, { status: 404 });

  // De un solo uso: una vez resuelta (o expirada a mano), ningún reintento
  // vuelve a tocarla — sin importar si el segundo tap llega con el mismo token.
  if (referencia.estado !== 'pendiente') {
    return NextResponse.json({ ok: false, motivo: 'ya_resuelta', error: 'Esta solicitud ya se resolvió' }, { status: 409 });
  }
  if (new Date(referencia.token_expira_en as string).getTime() <= Date.now()) {
    // Deja constancia de la caducidad para que no vuelva a leerse 'pendiente'.
    await admin.from('red_referencias').update({ estado: 'expirada' }).eq('id', referencia.id).eq('estado', 'pendiente');
    return NextResponse.json({ ok: false, motivo: 'caducada', error: 'Este enlace ha caducado' }, { status: 409 });
  }

  const relacion = typeof body?.relacion === 'string' && body.relacion.trim() ? body.relacion.trim() : undefined;
  // `comentario` se acepta en el body (pedido del formulario público) pero
  // `red_referencias` no tiene columna para guardarlo — la migración
  // 20260813111231 ya está aplicada y esta tarea no crea migraciones nuevas.
  // Se descarta a propósito, no por descuido.

  const { error: errUpdate } = await admin
    .from('red_referencias')
    .update({
      estado: accion === 'confirmar' ? 'confirmada' : 'rechazada',
      resuelto_en: new Date().toISOString(),
      ...(relacion ? { relacion } : {}),
    })
    .eq('id', referencia.id)
    .eq('estado', 'pendiente'); // compare-and-set: si otro tap ganó la carrera, este UPDATE no toca nada
  if (errUpdate) return errorInterno('public:network:referencia:update', errUpdate, 'No se ha podido registrar tu respuesta.');

  return NextResponse.json({ ok: true, estado: accion === 'confirmar' ? 'confirmada' : 'rechazada' });
}
