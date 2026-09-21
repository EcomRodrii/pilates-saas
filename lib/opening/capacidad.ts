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
  /** Cuotas sin historial por cómo se estimaron: la pantalla solo nombra los supuestos usados. */
  estimadasPorMotivo: Record<MotivoEstimacion, number>;
  /** Plazas si convierten los leads al ritmo configurado. Nunca se suma sola al riesgo. */
  demandaPotencial: number;
  leads: number;
  ocupacionPrevista: number | null;
  riesgo: NivelRiesgo;
}

/** Por qué una cuota sin historial se estimó como se estimó (lo que la pantalla cuenta). */
export type MotivoEstimacion = 'TOPE_PLAN' | 'SIN_TOPE' | 'BONO' | 'PUNTUAL';

export interface DemandaSuscripcion {
  /** Plazas que ocupará dentro de la ventana. */
  plazas: number;
  origen: OrigenDemanda;
  motivo: MotivoEstimacion | null;
}

/**
 * Plazas que ocupará UNA suscripción en la ventana, y de dónde sale el número.
 * Un bono nunca aporta más de lo que le queda, ni más allá de su caducidad
 * (`fechaFin`, que ya es compra + validez: calcularFechaFinBono).
 */
export function demandaDeSuscripcion(
  sus: Pick<SuscripcionDemanda, 'sesionesRestantes' | 'fechaFin'>,
  plan: PlanDemanda | undefined,
  asistidas: AsistidaDemanda[],
  config: ConfigOpening,
  now: Date,
): DemandaSuscripcion {
  const semanasVentana = config.ventanaAnalisisDias / 7;
  const esBono = plan?.tipo === 'BONO';
  const restantes = esBono ? (sus.sesionesRestantes ?? plan?.sesiones ?? 0) : null;
  const semanasHastaCaducar = esBono
    ? (sus.fechaFin
        ? Math.max(0, (new Date(sus.fechaFin).getTime() - now.getTime()) / (7 * MS_DIA))
        : config.semanasBonoSinCaducidad)
    : null;
  const semanasActiva = semanasHastaCaducar !== null ? Math.min(semanasVentana, semanasHastaCaducar) : semanasVentana;
  const acotar = (porSemana: number) => {
    const tope = plan?.limiteSemanal ?? null;
    const ritmo = tope !== null ? Math.min(porSemana, tope) : porSemana;
    const plazas = ritmo * semanasActiva;
    return restantes !== null ? Math.min(plazas, restantes) : plazas;
  };

  if (!plan || plan.tipo === 'PUNTUAL') return { plazas: 0, origen: 'ESTIMADA_POR_PLAN', motivo: 'PUNTUAL' };

  const observada = frecuenciaDesdeAsistidas(asistidas);
  if (observada !== null) return { plazas: acotar(observada), origen: 'OBSERVADA', motivo: null };

  if (esBono) {
    const ritmo = semanasHastaCaducar && semanasHastaCaducar > 0 ? (restantes ?? 0) / semanasHastaCaducar : 0;
    return { plazas: acotar(ritmo), origen: 'ESTIMADA_POR_PLAN', motivo: 'BONO' };
  }
  if (plan.limiteSemanal !== null && plan.limiteSemanal !== undefined) {
    return { plazas: acotar(plan.limiteSemanal), origen: 'ESTIMADA_POR_PLAN', motivo: 'TOPE_PLAN' };
  }
  return { plazas: acotar(config.sesionesSemanaSinTope), origen: 'ESTIMADA_POR_PLAN', motivo: 'SIN_TOPE' };
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
  const estimadasPorMotivo: Record<MotivoEstimacion, number> = { TOPE_PLAN: 0, SIN_TOPE: 0, BONO: 0, PUNTUAL: 0 };
  // La frecuencia observada es de la SOCIA, no de la cuota: con dos cuotas
  // activas (mensual + bono) se cuenta una vez.
  const sociasObservadas = new Set<string>();
  for (const sus of e.suscripciones) {
    if (sus.estado !== 'ACTIVA') continue;
    if (sus.fechaFin && new Date(sus.fechaFin).getTime() < desde) continue;
    const d = demandaDeSuscripcion(
      sus, planPorId.get(sus.planId), e.asistidasPorSocio.get(sus.socioId) ?? [], config, now,
    );
    if (d.motivo === 'PUNTUAL') { estimadasPorMotivo.PUNTUAL++; continue; }
    if (d.origen === 'OBSERVADA') {
      if (sociasObservadas.has(sus.socioId)) continue;
      sociasObservadas.add(sus.socioId);
    }
    if (d.motivo) estimadasPorMotivo[d.motivo]++;
    desglose[d.origen].suscripciones++;
    desglose[d.origen].plazas += d.plazas;
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
    estimadasPorMotivo,
    demandaPotencial,
    leads,
    ocupacionPrevista,
    riesgo: nivelDeRiesgo(ocupacionPrevista, config),
  };
}
