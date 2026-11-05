// «Vista previa» de los dos avisos de crecimiento (el «¡Felicidades!» del plan gratis y el modal de Review Boost): la
// propietaria abre el panel con `?vista-previa=felicidades` o `?vista-previa=review-boost` y los ve tal cual saldrán,
// SIN tocar ningún dato: no se apunta nada en el estudio, no se manda feedback, no se guarda que se vio ni se abre el pago.
// Pura y sin `@/`: se prueba con `node --test`.

export type VistaPrevia = 'felicidades' | 'review-boost';

export function vistaPreviaSolicitada(search: string): VistaPrevia | null {
  try {
    const v = new URLSearchParams(search).get('vista-previa');
    return v === 'felicidades' || v === 'review-boost' ? v : null;
  } catch {
    return null;
  }
}
