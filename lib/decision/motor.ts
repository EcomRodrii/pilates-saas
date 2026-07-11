// Decision Engine — orquestador puro (DECISION-OS-NUCLEO.md §0):
// señales (dentro de cada especialista) → especialistas → memoria →
// coordinación → confianza (ya resuelta al emitir, ver nota en tipos.ts) →
// cooldowns+prioridad → director. Sin I/O: entra un snapshot, sale un
// resultado completo listo para persistir (Fase B).
import type { Candidata, MemoriaEstudio, Recomendacion, SnapshotEstudio } from './tipos.ts';
import { ESPECIALISTAS } from './especialistas/contrato.ts';
import { aplicarMemoria, detectarHechosPorRegla, detectarHechosPorFeedback, type NuevoHechoMemoria } from './memoria.ts';
import { coordinarColisiones, construirResumenDiario, construirMientrasDormias } from './director.ts';
import { priorizar, seleccionarPrioridadesHome, type CandidataPriorizada } from './prioridad.ts';
import { construirIndices } from './senales.ts';

export interface RecomendacionAExpirar {
  id: string;
  motivo: 'VENCIDA' | 'RESUELTA_SOLA';
}

/**
 * PENDIENTE vencida (expira_en pasado) o resuelta sola (el motor ya no la
 * detecta en esta pasada — el hecho desapareció antes de que alguien
 * decidiera) → candidata a EXPIRADA (Núcleo §6.1). La persistencia real la
 * hace Fase B; aquí solo se calcula la lista.
 */
export function calcularExpiraciones(pendientesActuales: Recomendacion[], candidatasVivas: Candidata[], now: Date): RecomendacionAExpirar[] {
  const dedupeKeysVivas = new Set(candidatasVivas.map(c => c.dedupeKey));
  const resultado: RecomendacionAExpirar[] = [];
  for (const p of pendientesActuales) {
    if (new Date(p.expiraEn) <= now) { resultado.push({ id: p.id, motivo: 'VENCIDA' }); continue; }
    if (!dedupeKeysVivas.has(p.dedupeKey)) resultado.push({ id: p.id, motivo: 'RESUELTA_SOLA' });
  }
  return resultado;
}

// Simplificación MVP: hora UTC. La zona horaria real del estudio (config de
// studios) se resuelve en Fase B, igual que hace verifactu.ts con Madrid.
function momentoDiaDe(now: Date): 'MANANA' | 'TARDE' | 'NOCHE' {
  const hora = now.getUTCHours();
  if (hora < 13) return 'MANANA';
  if (hora < 20) return 'TARDE';
  return 'NOCHE';
}

export interface EntradaAnalisis {
  snapshot: SnapshotEstudio;
  memoria: MemoriaEstudio;
  pendientesActuales: Recomendacion[];
  resueltas90d: Recomendacion[];
  nombrePropietario: string;
  ventanaMientrasDormiasDesde: Date; // p.ej. 21:00 del día anterior
  now: Date;
}

export interface ResultadoAnalisis {
  candidatasFinales: CandidataPriorizada[];
  prioridadesHome: CandidataPriorizada[];
  resumenDiario: ReturnType<typeof construirResumenDiario>;
  expiraciones: RecomendacionAExpirar[];
  nuevosHechosMemoria: NuevoHechoMemoria[];
  estadisticas: {
    nCandidatasGeneradas: number;
    nCandidatasDescartadas: number;
    nRecomendacionesPersistidas: number;
  };
}

export function ejecutarAnalisis(input: EntradaAnalisis): ResultadoAnalisis {
  const { snapshot, memoria, pendientesActuales, resueltas90d, nombrePropietario, ventanaMientrasDormiasDesde, now } = input;

  // 2 · ESPECIALISTAS — cada uno construye sus propios índices de señales.
  const candidatasBrutas = ESPECIALISTAS.flatMap(e => e.detectar(snapshot, memoria, now));
  const nCandidatasGeneradas = candidatasBrutas.length;

  // 3 · MEMORY ENGINE — veto y ajuste de canal.
  const postMemoria = aplicarMemoria(candidatasBrutas, memoria, now);

  // 4 · COORDINACIÓN — una socia, una candidata visible.
  const coordinadas = coordinarColisiones(postMemoria);

  // 5 · CONFIDENCE ENGINE — ya resuelta al emitir cada candidata (ver nota en
  // tipos.ts: Especialista.detectar). Este paso queda como posición
  // conceptual del pipeline, sin transformación adicional.

  // 6-7 · COOLDOWNS + PRIORITY.
  const puntuadas = priorizar(coordinadas, resueltas90d, now);
  const prioridadesHome = seleccionarPrioridadesHome(puntuadas);

  // 8 · DIRECTOR.
  const recomendacionesEjecutadas = resueltas90d.filter(r =>
    r.estado === 'EJECUTADA' && r.resueltoEn &&
    new Date(r.resueltoEn) >= ventanaMientrasDormiasDesde && new Date(r.resueltoEn) <= now
  );
  const automationLogsVentana = snapshot.automationLogs.filter(l =>
    new Date(l.ejecutadoEn) >= ventanaMientrasDormiasDesde && new Date(l.ejecutadoEn) <= now
  );
  const reservasVentana = snapshot.reservas.filter(r =>
    new Date(r.creadoEn) >= ventanaMientrasDormiasDesde && new Date(r.creadoEn) <= now
  );
  const mientrasDormias = construirMientrasDormias({
    recomendacionesEjecutadas, automationLogs: automationLogsVentana, reservasNuevas: reservasVentana,
  });

  const resumenDiario = construirResumenDiario({
    studioId: snapshot.studioId,
    fecha: now.toISOString().slice(0, 10),
    nombrePropietario,
    puntuadas,
    prioridadesHome,
    mientrasDormias,
    momentoDia: momentoDiaDe(now),
    now,
  });

  // Ciclo de vida: expiraciones + escritura automática de memoria.
  const expiraciones = calcularExpiraciones(pendientesActuales, coordinadas, now);
  const idx = construirIndices(snapshot);
  const nuevosHechosMemoria = [
    ...detectarHechosPorRegla(idx, snapshot, now),
    ...detectarHechosPorFeedback(resueltas90d, now),
  ];

  return {
    candidatasFinales: puntuadas,
    prioridadesHome,
    resumenDiario,
    expiraciones,
    nuevosHechosMemoria,
    estadisticas: {
      nCandidatasGeneradas,
      nCandidatasDescartadas: nCandidatasGeneradas - puntuadas.length,
      nRecomendacionesPersistidas: puntuadas.length,
    },
  };
}
