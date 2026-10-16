import type { SupabaseClient } from '@supabase/supabase-js';

// Un ticket a 0 € (todo descontado) no pasa por el datáfono: la venta se da por
// pagada con `confirmar_pago_venta_pos` y se entrega. Pero la ruta no miraba lo que
// contestaba: con la confirmación caída (un error de la base, una red que se corta)
// la venta seguía PENDIENTE_PAGO, la entrega no daba nada (solo entrega lo PAGADO)
// y la Caja decía «Cobrado» igual. Sin bono, sin factura y con la venta colgada.
//
// Aquí se decide qué pasó, sin suponerlo:
//   · `pagada`: la confirmación se aplicó, o ya estaba pagada. Se entrega.
//   · `sin-pagar`: la venta no quedó pagada. En un ticket a 0 € no hay ningún
//     cobro que pueda llegar después, así que se anula con el intento cerrado.
//   · `no-se-sabe`: la confirmación dio error y tampoco se pudo leer la venta. No
//     se toca nada: el reintento con la misma clave vuelve a pasar por aquí
//     (`app/api/pos/venta/route.ts`, rama `yaExistia`) y lo termina.
// Si la confirmación da error pero sí llegó a guardarse (se perdió la respuesta),
// la venta se lee PAGADA y se entrega: anularla sería imposible (el compare-and-set
// de `fallar_pago_venta_pos` no toca una PAGADA) y no entregarla, quedarse el bono.
export type ResultadoTicketACero = 'pagada' | 'sin-pagar' | 'no-se-sabe';

export async function confirmarTicketACero(
  admin: SupabaseClient,
  p: { studioId: string; ventaId: string },
): Promise<ResultadoTicketACero> {
  const { data, error } = await admin.rpc('confirmar_pago_venta_pos', {
    p_venta_id: p.ventaId, p_studio_id: p.studioId,
    p_payment_intent_id: null, p_importe_confirmado: 0,
  });
  if (!error) {
    const fila = (Array.isArray(data) ? data[0] : data) as { r_aplicado?: boolean; r_estado?: string } | null;
    return fila?.r_aplicado === true || fila?.r_estado === 'PAGADA' ? 'pagada' : 'sin-pagar';
  }

  const { data: venta, error: errLectura } = await admin.from('ventas_pos')
    .select('estado').eq('id', p.ventaId).eq('studio_id', p.studioId).maybeSingle();
  if (errLectura || !venta) return 'no-se-sabe';
  return (venta as { estado: string }).estado === 'PAGADA' ? 'pagada' : 'sin-pagar';
}
