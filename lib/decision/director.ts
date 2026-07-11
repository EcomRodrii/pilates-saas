// Director del Estudio (DECISION-OS-NUCLEO.md §4, §8). No detecta: coordina
// colisiones entre especialistas, calcula el estado general, arma el resumen
// ejecutivo, redacta "Mientras Dormías" con hechos verificables, y genera el
// saludo desde plantillas deterministas (Especialistas §7.1 — la IA solo
// puede re-redactar el tono, nunca inventar el contenido).
import type { Candidata, EstadoEspecialista, Impacto, ItemMientrasDormias, Prioridad, Recomendacion, Riesgo, ResumenDiario } from './tipos.ts';
import type { AutomationLog, Reserva } from '@/lib/types';
import { calcularScore, type CandidataPriorizada } from './prioridad.ts';

const MS_DIA = 86400000;
const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Coordinación por colisión de socia (Núcleo §4): si ≥2 candidatas comparten
 * socioId, gana la de mayor score preliminar (misma fórmula que el Priority
 * Engine, sin ajuste de feedback aún); el resto queda como contexto adicional
 * en la candidata ganadora, nunca se pierde información.
 */
export function coordinarColisiones(candidatas: Candidata[]): Candidata[] {
  const porSocio = new Map<string, Candidata[]>();
  const sinSocio: Candidata[] = [];
  for (const c of candidatas) {
    if (!c.socioId) { sinSocio.push(c); continue; }
    const grupo = porSocio.get(c.socioId) ?? [];
    grupo.push(c);
    porSocio.set(c.socioId, grupo);
  }

  const resultado: Candidata[] = [...sinSocio];
  for (const grupo of porSocio.values()) {
    if (grupo.length === 1) { resultado.push(grupo[0]); continue; }
    const [ganadora, ...resto] = [...grupo].sort((a, b) => calcularScore(b, 1) - calcularScore(a, 1));
    const contexto = resto.map(c => `${c.especialista}: ${c.tituloMotor}`).join(' · ');
    resultado.push({ ...ganadora, datosUsados: { ...ganadora.datosUsados, contextoAdicional: contexto } });
  }
  return resultado;
}

export type EstadoGeneral = 'EXCELENTE' | 'ATENCION' | 'ACCION_INMEDIATA';

/**
 * Estado general (Núcleo §8.1). Se calcula sobre TODAS las candidatas
 * puntuadas, no solo las 3 que caben en el bloque Prioridades — un cap por
 * especialista podría dejar una CRITICA real fuera de esa selección visual,
 * pero el estado del negocio debe reflejarla igualmente.
 */
export function calcularEstadoGeneral(puntuadas: CandidataPriorizada[]): EstadoGeneral {
  if (puntuadas.some(c => c.prioridad === 'CRITICA')) return 'ACCION_INMEDIATA';
  if (puntuadas.some(c => c.prioridad === 'ALTA' && c.riesgo === 'PERDIDA')) return 'ATENCION';
  return 'EXCELENTE';
}

export interface ResumenEjecutivo {
  nDecisiones: number;
  tiempoEstimadoMin: number;
  impactoTotal: Impacto | null;
}

/** Resumen ejecutivo (Núcleo §8.2): los números siempre cuadran con las tarjetas visibles. */
export function calcularResumenEjecutivo(prioridadesHome: CandidataPriorizada[]): ResumenEjecutivo {
  const nDecisiones = prioridadesHome.length;
  const tiempoEstimadoMin = prioridadesHome.reduce((acc, c) => acc + c.tiempoEstimadoMin, 0);
  const conImpacto = prioridadesHome.filter(c => c.impacto);

  if (conImpacto.length === 0) return { nDecisiones, tiempoEstimadoMin, impactoTotal: null };

  const eurMesDe = (imp: Impacto) => (imp.unidad === 'EUR' ? imp.valor / 3 : imp.valor);
  const valorTotal = redondear2(conImpacto.reduce((acc, c) => acc + eurMesDe(c.impacto!), 0));
  const desglose = conImpacto.map(c => Math.round(eurMesDe(c.impacto!))).join(' + ');

  return { nDecisiones, tiempoEstimadoMin, impactoTotal: { valor: valorTotal, unidad: 'EUR_MES', formula: desglose } };
}

export interface EntradaMientrasDormias {
  recomendacionesEjecutadas: Recomendacion[]; // ya filtradas a la ventana por el caller
  automationLogs: AutomationLog[];            // ya filtrados a la ventana
  reservasNuevas: Reserva[];                  // reservas creadas en la ventana
}

/**
 * "Mientras Dormías" (Núcleo §8.3): solo hechos verificados, cada uno con su
 * fuente. Nunca se atribuye una reserva a un contacto sin vínculo temporal
 * comprobado (regla anti-exageración, Bible doc 4) — si no hay vínculo,
 * se cuenta la reserva pero no se afirma que "volvió por el mensaje".
 */
