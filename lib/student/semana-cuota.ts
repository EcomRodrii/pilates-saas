// «Esta semana» de una cuota con tope (P4-E, 5-oct-2026): cuántas clases le cuentan y cuántas incluye. Puro y sin `@/`
// (lo prueba `node --test`); lo usa la ruta /api/public/mis-bonos con las reservas que lee de la base.
//
// ⚠️ La MISMA cuenta que el tope de verdad (`calcular_excede_limite_semanal`, migr 20261002134242), para que la
// pantalla no diga «te queda una» cuando el servidor ya no la deja reservar:
//   · la semana va de lunes a lunes en la hora del estudio, y dura 7×24 h desde ese lunes (como
//     `v_semana_ini + interval '7 days'`), no «hasta el lunes siguiente»: la semana del cambio de hora no pierde una hora;
//   · cuentan CONFIRMADA, ASISTIDA y NO_ASISTIO (quien falta sin avisar ha usado esa clase), de clases no canceladas;
//   · el total, solo de los tipos que cubre el plan; el de cada actividad, solo de esa actividad.
//   · El SQL cuenta TAMBIÉN las pagadas con una recuperación: aquí se cuentan igual y se dicen aparte
//     (`conRecuperacion`), para que «2 de 2» no esconda que una entró por una recuperación.

import { ESTADOS_QUE_USAN_LA_SEMANA } from '../recuperaciones/derecho-semanal.ts';

export { ESTADOS_QUE_USAN_LA_SEMANA };

/** El lunes de la semana de `hoy` (YYYY-MM-DD, día del estudio). */
export function lunesDeLaSemana(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia);
  return d.toISOString().slice(0, 10);
}

/** [desde, hasta) de la semana: `desde` es el inicio del lunes en la hora del estudio (lo da quien llama). */
export function ventanaSemana(inicioDelLunes: string): { desde: string; hasta: string } {
  return { desde: inicioDelLunes, hasta: new Date(Date.parse(inicioDelLunes) + 7 * 86_400_000).toISOString() };
}

export interface ReservaSemana { id: string; estado: string; inicio: string; tipoClaseId: string | null; claseCancelada: boolean | null }

export interface PlanSemana {
  limiteSemanal: number | null;
  /** Tipos que cubre (vacío = todos), como `planCubreTipoClase`. */
  tiposClaseIds: string[];
  /** Topes por actividad (`plan_tipos_clase.limite_semanal`). */
  limitePorTipo: Record<string, number>;
}

export interface SemanaCuota {
  limite: number | null;
  cuentan: number;
  conRecuperacion: number;
  porTipo: { tipoClaseId: string; limite: number; cuentan: number }[];
}

const cubre = (p: PlanSemana, tipo: string | null) => p.tiposClaseIds.length === 0 || !tipo || p.tiposClaseIds.includes(tipo);

export function contarSemana(
  reservas: readonly ReservaSemana[],
  plan: PlanSemana,
  ventana: { desde: string; hasta: string },
  pagadasConRecuperacion: ReadonlySet<string>,
): SemanaCuota {
  const desde = Date.parse(ventana.desde);
  const hasta = Date.parse(ventana.hasta);
  const usan = reservas.filter((r) => {
    if (!(ESTADOS_QUE_USAN_LA_SEMANA as readonly string[]).includes(r.estado)) return false;
    if (r.claseCancelada === true) return false;
    const t = Date.parse(r.inicio);
    return t >= desde && t < hasta;
  });
  const delPlan = usan.filter((r) => cubre(plan, r.tipoClaseId));
  return {
    limite: plan.limiteSemanal && plan.limiteSemanal > 0 ? plan.limiteSemanal : null,
    cuentan: delPlan.length,
    conRecuperacion: delPlan.filter((r) => pagadasConRecuperacion.has(r.id)).length,
    porTipo: Object.entries(plan.limitePorTipo)
      .filter(([, limite]) => limite > 0)
      .map(([tipoClaseId, limite]) => ({ tipoClaseId, limite, cuentan: usan.filter((r) => r.tipoClaseId === tipoClaseId).length })),
  };
}

/**
 * «1 de 2» sin las pagadas con recuperación, que van aparte; si se pasa del tope (el estudio la apuntó a mano), la
 * cifra entera: «3 clases · tu cuota incluye 2», sin recortar.
 */
export function textoSemana(s: SemanaCuota): { cifra: string; recuperacion: string | null } | null {
  if (s.limite === null) return null;
  const propias = s.cuentan - s.conRecuperacion;
  const cifra = propias > s.limite
    ? `${propias} clases · tu cuota incluye ${s.limite}`
    : `${propias} de ${s.limite}`;
  const recuperacion = s.conRecuperacion > 0 ? `+${s.conRecuperacion} con recuperación` : null;
  return { cifra, recuperacion };
}
