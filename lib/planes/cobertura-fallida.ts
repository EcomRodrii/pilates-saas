// ─────────────────────────────────────────────────────────────────────────────
// Qué se le dice a la propietaria cuando la tarifa SÍ se guardó pero no a qué
// clases da acceso (`plan_tipos_clase`). Puro: se prueba con `node --test`.
//
// Antes salía «No se ha guardado: …» con el formulario abierto, y era falso: la
// tarifa existía (a la venta y valiendo para TODAS las clases), y un segundo
// «Crear» hacía otra igual. Ahora el formulario se cierra, la tarifa sale en la
// lista tal como quedó y esto dice lo que de verdad pasó y qué hacer.
// ─────────────────────────────────────────────────────────────────────────────

export function avisoCoberturaFallida(p: {
  nombre: string;
  /** Editando una que ya existía (la fila se cambió; la cobertura, no). */
  editando: boolean;
  /** Se pidió que estuviera a la venta. */
  aLaVenta: boolean;
  /** Al crearla se retiró de la venta para que nadie la compre así. */
  desactivada: boolean;
}): string {
  const nombre = `«${p.nombre.trim() || 'La tarifa'}»`;
  if (p.editando) {
    if (p.desactivada) {
      return `Los cambios de ${nombre} se han guardado, pero no a qué clases da acceso, así que la hemos dejado sin poner a la venta. Ábrela con el lápiz, elige sus clases y vuelve a ponerla a la venta.`;
    }
    // No se dice «sigue con las de antes»: si antes valía para todas, sigue así.
    return `Los cambios de ${nombre} se han guardado, pero no a qué clases da acceso. Ábrela con el lápiz y revísalas.`;
  }
  if (p.desactivada) {
    return `${nombre} se ha creado, pero no hemos podido guardar a qué clases da acceso, así que la hemos dejado sin poner a la venta. Ábrela con el lápiz, elige sus clases y vuelve a ponerla a la venta.`;
  }
  if (!p.aLaVenta) {
    return `${nombre} se ha creado sin poner a la venta, pero no hemos podido guardar a qué clases da acceso. Ábrela con el lápiz y elígelas.`;
  }
  // Se pidió a la venta y no se pudo retirar: vale para todas las clases.
  return `${nombre} se ha creado y está a la venta, pero no hemos podido guardar a qué clases da acceso: ahora vale para TODAS. Ábrela con el lápiz y elígelas, o quítala de la venta.`;
}
