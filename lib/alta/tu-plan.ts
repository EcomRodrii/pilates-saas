// ─────────────────────────────────────────────────────────────────────────────
// «Tu plan, sin sorpresas» (maqueta aprobada del 21-oct-2026, «08 · El panel
// después», decisión D2 del fundador): ni plan ni tarjeta en el alta; el plan
// se enseña UNA vez, tras la primera reserva, con el uso REAL.
//
// Qué dice y cuándo, en puro (tu-plan.test.ts):
//   · Solo con Founding Studio GRATIS de verdad: el `gratis` que ya deriva el
//     servidor en /api/billing/status (que solo existe con FOUNDING_GRATIS
//     encendido para el estudio y el estudio en ese plan) y ya medido. Sin él no
//     se enseña nada: con la prueba de siempre esta tarjeta mentiría.
//   · Dentro de los límites o cerca (DENTRO, CERCA). Pasado un límite, «mientras
//     no pases de ahí, no pagas nada» sería falso: de eso ya avisa el panel en
//     su sitio (la píldora y /suscripcion), con el margen que queda.
//   · Las cifras, las mismas que /suscripcion: alumnas activas (el chip
//     «Activa») y las reservas de las clases de los ÚLTIMOS 30 DÍAS, que es lo
//     que mide `uso-gratis-servidor`. No «este mes»: no es lo que se cuenta.
//   · Con «Varias» sedes en el alta, el plan que se enseña es Cadena: Founding
//     gratis es «todo menos varias sedes».
//   · Si nombra Founding Studio DE PAGO, dice lo que va aparte (decisión D10):
//     desde el 20-oct, el Centro de Control, las sustituciones automáticas y la
//     redacción con IA (`COMPLEMENTOS_CORTO`).
// Precios y límites, siempre de las constantes que el producto aplica.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

import { PLAN_INFO } from '../billing/entitlements.ts';
import type { EstadoGratisApi } from '../billing/plan-gratis.ts';
import { COMPLEMENTOS_CORTO, GRATIS_MARGEN_DIAS, PRECIO_FOUNDING_PAGO } from '../landing/founding-gratis.ts';
import { otrasSedes, type Sedes } from './tu-estudio.ts';

export interface CifraDelPlan {
  etiqueta: string;
  valor: number;
  limite: number;
}

export interface TarjetaDelPlan {
  /** «Founding Studio · gratis» (con «· 1 sede» si dijo varias). */
  subtitulo: string;
  cifras: [CifraDelPlan, CifraDelPlan];
  texto: string;
}

export function tarjetaDelPlan(p: { gratis: EstadoGratisApi | null | undefined; sedes: Sedes | null }): TarjetaDelPlan | null {
  const g = p.gratis;
  if (!g?.uso || (g.fase !== 'DENTRO' && g.fase !== 'CERCA')) return null;
  const founding = PLAN_INFO.BASE.nombre;
  const varias = p.sedes?.tipo === 'varias' ? p.sedes : null;
  const cadena = PLAN_INFO.CADENA;
  const texto = varias
    ? `Mientras no pases de ahí, no pagas nada. Para abrir ${varias.total === 2 ? 'tu otra sede' : `tus otras ${otrasSedes(varias.total)} sedes`} en este panel: plan ${cadena.nombre}, ${cadena.precioMes} €/mes, una sola suscripción para toda la cadena.`
    : `Mientras no pases de ahí, no pagas nada. Si un día pasas, tienes ${GRATIS_MARGEN_DIAS} días para pasar a ${founding} de pago: ${PRECIO_FOUNDING_PAGO} €/mes, sin tope y sin permanencia, con ${COMPLEMENTOS_CORTO} aparte.`;
  return {
    subtitulo: varias ? `${founding} · gratis · 1 sede` : `${founding} · gratis`,
    cifras: [
      { etiqueta: 'Alumnas activas', valor: g.uso.alumnasActivas, limite: g.limites.alumnas },
      { etiqueta: 'Reservas en los últimos 30 días', valor: g.uso.reservas30Dias, limite: g.limites.reservasMes },
    ],
    texto,
  };
}

/**
 * ¿Toca enseñarla ahora? Tras la primera reserva, una sola vez (lo dice el
 * embudo, `plan_ensenado`), y con la respuesta del servidor ya leída: sin ella
 * no se sabe si ya salió, y enseñarla dos veces es peor que esperar.
 */
export function tocaEnsenarPlan(p: { primeraReserva: boolean; planEnsenado: boolean | null; descartadaAqui: boolean }): boolean {
  return p.primeraReserva && p.planEnsenado === false && !p.descartadaAqui;
}
