import type { PlanTarifa, Reserva, Sesion, Suscripcion } from '../types.ts';
import { frecuenciaDesdeAsistidas } from '../decision/senales.ts';

const MS_DIA = 86_400_000;

export interface ConfigOpening {
  umbralAmarillo: number;
  umbralRojo: number;
  conversionLeads: number;
  ventanaAnalisisDias: number;
  /** Supuesto para planes sin tope semanal y sin historial: sesiones/semana. */
  sesionesSemanaSinTope: number;
  /** Supuesto para bonos sin caducidad: semanas en que se gastan. */
  semanasBonoSinCaducidad: number;
}

export const CONFIG_OPENING_DEFECTO: ConfigOpening = {
  umbralAmarillo: 0.7,
  umbralRojo: 0.85,
  conversionLeads: 0.2,
  ventanaAnalisisDias: 42,
  sesionesSemanaSinTope: 2,
  semanasBonoSinCaducidad: 8,
};

export type OrigenDemanda = 'OBSERVADA' | 'ESTIMADA_POR_PLAN';
export type NivelRiesgo = 'SIN_OFERTA' | 'VERDE' | 'AMARILLO' | 'ROJO';

export type SesionCapacidad = Pick<Sesion, 'inicio' | 'aforoMaximo' | 'cancelada'>;
export type SuscripcionDemanda = Pick<Suscripcion, 'socioId' | 'planId' | 'estado' | 'fechaFin' | 'sesionesRestantes'>;
export type PlanDemanda = Pick<PlanTarifa, 'id' | 'tipo' | 'sesiones' | 'limiteSemanal' | 'validezDias'>;
export type AsistidaDemanda = Pick<Reserva, 'creadoEn'>;

export interface EntradaCapacidad {
  sesiones: SesionCapacidad[];
  suscripciones: SuscripcionDemanda[];
  planes: PlanDemanda[];
  /** Socias en LEAD o INTERESADA. */
  leads: number;
  /** Asistidas por socia, más reciente primero (contrato de frecuenciaDesdeAsistidas). */
  asistidasPorSocio: Map<string, AsistidaDemanda[]>;
  config: ConfigOpening;
  now: Date;
}

export interface AnalisisCapacidad {
  ventana: { desde: string; hasta: string; dias: number };
  capacidadPublicada: number;
  sesionesEnVentana: number;
  /** Plazas que ocuparán las suscripciones activas dentro de la ventana. */
  demandaComprometida: number;
  desglose: Record<OrigenDemanda, { suscripciones: number; plazas: number }>;
  /** Plazas si convierten los leads al ritmo configurado. Nunca se suma sola al riesgo. */
  demandaPotencial: number;
  leads: number;
  ocupacionPrevista: number | null;
  riesgo: NivelRiesgo;
}

/** Sesiones/semana que se espera de UNA suscripción, y de dónde sale el número. */
export function demandaSemanalDeSuscripcion(
  sus: Pick<SuscripcionDemanda, 'sesionesRestantes'>,
  plan: PlanDemanda | undefined,
  asistidas: AsistidaDemanda[],
  config: ConfigOpening,
): { porSemana: number; origen: OrigenDemanda } {
  const observada = frecuenciaDesdeAsistidas(asistidas);
  if (observada !== null) {
    const tope = plan?.limiteSemanal ?? null;
    return { porSemana: tope !== null ? Math.min(observada, tope) : observada, origen: 'OBSERVADA' };
  }
  if (!plan || plan.tipo === 'PUNTUAL') return { porSemana: 0, origen: 'ESTIMADA_POR_PLAN' };

  if (plan.tipo === 'BONO') {
    const sesiones = sus.sesionesRestantes ?? plan.sesiones ?? 0;
    const semanas = plan.validezDias ? plan.validezDias / 7 : config.semanasBonoSinCaducidad;
    const ritmo = semanas > 0 ? sesiones / semanas : 0;
    const tope = plan.limiteSemanal ?? null;
    return { porSemana: tope !== null ? Math.min(ritmo, tope) : ritmo, origen: 'ESTIMADA_POR_PLAN' };
  }

  return { porSemana: plan.limiteSemanal ?? config.sesionesSemanaSinTope, origen: 'ESTIMADA_POR_PLAN' };
}

export function nivelDeRiesgo(ocupacion: number | null, config: ConfigOpening): NivelRiesgo {
  if (ocupacion === null) return 'SIN_OFERTA';
  if (ocupacion >= config.umbralRojo) return 'ROJO';
  if (ocupacion >= config.umbralAmarillo) return 'AMARILLO';
  return 'VERDE';
}

export function analizarCapacidad(e: EntradaCapacidad): AnalisisCapacidad {
  const { config, now } = e;
  const desde = now.getTime();
  const hasta = desde + config.ventanaAnalisisDias * MS_DIA;
  const semanas = config.ventanaAnalisisDias / 7;

  let capacidadPublicada = 0;
  let sesionesEnVentana = 0;
  for (const se of e.sesiones) {
    if (se.cancelada) continue;
    const t = new Date(se.inicio).getTime();
    if (t < desde || t >= hasta) continue;
    capacidadPublicada += se.aforoMaximo;
    sesionesEnVentana++;
  }

  const planPorId = new Map(e.planes.map(p => [p.id, p]));
  const desglose: AnalisisCapacidad['desglose'] = {
    OBSERVADA: { suscripciones: 0, plazas: 0 },
    ESTIMADA_POR_PLAN: { suscripciones: 0, plazas: 0 },
  };
  for (const sus of e.suscripciones) {
    if (sus.estado !== 'ACTIVA') continue;
    if (sus.fechaFin && new Date(sus.fechaFin).getTime() < desde) continue;
    const { porSemana, origen } = demandaSemanalDeSuscripcion(
      sus, planPorId.get(sus.planId), e.asistidasPorSocio.get(sus.socioId) ?? [], config,
    );
    desglose[origen].suscripciones++;
    desglose[origen].plazas += porSemana * semanas;
  }
  const demandaComprometida = Math.round(desglose.OBSERVADA.plazas + desglose.ESTIMADA_POR_PLAN.plazas);
  desglose.OBSERVADA.plazas = Math.round(desglose.OBSERVADA.plazas);
  desglose.ESTIMADA_POR_PLAN.plazas = Math.round(desglose.ESTIMADA_POR_PLAN.plazas);

  const leads = e.leads;
  const demandaPotencial = Math.round(leads * config.conversionLeads * config.sesionesSemanaSinTope * semanas);

  const ocupacionPrevista = capacidadPublicada > 0 ? demandaComprometida / capacidadPublicada : null;

  return {
    ventana: { desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString(), dias: config.ventanaAnalisisDias },
    capacidadPublicada,
    sesionesEnVentana,
    demandaComprometida,
    desglose,
    demandaPotencial,
    leads,
    ocupacionPrevista,
    riesgo: nivelDeRiesgo(ocupacionPrevista, config),
  };
}