export function construirMientrasDormias(entrada: EntradaMientrasDormias): ItemMientrasDormias[] {
  const items: ItemMientrasDormias[] = [];

  const pagosRecuperados = entrada.recomendacionesEjecutadas.filter(r => r.tipo === 'RECUPERAR_PAGOS');
  if (pagosRecuperados.length > 0) {
    const total = redondear2(pagosRecuperados.reduce((acc, r) => acc + (typeof r.datosUsados.total === 'number' ? r.datosUsados.total : 0), 0));
    const n = pagosRecuperados.reduce((acc, r) => acc + (typeof r.datosUsados.n === 'number' ? r.datosUsados.n : 1), 0);
    items.push({
      icono: '✓',
      texto: `Reintenté ${n} pagos que se habían quedado a medias — cosas de tarjetas. Cobrados: ${total}€.`,
      verificadoPor: `recomendaciones EJECUTADA tipo RECUPERAR_PAGOS (${pagosRecuperados.length})`,
    });
  }

  const emailsEjecutados = entrada.automationLogs.filter(l => l.resultado === 'EJECUTADO' && l.accion === 'ENVIAR_EMAIL');
  if (emailsEjecutados.length > 0) {
    const socioIdsContactados = new Set(emailsEjecutados.map(l => l.socioId).filter((id): id is string => !!id));
    let vueltas = 0;
    for (const log of emailsEjecutados) {
      if (!log.socioId) continue;
      const logTs = new Date(log.ejecutadoEn).getTime();
      const huboReservaPosterior = entrada.reservasNuevas.some(r => {
        if (r.socioId !== log.socioId) return false;
        const rTs = new Date(r.creadoEn).getTime();
        return rTs >= logTs && rTs <= logTs + 7 * MS_DIA;
      });
      if (huboReservaPosterior) vueltas++;
    }
    let texto = `Escribí a ${socioIdsContactados.size} alumnas que llevaban unos días dudando.`;
    if (vueltas > 0) texto += ` ${vueltas} han vuelto a reservar.`;
    items.push({ icono: '✓', texto, verificadoPor: `automation_logs EJECUTADO email (${emailsEjecutados.length})` });
  }

  return items;
}

function saludoBaseDe(momentoDia: 'MANANA' | 'TARDE' | 'NOCHE'): string {
  if (momentoDia === 'MANANA') return 'Buenos días';
  if (momentoDia === 'TARDE') return 'Buenas tardes';
  return 'Buenas noches';
}

/** Saludo determinista (Especialistas §7.1) — fallback siempre válido sin IA. */
export function generarSaludo(
  nombrePropietario: string,
  momentoDia: 'MANANA' | 'TARDE' | 'NOCHE',
  estadoGeneral: EstadoGeneral,
  nDecisiones: number,
  tiempoEstimadoMin: number
): string {
  const base = saludoBaseDe(momentoDia);
  if (estadoGeneral === 'ACCION_INMEDIATA') {
    return `${base}, ${nombrePropietario}. Hay algo que no puede esperar: empieza por la primera tarjeta.`;
  }
  if (estadoGeneral === 'ATENCION') {
    return `${base}, ${nombrePropietario}. Hay ${nDecisiones} cosas que me gustaría que vieras hoy — te llevará unos ${tiempoEstimadoMin} minutos.`;
  }
  if (nDecisiones === 0) {
    return `${base}, ${nombrePropietario}. Todo está en orden — hoy no necesito nada de ti.`;
  }
  return `${base}, ${nombrePropietario}. Hoy está todo bastante tranquilo. Solo hay ${nDecisiones} cosas en las que quiero tu opinión.`;
}

/** Ensambla el ResumenDiario completo — lo único que persiste `resumen_diario`. */
export function construirResumenDiario(params: {
  studioId: string;
  fecha: string;
  nombrePropietario: string;
  puntuadas: CandidataPriorizada[];
  prioridadesHome: CandidataPriorizada[];
  mientrasDormias: ItemMientrasDormias[];
  momentoDia: 'MANANA' | 'TARDE' | 'NOCHE';
  now: Date;
}): ResumenDiario {
  const estadoGeneral = calcularEstadoGeneral(params.puntuadas);
  const resumen = calcularResumenEjecutivo(params.prioridadesHome);
  const saludo = generarSaludo(params.nombrePropietario, params.momentoDia, estadoGeneral, resumen.nDecisiones, resumen.tiempoEstimadoMin);
  return {
    studioId: params.studioId,
    fecha: params.fecha,
    estadoGeneral,
    saludo,
    mientrasDormias: params.mientrasDormias,
    nDecisiones: resumen.nDecisiones,
    tiempoEstimadoMin: resumen.tiempoEstimadoMin,
    impactoTotal: resumen.impactoTotal,
    generadoEn: params.now.toISOString(),
  };
}

/**
 * Estado por especialista para su tarjeta en "Mi Equipo" (Bible doc 4). Tipo
 * de entrada mínimo estructural (no exige CandidataPriorizada completa) —
 * también acepta Recomendacion[] tal cual llega de la API (Arquitectura §7).
 */
export function calcularEstadoEspecialista(candidatasDelEspecialista: Array<{ prioridad: Prioridad; riesgo: Riesgo }>): EstadoEspecialista {
  if (candidatasDelEspecialista.some(c => c.prioridad === 'CRITICA')) return 'CRITICO';
  if (candidatasDelEspecialista.some(c => c.prioridad === 'ALTA' && c.riesgo === 'PERDIDA')) return 'ATENCION';
  if (candidatasDelEspecialista.length > 0) return 'BUENO';
  return 'EXCELENTE';
}
