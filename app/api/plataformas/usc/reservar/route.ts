import { after, NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarFirmaUsc } from '@/lib/plataformas/usc-firma';
import { leerPeticionReservaUsc, respuestaRechazoUsc } from '@/lib/plataformas/usc-reserva';
import { procesarInstantBookingUsc } from '@/lib/plataformas/usc/instant-booking-servidor';
import { trasReservaExterna } from '@/lib/plataformas/tras-reserva-externa';

export const dynamic = 'force-dynamic';

// Instant Booking de Urban Sports Club: cuando una socia de USC pulsa
// «Reservar» en una clase que publicamos allí, USC nos llama AQUÍ, en
// síncrono, y solo le confirma la plaza si contestamos 200/201
// (docs.urbansportsclub.io/endpoint/bookings).
//
// · Firma HMAC con el client secret (`USC_CLIENT_SECRET`): sin él no se acepta
//   nada (falla cerrado). Se firma la RUTA COMPLETA y el cuerpo crudo.
// · Presupuesto de 500-1000 ms y sin reintentos: lo que no hace falta para
//   contestar (el aviso de clase casi llena) va después, en `after()`.
// · Los rechazos van con sus códigos (E001 completa, E002 no existe/cancelada,
//   E003 fuera de plazo, E004 ya reservada, E006 otro), que USC enseña a la socia.
export async function POST(req: NextRequest) {
  const cuerpoCrudo = await req.text();
  const firma = verificarFirmaUsc({
    secreto: process.env.USC_CLIENT_SECRET,
    metodo: req.method,
    ruta: new URL(req.url).pathname,
    timestamp: req.headers.get('x-timestamp'),
    firma: req.headers.get('x-signature'),
    cuerpoCrudo,
  });
  if (!firma.ok) {
    return NextResponse.json({ code: 'E006', message: 'Invalid signature' }, { status: 401 });
  }

  let cuerpo: unknown;
  try { cuerpo = JSON.parse(cuerpoCrudo); } catch { cuerpo = null; }
  const peticion = leerPeticionReservaUsc(cuerpo);
  if (!peticion.ok) {
    const r = respuestaRechazoUsc('peticion-invalida');
    return NextResponse.json(r.cuerpo, { status: r.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    const r = respuestaRechazoUsc('error-interno');
    return NextResponse.json(r.cuerpo, { status: r.status });
  }

  const resultado = await procesarInstantBookingUsc(admin, peticion.peticion);
  if (!resultado.ok) {
    if (resultado.motivo === 'error-interno') {
      console.error('[usc/reservar]', resultado.detalle ?? 'sin detalle');
    }
    const r = respuestaRechazoUsc(resultado.motivo);
    return NextResponse.json(r.cuerpo, { status: r.status });
  }

  // Una repetición no es un hecho nuevo: sin efectos otra vez.
  if (!resultado.repetida) {
    after(() => trasReservaExterna(admin, { studioId: resultado.studioId, sesionId: resultado.sesionId }));
  }
  return NextResponse.json({ id: peticion.peticion.reservaExternaId }, { status: 201 });
}
