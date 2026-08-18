'use client';

import { useCallback, useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';

// Tipos del lado del cliente para la respuesta de GET /api/decisiones
// (DECISION-OS-ARQUITECTURA.md §7). No importan lib/decision/tipos.ts
// directamente: ese módulo es núcleo puro server-only, este hook es 'use client'.

export interface ImpactoAPI {
  valor: number;
  unidad: 'EUR_MES' | 'EUR' | 'PCT_OCUPACION';
  formula: string;
}

export interface RecomendacionAPI {
  id: string;
  especialista: string;
  tipo: string;
  titulo: string;
  motivo: string;
  datosUsados: Record<string, string | number | boolean>;
  riesgo: 'PERDIDA' | 'OPORTUNIDAD';
  impacto: ImpactoAPI | null;
  confianza: { nivel: 'ALTA' | 'MEDIA' | 'BAJA'; evidencia: string[]; autonomiaMaxima: number };
  score: number;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  nivelAutonomia: number;
  accion: { tipo: string } & Record<string, unknown>;
  socioId: string | null;
  tiempoEstimadoMin: number;
  estado: string;
  expiraEn: string;
  creadoEn: string;
}

export interface ResumenAPI {
  estadoGeneral: 'EXCELENTE' | 'ATENCION' | 'ACCION_INMEDIATA';
  saludo: string;
  mientrasDormias: { icono: string; texto: string; verificadoPor: string }[];
  nDecisiones: number;
  tiempoEstimadoMin: number;
  impactoTotal: ImpactoAPI | null;
  generadoEn: string;
}

export interface PorEspecialistaAPI {
  especialista: string;
  pendientes: number;
  impactoTotal: ImpactoAPI | null;
  estado: 'EXCELENTE' | 'BUENO' | 'ATENCION' | 'CRITICO';
}

export interface ActividadAPI {
  id: string;
  tipo: string;
  texto: string;
  socioId: string | null;
  enlace: string | null;
  creadoEn: string;
  actorNombre: string | null;
}

// El Umbral (lib/decision/umbral.ts): el veredicto del día — como mucho una
// recomendación, o ninguna (silencio). 'SIN_ANALIZAR' es el único estado que
// no viene de decision_mensajes_dia: significa que el cron de hoy aún no ha
// corrido para este estudio.
export interface VeredictoAPI {
  tipo: 'MENSAJE' | 'SILENCIO' | 'SIN_ANALIZAR';
  recomendacion: RecomendacionAPI | null;
  fraseConfianza: string | null;
  semanaTranquila: boolean;
}

export interface SeguimientoAPI {
  outcome: 'POSITIVO' | 'NEGATIVO' | 'NEUTRO';
  tipo: string;
  titulo: string;
  socioId: string | null;
  medidoEn: string | null;
}

export interface DecisionesResponse {
  resumen: ResumenAPI | null;
  veredicto: VeredictoAPI;
  seguimiento: SeguimientoAPI[];
  prioridades: RecomendacionAPI[];
  masSituaciones: RecomendacionAPI[];
  porEspecialista: PorEspecialistaAPI[];
  actividad: ActividadAPI[];
  /** Cuántas recomendaciones resolvió solo el piloto automático hoy — cabecera
   * del Centro de Control. Opcional: los e2e que mockean esta respuesta sin
   * este campo (previos a la reorganización) no deben romperse. */
  nAutonomasHoy?: number;
}

function quitarRecomendacion(prev: DecisionesResponse, id: string): DecisionesResponse {
  const rec = prev.prioridades.find(r => r.id === id) ?? prev.masSituaciones.find(r => r.id === id) ?? prev.veredicto.recomendacion;
  return {
    ...prev,
    prioridades: prev.prioridades.filter(r => r.id !== id),
    masSituaciones: prev.masSituaciones.filter(r => r.id !== id),
    veredicto: prev.veredicto.recomendacion?.id === id ? { ...prev.veredicto, recomendacion: null } : prev.veredicto,
    porEspecialista: rec
      ? prev.porEspecialista.map(pe => pe.especialista === rec.especialista ? { ...pe, pendientes: Math.max(0, pe.pendientes - 1) } : pe)
      : prev.porEspecialista,
  };
}

export function useDecisiones() {
  const [data, setData] = useState<DecisionesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/decisiones', { headers: { ...(await authHeader()) } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(await res.json());
      setError(null);
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Dispara la carga asíncrona de recomendaciones. El estado viene de la red.
  useEffect(() => { cargar(); }, [cargar]);

  // Optimista: quita la tarjeta al instante; si el servidor rechaza la
  // transición (ya resuelta por otra vía — doble-clic-seguro, Arquitectura §7)
  // se recarga de verdad para reflejar el estado real.
  const aprobar = useCallback(async (id: string): Promise<boolean> => {
    setData(prev => prev ? quitarRecomendacion(prev, id) : prev);
    try {
      const res = await fetch(`/api/decisiones/${id}/aprobar`, { method: 'POST', headers: { ...(await authHeader()) } });
      if (!res.ok) { await cargar(); return false; }
      return true;
    } catch {
      // Fallo de red (no un rechazo del servidor): la tarjeta ya se quitó
      // optimistamente sin que la aprobación llegara a confirmarse — recargar
      // para que vuelva a aparecer, igual que en el caso !res.ok de arriba.
      await cargar();
      return false;
    }
  }, [cargar]);

  const rechazar = useCallback(async (id: string, motivo?: string): Promise<boolean> => {
    setData(prev => prev ? quitarRecomendacion(prev, id) : prev);
    try {
      const res = await fetch(`/api/decisiones/${id}/rechazar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) { await cargar(); return false; }
      return true;
    } catch {
      await cargar();
      return false;
    }
  }, [cargar]);

  // "Recuérdamelo": nunca Aprobar/Rechazar — la recomendación se aplaza, no se
  // resuelve. Optimista igual que aprobar/rechazar.
  const posponer = useCallback(async (id: string): Promise<boolean> => {
    setData(prev => prev ? quitarRecomendacion(prev, id) : prev);
    try {
      const res = await fetch(`/api/decisiones/${id}/posponer`, { method: 'POST', headers: { ...(await authHeader()) } });
      if (!res.ok) { await cargar(); return false; }
      return true;
    } catch {
      await cargar();
      return false;
    }
  }, [cargar]);

  // A diferencia de aprobar/rechazar/posponer (optimistas, con una tarjeta que
  // revertir), aquí no hay nada que revertir — solo hace falta no dejar
  // colgado el botón si el fetch lanza (offline) y decir POR QUÉ si el
  // servidor rechaza (p.ej. 429 "ya hay un análisis reciente en curso").
  const analizarAhora = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/decisiones/analizar', { method: 'POST', headers: { ...(await authHeader()) } });
      if (res.ok) return { ok: true };
      const d = await res.json().catch(() => null);
      return { ok: false, error: d?.error ?? 'No se pudo lanzar el análisis' };
    } catch {
      return { ok: false, error: 'Error de conexión' };
    }
  }, []);

  return { data, loading, error, recargar: cargar, aprobar, rechazar, posponer, analizarAhora };
}
