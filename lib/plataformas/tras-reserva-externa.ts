// Dueño único del hecho «una plataforma ha vendido una plaza y Tentare la ha
// registrado» (ver «un dueño por hecho» en lib/db/supabase-data-admin.ts).
//
// Vive aparte, en un módulo LIGERO, porque lo usan dos caminos con presupuestos
// muy distintos: el mostrador (`crearReservaExterna`) y el Instant Booking de
// Urban Sports Club, que tiene que contestar en menos de un segundo y no puede
// arrastrar todo `supabase-data-admin` al arrancar en frío.
//
// La persona NO es socia del estudio, así que de los efectos de una reserva
// solo aplica lo que es del ESTUDIO:
//  · SÍ: el aviso de «clase casi llena» a la propietaria.
//  · NO: bono (no paga en Tentare), aviso a la alumna (no es nuestra alumna),
//    créditos de primera reserva, gamificación ni la captura del embudo. Ningún
//    recibo: no pasa por Stripe. (Una guardia estática en
//    lib/plataformas/reserva-externa.test.ts lo vigila.)
import type { SupabaseClient } from '@supabase/supabase-js';

export async function trasReservaExterna(admin: SupabaseClient, p: { studioId: string; sesionId: string }) {
  const { emitirClaseCasiLlena } = await import('@/lib/notifications/emit');
  await emitirClaseCasiLlena(admin, { studioId: p.studioId, sesionId: p.sesionId });
}
