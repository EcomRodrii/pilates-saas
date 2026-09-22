import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigOpening } from './capacidad.ts';
import type { EntradaEconomia, InstructoraEconomia, PlanEconomia } from './economia.ts';

// Lecturas del simulador con cliente service-role: todo acotado a `studioId`.
// Lee de donde ya vive cada dato (planes, IVA, tarifas, horario publicado);
// de opening_economia solo las dos cifras que da la propietaria.

const DIA = 86_400_000;

export interface CifrasPropietaria { fijosMes: number | null; colchon: number | null }

export async function cargarCifrasPropietaria(admin: SupabaseClient, studioId: string): Promise<CifrasPropietaria> {
  const { data, error } = await admin.from('opening_economia').select('fijos_mes_eur, colchon_eur').eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { fijosMes: num(data?.fijos_mes_eur), colchon: num(data?.colchon_eur) };
}

export async function cargarEntradaEconomia(
  admin: SupabaseClient, studioId: string, config: ConfigOpening, now: Date,
): Promise<EntradaEconomia> {
  const hasta = new Date(now.getTime() + config.ventanaAnalisisDias * DIA).toISOString();
  const [planesR, studioR, susR, sesR, tarR, cifras] = await Promise.all([
    admin.from('planes_tarifa').select('id, nombre, tipo, precio, periodicidad_meses, limite_semanal, activo').eq('studio_id', studioId),
    admin.from('studios').select('iva_por_defecto').eq('id', studioId).maybeSingle(),
    admin.from('suscripciones').select('plan_id').eq('studio_id', studioId).eq('estado', 'ACTIVA').limit(5000),
    admin.from('sesiones').select('inicio, fin, aforo_maximo, cancelada, instructor_id')
      .eq('studio_id', studioId).gte('inicio', now.toISOString()).lt('inicio', hasta).limit(5000),
    admin.from('instructor_tarifas')
      .select('instructor_id, tarifa_hora, base_mensual_eur, relacion_laboral, horas_semanales_contrato').eq('studio_id', studioId),
    cargarCifrasPropietaria(admin, studioId),
  ]);
  const error = planesR.error ?? studioR.error ?? susR.error ?? sesR.error ?? tarR.error;
  if (error) throw error;

  const semanas = config.ventanaAnalisisDias / 7;
  const vivas = (sesR.data ?? []).filter(s => !s.cancelada);
  const horasPorInstructora = new Map<string, number>();
  for (const s of vivas) {
    if (!s.instructor_id) continue;
    const horas = Math.max(0, new Date(s.fin as string).getTime() - new Date(s.inicio as string).getTime()) / 3_600_000;
    horasPorInstructora.set(s.instructor_id as string, (horasPorInstructora.get(s.instructor_id as string) ?? 0) + horas);
  }
  const tarifas = new Map((tarR.data ?? []).map(t => [t.instructor_id as string, t]));
  // Cuentan quien da clases en el horario publicado Y quien tiene contrato con
  // horas (su coste corre aunque aún no tenga clases puestas).
  const ids = new Set([...horasPorInstructora.keys(),
    ...(tarR.data ?? []).filter(t => t.relacion_laboral === 'CONTRATADA' && t.horas_semanales_contrato != null).map(t => t.instructor_id as string)]);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const instructoras: InstructoraEconomia[] = [...ids].map(id => {
    const t = tarifas.get(id);
    return {
      id,
      tarifaHora: num(t?.tarifa_hora),
      baseMensual: num(t?.base_mensual_eur),
      relacion: (t?.relacion_laboral as InstructoraEconomia['relacion']) ?? null,
      horasSemanalesContrato: num(t?.horas_semanales_contrato),
      horasSemanaHorario: (horasPorInstructora.get(id) ?? 0) / semanas,
    };
  });

  return {
    planes: (planesR.data ?? []).map(p => ({
      id: p.id as string, nombre: p.nombre as string, tipo: p.tipo as PlanEconomia['tipo'],
      precio: Number(p.precio), periodicidadMeses: num(p.periodicidad_meses),
      limiteSemanal: num(p.limite_semanal), activo: Boolean(p.activo),
    })),
    ivaPct: Number(studioR.data?.iva_por_defecto ?? 21),
    cuotasActivas: (susR.data ?? []).map(s => s.plan_id as string),
    plazasSemana: vivas.reduce((s, x) => s + Number(x.aforo_maximo ?? 0), 0) / semanas,
    instructoras,
    sesionesSemanaSinTope: config.sesionesSemanaSinTope,
    fijosMes: cifras.fijosMes,
    colchon: cifras.colchon,
  };
}
