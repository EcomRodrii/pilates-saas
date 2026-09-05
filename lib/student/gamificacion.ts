// Nivel, logros, retos y recompensas de la alumna. Sin imports ni `@/`: el
// runner de Node (`--experimental-strip-types`) no resuelve ese alias.
//
// Aquí NO se calcula nada que el servidor ya decida. El progreso de logros y
// retos lo evalúa `evaluarGamificacionServidor` en cada reserva y cancelación,
// el saldo lo lleva `member_credits` con `ajustar_creditos` (atómico), y el
// canje lo valida `/api/public/canje`. Esto solo ORDENA y presenta lo que el
// payload ya trae: si el estudio no ha configurado nada, no hay nada que pintar.

export interface NivelDef { id: string; nombre: string; orden: number; umbralCreditos: number; color: string; icono: string; beneficios: string | null }
export interface LogroDef { id: string; nombre: string; descripcion: string | null; umbral: number; icono: string; creditosRecompensa: number; activo: boolean }
export interface RetoDef { id: string; nombre: string; descripcion: string | null; icono: string; objetivo: number; fechaInicio: string; fechaFin: string; creditosRecompensa: number; activo?: boolean }
export interface ProgresoMin { achievementId?: string; challengeId?: string; progresoActual: number; completado: boolean; completadoEn: string | null }
export interface RecompensaDef { id: string; nombre: string; descripcion: string | null; costeCreditos: number; icono: string; activo: boolean; stock: number | null }

export interface NivelVista {
  actual: NivelDef | null;
  siguiente: NivelDef | null;
  /** Créditos que faltan para el siguiente nivel; `null` si ya está en el último. */
  faltan: number | null;
  /** 0-1 dentro del tramo actual. Sin siguiente nivel, 1. */
  progreso: number;
}

/**
 * El nivel sale del total HISTÓRICO ganado, no del saldo: canjear recompensas
 * nunca hace bajar de nivel (es la regla que el propio panel enuncia).
 */
export function nivelDe(totalGanado: number, niveles: NivelDef[]): NivelVista {
  const orden = [...niveles].sort((a, b) => a.umbralCreditos - b.umbralCreditos || a.orden - b.orden);
  if (orden.length === 0) return { actual: null, siguiente: null, faltan: null, progreso: 0 };
  let actual: NivelDef | null = null;
  let siguiente: NivelDef | null = null;
  for (const n of orden) {
    if (totalGanado >= n.umbralCreditos) actual = n;
    else { siguiente = n; break; }
  }
  if (!siguiente) return { actual, siguiente: null, faltan: null, progreso: 1 };
  const desde = actual?.umbralCreditos ?? 0;
  const tramo = siguiente.umbralCreditos - desde;
  const avance = totalGanado - desde;
  return {
    actual,
    siguiente,
    faltan: Math.max(0, siguiente.umbralCreditos - totalGanado),
    progreso: tramo > 0 ? Math.min(1, Math.max(0, avance / tramo)) : 0,
  };
}

export interface LogroVista extends LogroDef { progresoActual: number; completado: boolean; completadoEn: string | null }

/**
 * Los logros activos, con el progreso REAL de la socia. Primero los que le
 * faltan (y de esos, los que tiene más cerca), después los conseguidos: lo
 * accionable arriba, la vitrina debajo.
 */
export function logrosDe(defs: LogroDef[], progreso: ProgresoMin[]): LogroVista[] {
  const porId = new Map(progreso.filter((p) => p.achievementId).map((p) => [p.achievementId as string, p]));
  return defs
    .filter((d) => d.activo)
    .map((d) => {
      const p = porId.get(d.id);
      return { ...d, progresoActual: p?.progresoActual ?? 0, completado: p?.completado ?? false, completadoEn: p?.completadoEn ?? null };
    })
    .sort((a, b) => {
      if (a.completado !== b.completado) return a.completado ? 1 : -1;
      if (a.completado) return (b.completadoEn ?? '').localeCompare(a.completadoEn ?? '');
      const fa = a.umbral > 0 ? a.progresoActual / a.umbral : 0;
      const fb = b.umbral > 0 ? b.progresoActual / b.umbral : 0;
      return fb - fa;
    });
}

export interface RetoVista extends RetoDef { progresoActual: number; completado: boolean; apuntada: boolean; diasRestantes: number }

/**
 * Solo los retos VIGENTES hoy: un reto tiene fecha de inicio y fin, y enseñar
 * uno terminado como si se pudiera participar es prometer lo que no hay.
 */
export function retosDe(defs: RetoDef[], progreso: ProgresoMin[], apuntados: string[], hoyISO: string): RetoVista[] {
  const porId = new Map(progreso.filter((p) => p.challengeId).map((p) => [p.challengeId as string, p]));
  const apuntada = new Set(apuntados);
  return defs
    .filter((d) => d.activo !== false && d.fechaInicio <= hoyISO && d.fechaFin >= hoyISO)
    .map((d) => {
      const p = porId.get(d.id);
      return {
        ...d,
        progresoActual: p?.progresoActual ?? 0,
        completado: p?.completado ?? false,
        apuntada: apuntada.has(d.id),
        diasRestantes: diasEntre(hoyISO, d.fechaFin),
      };
    })
    .sort((a, b) => a.diasRestantes - b.diasRestantes);
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = new Date(`${desdeISO}T12:00:00`).getTime();
  const b = new Date(`${hastaISO}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export interface RecompensaVista extends RecompensaDef { alcanzable: boolean; faltan: number; agotada: boolean }

/**
 * El catálogo, con lo que la socia puede permitirse HOY. `stock` a 0 es agotado
 * (`null` = ilimitado); una recompensa agotada se enseña deshabilitada en vez de
 * desaparecer, porque el estudio la anuncia y no verla confunde más.
 */
export function recompensasDe(items: RecompensaDef[], saldo: number): RecompensaVista[] {
  return items
    .filter((i) => i.activo)
    .map((i) => ({
      ...i,
      alcanzable: saldo >= i.costeCreditos && (i.stock === null || i.stock > 0),
      faltan: Math.max(0, i.costeCreditos - saldo),
      agotada: i.stock !== null && i.stock <= 0,
    }))
    .sort((a, b) => {
      if (a.agotada !== b.agotada) return a.agotada ? 1 : -1;
      if (a.alcanzable !== b.alcanzable) return a.alcanzable ? -1 : 1;
      return a.costeCreditos - b.costeCreditos;
    });
}

/** ¿Hay algo que enseñar? Sin nada configurado, la pantalla no debe existir. */
export function hayGamificacion(p: { niveles: unknown[]; logros: unknown[]; retos: unknown[]; recompensas: unknown[] }): boolean {
  return p.niveles.length > 0 || p.logros.length > 0 || p.retos.length > 0 || p.recompensas.length > 0;
}
