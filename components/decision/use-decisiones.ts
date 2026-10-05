'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { efectoDe, recibosDeLaAccion, type EfectoAprobar } from '@/lib/decision/efecto-aprobar';
import type { ResultadoEjecucion } from '@/lib/decision/resultado-ejecucion';

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
  /** Qué hace el botón principal (lib/decision/efecto-aprobar.ts), según el
   * servidor. Opcional: una respuesta sin él se resuelve con `efectoDe`. */
  efecto?: EfectoAprobar;
  /** Lo que pasó al ejecutarla (lib/decision/resultado-ejecucion.ts). Solo en
   * una ya ejecutada: la del veredicto tras recargar, o la que la pantalla
   * acaba de preguntar (`/estado`) tras «Cobrar ahora». */
  resultado?: ResultadoEjecucion | null;
}

export interface ResumenAPI {
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
  /** Callado porque la apertura del estudio ya avisó hoy (lib/opening/umbral-apertura.ts). */
  porApertura?: boolean;
  /** La aplazó hoy con «Recuérdamelo» y sigue PENDIENTE (`pospuesta_en`,
   * lib/decision/mensaje-del-dia.ts): el veredicto lo dice y no vuelve a pedírsela. */
  pospuesta?: boolean;
  /** Solo del cliente: acaba de responder al mensaje en esta pantalla y el
   * servidor dijo que sí (la tarjeta se ha ido). Al recargar, el servidor manda
   * la recomendación con lo que pasó de verdad. */
  respondido?: boolean;
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
  /** Las que el piloto intentó hoy y no salieron (FALLIDA): se dicen aparte. */
  nAutonomasFallidasHoy?: number;
}

function buscarRecomendacion(prev: DecisionesResponse, id: string): RecomendacionAPI | null {
  return prev.prioridades.find(r => r.id === id)
    ?? prev.masSituaciones.find(r => r.id === id)
    ?? (prev.veredicto.recomendacion?.id === id ? prev.veredicto.recomendacion : null);
}

/** Su especialista tiene una pendiente menos (el número de «Mi Equipo»). */
function descontarDeSuEspecialista(prev: DecisionesResponse, rec: RecomendacionAPI | null): PorEspecialistaAPI[] {
  return rec
    ? prev.porEspecialista.map(pe => pe.especialista === rec.especialista ? { ...pe, pendientes: Math.max(0, pe.pendientes - 1) } : pe)
    : prev.porEspecialista;
}

function quitarRecomendacion(prev: DecisionesResponse, id: string): DecisionesResponse {
  return {
    ...prev,
    prioridades: prev.prioridades.filter(r => r.id !== id),
    masSituaciones: prev.masSituaciones.filter(r => r.id !== id),
    veredicto: prev.veredicto.recomendacion?.id === id ? { ...prev.veredicto, recomendacion: null, respondido: true } : prev.veredicto,
    porEspecialista: descontarDeSuEspecialista(prev, buscarRecomendacion(prev, id)),
  };
}

/**
 * «Recuérdamelo» con el sí del servidor: sigue PENDIENTE, así que no se quita de
 * ningún sitio. El veredicto pasa a decir que la ha dejado para más adelante, y
 * la recomendación sigue en el detalle con sus botones (la página deja de
 * filtrarla de las filas). Antes se quitaba de la pantalla, y al recargar volvía
 * arriba con sus botones como si nadie la hubiera tocado.
 */
function marcarPospuesta(prev: DecisionesResponse, id: string): DecisionesResponse {
  return prev.veredicto.recomendacion?.id === id
    ? { ...prev, veredicto: { ...prev.veredicto, pospuesta: true } }
    : quitarRecomendacion(prev, id);
}

/** La deja donde está, pero ya APROBADA: lo que el servidor acaba de confirmar. */
function marcarAprobada(prev: DecisionesResponse, id: string): DecisionesResponse {
  const aprobada = (r: RecomendacionAPI) => (r.id === id ? { ...r, estado: 'APROBADA' } : r);
  return {
    ...prev,
    prioridades: prev.prioridades.map(aprobada),
    masSituaciones: prev.masSituaciones.map(aprobada),
    veredicto: prev.veredicto.recomendacion?.id === id
      ? { ...prev.veredicto, recomendacion: aprobada(prev.veredicto.recomendacion) }
      : prev.veredicto,
    porEspecialista: descontarDeSuEspecialista(prev, buscarRecomendacion(prev, id)),
  };
}

/** Le pone el estado (y lo que pasó) que acaba de dar el servidor, allí donde esté. */
function conEstado(prev: DecisionesResponse, id: string, nuevo: EstadoRecomendacionAPI): DecisionesResponse {
  const cambiar = (r: RecomendacionAPI) => (r.id === id ? { ...r, estado: nuevo.estado, resultado: nuevo.resultado } : r);
  return {
    ...prev,
    prioridades: prev.prioridades.map(cambiar),
    masSituaciones: prev.masSituaciones.map(cambiar),
    veredicto: prev.veredicto.recomendacion?.id === id
      ? { ...prev.veredicto, recomendacion: cambiar(prev.veredicto.recomendacion) }
      : prev.veredicto,
  };
}

