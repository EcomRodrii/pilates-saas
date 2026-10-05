import { euros, precioClaseTexto } from './formato.ts';
import { esCuota } from './bono-cubre.ts';

export type TonoPago = 'ok' | 'coste' | 'bloqueo';

interface ClaseMin { sinPrecioSuelto?: boolean; precioSuelto: number }
interface BonoMin { nombre: string; creditosTotales: number; creditosUsados: number; tipoPlan?: string | null }

/**
 * La única definición de «¿es una cuota?» vive en `bono-cubre.ts` (manda el tipo del plan; sin tipo, el contador). Se
 * reexporta aquí porque es donde la buscan las pantallas que pintan cómo se paga.
 */
export { esCuota };

/** Sin límite y sin ser cuota: un bono ilimitado (p. ej. anual). No gasta sesiones, pero tampoco es «tu cuota». */
function ilimitadoNoCuota(bono: BonoMin | null): boolean {
  return !!bono && !Number.isFinite(bono.creditosTotales) && !esCuota(bono);
}

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
 *
 * ⚠️ Es LA clasificación: la fila corta de la ficha (`textoPagoCorto`), la fila del horario y de Inicio
 * (`textoPagoFila`) y la hoja salen de las mismas tres preguntas (¿cuota?, ¿sin límite?, ¿le quedan?) en el mismo
 * orden, para que dos frases de la misma pantalla no puedan contradecirse.
 */
export function comoSePaga(
  clase: ClaseMin,
  bono: BonoMin | null,
  bonoNoCubre: boolean,
): { texto: string; tono: TonoPago } {
  // Una cuota la cubre y no gasta ningún bono. «Mensualidad» se queda: es la palabra que fija la hoja
  // (student-auditoria) y la que ya leen las alumnas; los textos nuevos dicen «cuota».
  if (bono && esCuota(bono)) {
    return { texto: 'Incluida en tu mensualidad. No pagas nada hoy.', tono: 'ok' };
  }
  // Un bono SIN LÍMITE que no es cuota: tampoco gasta una sesión, pero no es «tu mensualidad». Antes caía en la frase
  // de la cuota y le hablaba de una mensualidad que no tiene.
  if (ilimitadoNoCuota(bono)) {
    return { texto: `Incluida en tu ${bono!.nombre.toLowerCase()}. No pagas nada hoy.`, tono: 'ok' };
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

/**
 * La fila corta de la ficha de la clase, bajo la foto («plazas · coste»). Con una cuota decía «Con tu bono · 1 sesión»: ni
 * es un bono ni gasta una sesión, y las alumnas de cuota (que son las de clase fija) leían que se les descontaba algo.
 * Misma frase que la web pública (`textoCoberturaCorto`, «Incluida en tu plan»), con la palabra de la app: cuota.
 */
export function textoPagoCorto(clase: ClaseMin, bono: BonoMin | null): string {
  if (esCuota(bono)) return 'Incluida en tu cuota';
  if (ilimitadoNoCuota(bono)) return 'Incluida en tu bono';
  if (bono) return 'Con tu bono · 1 sesión';
  return clase.sinPrecioSuelto ? 'Solo con bono' : `${euros(clase.precioSuelto)} clase suelta`;
}

/**
 * Lo que dice la fila de una clase en los listados (Inicio, Calendario y Horario) bajo sus plazas.
 *
 * Decía «1 sesión» a todo el que tuviera algo que cubriera la clase, cuota incluida: 29 cuotas ilimitadas activas en
 * producción (5-oct-2026), todas leyendo que se les gastaba una sesión que nadie les iba a descontar.
 */
export function textoPagoFila(clase: ClaseMin, bono: BonoMin | null): string {
  if (esCuota(bono)) return 'Cuota';
  if (ilimitadoNoCuota(bono)) return 'Incluida';
  if (bono) return '1 sesión';
  return precioClaseTexto(clase);
}
