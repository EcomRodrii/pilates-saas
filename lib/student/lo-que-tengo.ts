// «Lo que tengo»: UNA respuesta para toda la app a «¿qué tengo y cuánto me queda?» (Mi plan, 6-oct-2026).
//
// Antes cinco sitios lo decidían cada uno a su manera: Tu ritmo (Inicio) restaba `creditosTotales - creditosUsados` a
// mano, el héroe de Bonos elegía su bono con `compararPorElegibilidad`, la tarjeta de Perfil sumaba los saldos con
// `saldoBono`, «Cómo vienes» preguntaba por la clase y la tarjeta del bono tenía su propia barra. Con un bono renovado o
// con una cuota y un bono a la vez, dos pantallas podían contar cosas distintas del mismo plan.
//
// Aquí se decide una vez, con las reglas que ya existían:
//   · la cuota que manda y el bono que se gasta primero salen del MISMO orden que el servidor (`compararPorElegibilidad`);
//   · «la mensual gana»: con una cuota, el bono es lo de «también tienes» (se usa cuando la cuota no cubre la clase);
//   · el saldo es el de `saldoBono` (con su «de M» solo cuando es verdad), nunca una resta suelta.
//
// Puro y sin `@/`: lo prueba `node --test` (lo-que-tengo.test.ts).

import { compararPorElegibilidad, esCuota } from './bono-cubre.ts';
import { saldoBono } from './saldo-bono.ts';
import type { Bono, PlazaFijaVista, RecuperacionesVista } from './tipos.ts';

export interface LoQueTengo {
  /** La cuota que manda (activa). `null` = sin cuota. */
  cuota: Bono | null;
  /** El bono de sesiones que el servidor gastaría primero (activo, con contador). `null` = sin bono. */
  bono: Bono | null;
  /** Su saldo (`saldoBono`), del MISMO bono. */
  saldo: { quedan: number; de: number | null } | null;
  /** Lo que le queda sumando TODOS sus bonos de sesiones activos (Perfil: «7 te quedan · en 2 bonos»). */
  sesionesEnBonos: number;
  /** Cuántos bonos de sesiones activos con saldo. */
  bonosConSesiones: number;
  /** Lo demás que está activo (otra cuota, otro bono, un bono sin límite que no es cuota): su tarjeta de siempre. */
  otros: Bono[];
  /** Lo que ya no está activo (agotado, caducado, en pausa, cancelado), lo más reciente primero. */
  anteriores: Bono[];
  /** Sin nada activo y con la cuota en pausa: no se le ofrece «Renovar» (decisión del fundador, 5-oct). */
  cuotaEnPausa: boolean;
  /** Sus clases fijas vigentes (`proyectarPlazasFijas` ya deja fuera las de baja y las vencidas), activas o en pausa. */
  fijas: PlazaFijaVista[];
  recuperaciones: { disponibles: number; proximaCaducidad: string | null };
}

/** Un bono con contador (no una cuota, no sin límite). Uno activo sin sesiones lo proyecta `mapeo` como `agotado`. */
function esDeSesiones(b: Bono): boolean {
  return !esCuota(b) && Number.isFinite(b.creditosTotales);
}

export function loQueTengo({ bonos, plazas = [], recuperaciones }: {
  bonos: readonly Bono[];
  plazas?: readonly PlazaFijaVista[];
  recuperaciones?: Pick<RecuperacionesVista, 'disponibles' | 'proximaCaducidad'> | null;
}): LoQueTengo {
  const activos = bonos.filter((b) => b.estado === 'activo');
  const cuota = [...activos.filter((b) => esCuota(b))].sort(compararPorElegibilidad)[0] ?? null;
  const deSesiones = activos.filter(esDeSesiones).filter((b) => saldoBono(b).quedan > 0);
  const bono = [...deSesiones].sort(compararPorElegibilidad)[0] ?? null;
  const s = bono ? saldoBono(bono) : null;
  const anteriores = bonos
    .filter((b) => b.estado !== 'activo')
    .sort((a, b) => (b.compradoEn ?? '').localeCompare(a.compradoEn ?? ''));
  return {
    cuota,
    bono,
    saldo: s ? { quedan: s.quedan, de: s.de } : null,
    sesionesEnBonos: deSesiones.reduce((n, b) => n + saldoBono(b).quedan, 0),
    bonosConSesiones: deSesiones.length,
    otros: activos.filter((b) => b.id !== cuota?.id && b.id !== bono?.id),
    anteriores,
    cuotaEnPausa: activos.length === 0 && anteriores.some((b) => b.estado === 'pausado' && esCuota(b)),
    fijas: [...plazas],
    recuperaciones: {
      disponibles: recuperaciones?.disponibles ?? 0,
      proximaCaducidad: recuperaciones?.proximaCaducidad ?? null,
    },
  };
}

/** ¿Tiene algo que enseñar en «Lo tuyo»/Mi plan? Sin nada, la pantalla habla a la recién llegada. */
export function tieneAlgo(t: LoQueTengo): boolean {
  return !!t.cuota || !!t.bono || t.otros.length > 0 || t.fijas.length > 0 || t.recuperaciones.disponibles > 0;
}
