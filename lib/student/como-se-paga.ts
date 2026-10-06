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

// ─────────────────────────────────────────────────────────────────────────────
// Sin nada que la cubra, ¿cómo se viene a esta clase? (P01 · 6-oct-2026)
//
// La hoja ofrecía «Confirmar 10:00 · 15 €» a quien no tenía bono, el servidor
// contestaba «Necesitas un plan o bono activo» y la hoja la mandaba a «Perfil →
// Comprar». Un botón que dice que sí y un servidor que dice que no. Ahora la
// hoja sabe ANTES de pulsar cuál de los cuatro casos es, con la misma regla que
// aplica el servidor (`exigePlanAlReservar` sobre `heredaOverride`).
// ─────────────────────────────────────────────────────────────────────────────

export type ComoVieneSinBono =
  /** El estudio exige plan y vende online algo que cubre la clase: se paga aquí. */
  | { caso: 'PAGA_AQUI'; desde: number }
  /** El estudio exige plan y aquí no se puede comprar nada que la cubra. Ni botón de reservar. */
  | { caso: 'PIDE_BONO_EN_ESTUDIO'; motivo: 'sin-pagos-online' | 'nada-a-la-venta' | 'precio-especial' }
  /** No exige plan y la clase tiene precio: se reserva y se paga en el estudio, el día de la clase. */
  | { caso: 'PAGA_EN_ESTUDIO'; importe: number }
  /** No exige plan y no hay precio que cobrar: se reserva sin más. */
  | { caso: 'RESERVA_SIN_PAGAR' };

/**
 * `exigePlan`: el ajuste YA resuelto para esta clase (tipo ?? estudio, y que haya
 * algo que contratar). `null` = no se sabe (un payload sin el dato): se reserva
 * como siempre y decide el servidor, en vez de inventar un muro.
 * `pagosOnline`: el estudio tiene Stripe conectado y la app la clave pública.
 * `desde`: lo más barato pagable online que cubre la clase (`desdeImporte`).
 * `importeEnEstudio`: lo que cobra el mostrador por la suelta (`importeDeClaseSuelta`).
 */
export function comoVieneSinBono({ exigePlan, pagosOnline, desde, precioEspecial, importeEnEstudio }: {
  exigePlan: boolean | null;
  pagosOnline: boolean;
  desde: number | null;
  precioEspecial: boolean;
  importeEnEstudio: number | null;
}): ComoVieneSinBono {
  if (exigePlan === true) {
    if (precioEspecial) return { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'precio-especial' };
    if (!pagosOnline) return { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' };
    if (desde == null) return { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'nada-a-la-venta' };
    return { caso: 'PAGA_AQUI', desde };
  }
  if (exigePlan === false && importeEnEstudio != null && importeEnEstudio > 0) {
    return { caso: 'PAGA_EN_ESTUDIO', importe: importeEnEstudio };
  }
  return { caso: 'RESERVA_SIN_PAGAR' };
}

/** La nota de la hoja para cada caso (el tono es el de `CARA`). `null`: la de `comoSePaga` de siempre. */
export function notaSinBono(c: ComoVieneSinBono, bonoNoCubre: boolean): { texto: string; tono: TonoPago } | null {
  const necesita = bonoNoCubre ? 'Tu bono no incluye este tipo de clase.' : 'Para esta clase necesitas un bono.';
  switch (c.caso) {
    case 'PIDE_BONO_EN_ESTUDIO':
      if (c.motivo === 'precio-especial') return { texto: 'Esta clase tiene un precio especial: resérvala en el estudio.', tono: 'bloqueo' };
      return c.motivo === 'sin-pagos-online'
        ? { texto: `${necesita} Este estudio no vende online: pídelo en recepción.`, tono: 'bloqueo' }
        : { texto: `${necesita} Desde la app no se vende ninguno que sirva para esta clase: pídelo en recepción.`, tono: 'bloqueo' };
    case 'PAGA_AQUI':
      return { texto: `${necesita} Puedes pagarla aquí: clase suelta o bono, desde ${euros(c.desde)}.`, tono: 'coste' };
    case 'PAGA_EN_ESTUDIO':
      return { texto: `Pagas ${euros(c.importe)} en el estudio, el día de la clase.`, tono: 'coste' };
    case 'RESERVA_SIN_PAGAR':
      return null;
  }
}

/**
 * ¿Se reserva sin pagar nada? Es la condición del botón «Reservar» de la fila del horario (P12): exactamente la frase
 * «No pagas nada hoy» de la hoja (`comoSePaga` en tono ok), así que el botón y la hoja no pueden contradecirse.
 */
export function seReservaSinPagar(clase: ClaseMin, bono: BonoMin | null): boolean {
  return comoSePaga(clase, bono, false).tono === 'ok';
}