// Tras «Cobrar ahora» el 200 solo dice que el cobro está encolado: lo hace el
// ejecutor después, y puede fallar. La pantalla pregunta cómo ha ido cada 5 s,
// con un tope de 90 s (un ejecutor que reintenta un paso tarda más que eso, y
// preguntar sin fin no aporta nada), y entonces dice lo que pasó; si se agota
// sin respuesta, dice que está tardando, no que fue bien.
export const SONDEO_COBRO_MS = 5_000;
export const TOPE_SONDEO_COBRO_MS = 90_000;

interface EstadoRecomendacionAPI { estado: string; resultado: ResultadoEjecucion | null }

/** Los cobros aprobados que aún no han cerrado: de ellos se pregunta cómo terminan. */
function cobrosEnMarcha(d: DecisionesResponse): string[] {
  const todas = [...d.prioridades, ...d.masSituaciones, ...(d.veredicto.recomendacion ? [d.veredicto.recomendacion] : [])];
  return [...new Set(todas.filter(r => r.estado === 'APROBADA' && efectoDe(r) === 'COBRAR').map(r => r.id))];
}

/** GET /api/decisiones/[id]/estado. `null` si no hay una respuesta con forma (red, 4xx/5xx, un `{}`). */
async function leerEstado(id: string): Promise<EstadoRecomendacionAPI | null> {
  try {
    const res = await fetch(`/api/decisiones/${encodeURIComponent(id)}/estado`, { headers: { ...(await authHeader()) } });
    if (!res.ok) return null;
    const cuerpo = await res.json().catch(() => null);
    if (!cuerpo || typeof cuerpo.estado !== 'string') return null;
    return { estado: cuerpo.estado, resultado: cuerpo.resultado && typeof cuerpo.resultado === 'object' ? cuerpo.resultado : null };
  } catch {
    return null;
  }
}

export type AccionRecomendacion = 'aprobar' | 'rechazar' | 'posponer' | 'gestionada';
export type ResultadoAccion = { ok: true } | { ok: false; error: string };

/** El POST de una acción, con el error DE VERDAD: el que da el servidor, o el de la red. */
async function enviarAccion(id: string, accion: AccionRecomendacion, cuerpo?: Record<string, unknown>): Promise<ResultadoAccion> {
  try {
    const res = await fetch(`/api/decisiones/${encodeURIComponent(id)}/${accion}`, {
      method: 'POST',
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(await authHeader()) },
      ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    });
    if (res.ok) return { ok: true };
    const respuesta = await res.json().catch(() => null);
    return {
      ok: false,
      error: typeof respuesta?.error === 'string' && respuesta.error
        ? respuesta.error
        : `No se ha podido completar (error ${res.status}). Vuelve a intentarlo.`,
    };
  } catch {
    return { ok: false, error: 'No se ha podido conectar con el servidor. Comprueba tu conexión y vuelve a intentarlo.' };
  }
}

/**
 * `seguirCobros`: pregunta cómo terminan los cobros aprobados (solo el Centro de
 * Control, que es donde se pinta su resultado; el Action Center de Inicio no).
 */
