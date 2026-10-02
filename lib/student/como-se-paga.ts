import { euros } from './formato.ts';

export type TonoPago = 'ok' | 'coste' | 'bloqueo';

interface ClaseMin { sinPrecioSuelto?: boolean; precioSuelto: number }
interface BonoMin { nombre: string; creditosTotales: number; creditosUsados: number }

/**
 * Qué se le dice a la alumna sobre CÓMO se paga esta clase, y con qué cara.
 *
 * ⚠️ Los cuatro mensajes se pintaban con el MISMO adorno: círculo verde de
 * `--success` con un ✓ y fondo de acento. Dos de los cuatro no son buenas
 * noticias sino un MURO —«esta clase solo se reserva con bono»— y un tercero
 * avisa de que va a pagar. Un ✓ verde encima de «no puedes reservar esto» es
 * exactamente la señal contraria, y estaba en la última pantalla antes de
 * confirmar, que es donde más caro sale equivocarse.
 *
 * Vive en `lib/` y no dentro del componente porque el TONO es una decisión, no
 * un estilo — y así se prueba con `node --test`, que no carga `.tsx`.
 */
export function comoSePaga(
  clase: ClaseMin,
  bono: BonoMin | null,
  bonoNoCubre: boolean,
): { texto: string; tono: TonoPago } {
  // Un plan mensual ilimitado llega con `creditosTotales: Infinity` (`bonoDeSuscripcion`): no tiene
  // contador que enseñar. Sin esta rama el texto salía «(Infinity disponibles)» en la última pantalla
  // antes de confirmar. Y no se «usa una sesión»: la cuota la cubre y no gasta ningún bono.
  if (bono && !Number.isFinite(bono.creditosTotales)) {
    return { texto: 'Incluida en tu mensualidad. No pagas nada hoy.', tono: 'ok' };
  }
  const quedan = bono ? bono.creditosTotales - bono.creditosUsados : 0;
  if (bono && quedan > 0) {
    return {
      texto: `Se usará 1 sesión de tu ${bono.nombre.toLowerCase()} (${quedan} disponibles). No pagas nada hoy.`,
      tono: 'ok',
    };
  }
  if (bonoNoCubre) {
    return clase.sinPrecioSuelto
      ? { texto: 'Tu bono no incluye este tipo de clase, y esta solo se reserva con bono.', tono: 'bloqueo' }
      : { texto: `Tu bono no incluye este tipo de clase: se cobra como suelta, ${euros(clase.precioSuelto)}.`, tono: 'coste' };
  }
  return clase.sinPrecioSuelto
    ? { texto: 'Esta clase solo se reserva con bono. Puedes comprar uno desde Perfil → Comprar.', tono: 'bloqueo' }
    : { texto: `Sin bono activo: clase suelta ${euros(clase.precioSuelto)}.`, tono: 'coste' };
}