export function useDecisiones({ seguirCobros = false }: { seguirCobros?: boolean } = {}) {
  const [data, setData] = useState<DecisionesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Los cobros a los que se les agotó el tope de preguntar sin cerrar.
  const [cobrosTardando, setCobrosTardando] = useState<ReadonlySet<string>>(() => new Set());
  // Desde cuándo se pregunta por cada uno: el tope no vuelve a empezar cuando el
  // efecto se repite (otra acción cambia `data`, o el doble montaje del modo
  // estricto).
  const seguidosDesde = useRef(new Map<string, number>());

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/decisiones', { headers: { ...(await authHeader()) } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Error HTTP ${res.status}`);
        setData(null);
        return;
      }
      // ⚠️ Un 200 no garantiza la FORMA. `data` se lee en seis sitios de la
      // pantalla como `data.prioridades.length` y `[...data.prioridades]`, y
      // un `{}` es un objeto verdadero: pasa el `data ?` y revienta en el
      // `.length`, tirando el Centro de Control ENTERO al límite de error —
      // «Algo ha ido mal» donde debería haber una pantalla degradada.
      //
      // Es el mismo fallo que ya se cerró en /dashboard, y aquí es peor: esta
      // es la pantalla desde la que se decide el día.
      const cuerpo = await res.json().catch(() => null);
      if (!cuerpo || !Array.isArray(cuerpo.prioridades) || !Array.isArray(cuerpo.masSituaciones)) {
        setError('La respuesta del servidor llegó incompleta. Vuelve a intentarlo.');
        setData(null);
        return;
      }
      setData(cuerpo);
      setError(null);
    } catch {
      setError('No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- Dispara la carga asíncrona de recomendaciones. El estado viene de la red.
  useEffect(() => { cargar(); }, [cargar]);

  // Los cobros aprobados que siguen sin cerrar —el que se acaba de aprobar, o el
  // del veredicto si se recarga mientras se cobra—: cada 5 s, hasta que cierren
  // o se agote el tope. Todo cambio de estado llega después de esperar (nunca
  // dentro del propio efecto), y al desmontar se para.
  useEffect(() => {
    if (!seguirCobros || !data) return;
    const ids = cobrosEnMarcha(data).filter(id => !cobrosTardando.has(id));
    if (ids.length === 0) return;
    let vivo = true;
    const temporizadores = new Set<ReturnType<typeof setTimeout>>();
    const esperar = (ms: number) => new Promise<void>((resolver) => {
      const t = setTimeout(() => { temporizadores.delete(t); resolver(); }, ms);
      temporizadores.add(t);
    });
    for (const id of ids) {
      const desde = seguidosDesde.current.get(id) ?? Date.now();
      seguidosDesde.current.set(id, desde);
      void (async () => {
        for (;;) {
          await esperar(Math.max(0, Math.min(SONDEO_COBRO_MS, desde + TOPE_SONDEO_COBRO_MS - Date.now())));
          if (!vivo) return;
          const nuevo = await leerEstado(id);
          if (!vivo) return;
          if (nuevo && nuevo.estado !== 'APROBADA') {
            setData(prev => (prev ? conEstado(prev, id, nuevo) : prev));
            return;
          }
          if (Date.now() >= desde + TOPE_SONDEO_COBRO_MS) {
            setCobrosTardando(prev => new Set(prev).add(id));
            return;
          }
        }
      })();
    }
    return () => {
      vivo = false;
      temporizadores.forEach(clearTimeout);
    };
  }, [data, seguirCobros, cobrosTardando]);

  // Ninguna acción quita la tarjeta antes de que el servidor diga que sí. Antes
  // eran optimistas: la tarjeta desaparecía al pulsar y, si el servidor decía
  // que no, volvía al recargar con un «Comprueba tu conexión» que no era el
  // motivo. Con un cobro es peor que feo: «Cobrar ahora» se iba de la pantalla
  // como si ya estuviera cobrado. Ahora la tarjeta sigue, con los botones
  // apagados (`procesando`, en la página), hasta la respuesta; con un no se
  // queda como estaba y quien llama enseña el error que dio el servidor.
  //
  // Con un sí, la tarjeta se va… salvo un cobro aprobado, que se queda
  // diciendo que está en marcha (efecto-aprobar.ts, `trasDecidir`): el cargo lo
  // hace el ejecutor después y puede fallar, así que no se puede pintar como
  // resuelto. La pantalla pregunta cómo ha ido (`seguirCobros`, arriba) y lo dice.
  const accionar = useCallback(async (rec: RecomendacionAPI, accion: AccionRecomendacion): Promise<ResultadoAccion> => {
    const efecto = efectoDe(rec);
    // Aprobar lleva lo que decía el botón —y en un cobro, qué recibos enseñaba—:
    // el servidor no ejecuta otra cosa en su nombre (app/api/decisiones/[id]/aprobar).
    const resultado = await enviarAccion(rec.id, accion, accion === 'aprobar'
      ? { efecto, ...(efecto === 'COBRAR' ? { reciboIds: recibosDeLaAccion(rec.accion) } : {}) }
      : undefined);
    if (resultado.ok) {
      setData(prev => {
        if (!prev) return prev;
        if (accion === 'aprobar' && efecto === 'COBRAR') return marcarAprobada(prev, rec.id);
        if (accion === 'posponer') return marcarPospuesta(prev, rec.id);
        return quitarRecomendacion(prev, rec.id);
      });
    }
    return resultado;
  }, []);

  const aprobar = useCallback((rec: RecomendacionAPI) => accionar(rec, 'aprobar'), [accionar]);
  const rechazar = useCallback((rec: RecomendacionAPI) => accionar(rec, 'rechazar'), [accionar]);
  // "Recuérdamelo": nunca Aprobar/Rechazar — la recomendación se aplaza, no se resuelve.
  const posponer = useCallback((rec: RecomendacionAPI) => accionar(rec, 'posponer'), [accionar]);
  // «Ya la he contactado»: la marca hecha sin mandarle nada (/gestionada).
  const yaContactada = useCallback((rec: RecomendacionAPI) => accionar(rec, 'gestionada'), [accionar]);

  // Aquí no hay tarjeta que tocar: solo hace falta no dejar colgado el botón
  // si el fetch lanza (offline) y decir POR QUÉ si el servidor rechaza (p.ej.
  // 429 "ya hay un análisis reciente en curso").
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

  return { data, loading, error, recargar: cargar, aprobar, rechazar, posponer, yaContactada, analizarAhora, cobrosTardando };
}
