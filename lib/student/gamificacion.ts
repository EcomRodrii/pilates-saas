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
export interface RecompensaDef {
  id: string; nombre: string; descripcion: string | null; costeCreditos: number;
  icono: string; activo: boolean; stock: number | null; efecto?: 'MANUAL' | 'CLASE_GRATIS';
  /** null = sin límite por socia; null en las dos fechas = siempre vigente. */
  limitePorSocia?: number | null;
  disponibleDesde?: string | null;
  disponibleHasta?: string | null;
}

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

export interface RecompensaVista extends RecompensaDef {
  alcanzable: boolean; faltan: number; agotada: boolean;
  /** Su ventana aún no ha empezado: se enseña, pero no se puede canjear. */
  aunNoDisponible: boolean;
  /** Ya la ha canjeado tantas veces como permite el estudio. */
  limiteAlcanzado: boolean;
}

/**
 * El catálogo, con lo que la socia puede permitirse HOY.
 *
 * Qué se enseña y qué no, que es la decisión de verdad:
 *
 *  · Agotada (`stock` 0; `null` = ilimitado) → se enseña deshabilitada. El
 *    estudio la anuncia y no verla confunde más que verla sin poder pulsarla.
 *  · Aún no vigente → se enseña con su fecha. Da algo por lo que volver, y
 *    explica por qué no se puede pulsar en vez de dejarlo en misterio.
 *  · Vigencia ya pasada → NO se enseña. Nadie va a poder canjearla nunca más,
 *    así que es ruido en una pantalla que ya lleva nivel, logros y retos.
 *  · Límite personal alcanzado → se enseña deshabilitada, porque otra socia sí
 *    puede: desaparecer daría a entender que el estudio la ha retirado.
 *
 * `canjesPorItem` cuenta los canjes NO cancelados de ESTA socia. Nada de esto
 * es el cerrojo: quien decide es `canjear_recompensa` en la base de datos.
 */
export function recompensasDe(
  items: RecompensaDef[],
  saldo: number,
  hoy?: string,
  canjesPorItem: Record<string, number> = {},
): RecompensaVista[] {
  return items
    .filter((i) => i.activo)
    .filter((i) => !(hoy && i.disponibleHasta && hoy > i.disponibleHasta))
    .map((i) => {
      const aunNoDisponible = Boolean(hoy && i.disponibleDesde && hoy < i.disponibleDesde);
      const agotada = i.stock !== null && i.stock !== undefined && i.stock <= 0;
      const limiteAlcanzado = i.limitePorSocia != null && (canjesPorItem[i.id] ?? 0) >= i.limitePorSocia;
      return {
        ...i,
        alcanzable: saldo >= i.costeCreditos && !agotada && !aunNoDisponible && !limiteAlcanzado,
        faltan: Math.max(0, i.costeCreditos - saldo),
        agotada,
        aunNoDisponible,
        limiteAlcanzado,
      };
    })
    .sort((a, b) => {
      // Lo que ya no da nada baja del todo; lo que se puede canjear, arriba.
      const muerta = (r: RecompensaVista) => r.agotada || r.limiteAlcanzado;
      if (muerta(a) !== muerta(b)) return muerta(a) ? 1 : -1;
      if (a.aunNoDisponible !== b.aunNoDisponible) return a.aunNoDisponible ? 1 : -1;
      if (a.alcanzable !== b.alcanzable) return a.alcanzable ? -1 : 1;
      return a.costeCreditos - b.costeCreditos;
    });
}

/** ¿Hay algo que enseñar? Sin nada configurado, la pantalla no debe existir. */
export function hayGamificacion(p: {
  niveles: unknown[]; logros: unknown[]; retos: unknown[]; recompensas: unknown[];
  formasDeGanar?: unknown[]; saldo?: number;
}): boolean {
  return p.niveles.length > 0 || p.logros.length > 0 || p.retos.length > 0 || p.recompensas.length > 0
    // Un estudio que solo DA créditos (sin niveles ni catálogo) también tiene
    // algo que enseñar: el saldo y cómo ganar más. Y un saldo que ya tiene no
    // se esconde tras «tu estudio aún no ha configurado esto» porque el estudio
    // haya borrado su catálogo.
    || (p.formasDeGanar?.length ?? 0) > 0 || (p.saldo ?? 0) > 0;
}

// ── Cómo se ganan ────────────────────────────────────────────────────────────

/** Una regla del estudio tal como viaja en el payload público (`reward_rules`). */
export interface ReglaDef {
  trigger: string;
  creditos: number;
  activa: boolean;
  unidadEuros?: number | null;
  topeMensual?: number | null;
}

/** Una forma de ganar créditos, lista para pintar. */
export interface FormaDeGanar {
  trigger: string;
  titulo: string;
  /** Cuándo cuenta, si el título no basta. */
  detalle: string | null;
  creditos: number;
  /** Solo compras: cada cuántos euros se dan los `creditos`. */
  porCadaEuros: number | null;
}

const euros = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

// ⚠️ Cada texto describe lo que el CÓDIGO premia de verdad, no el nombre
// interno de la regla:
//  · «Semana completa» se da con la primera clase ASISTIDA de cada semana
//    (`calcularRacha` en el check-in, panel y servidor), no por ir a todas.
//  · «Comprar» solo cuenta en la caja del estudio (`otorgar_creditos_compra`,
//    TPV): `floor(importe / unidad) × créditos`.
//  · «Traer a una amiga» se da cuando la amiga ASISTE a su primera clase, con
//    el tope mensual de la regla (`decidirPremioReferido`).
// Si un disparador cambia de comportamiento, su texto cambia en el mismo PR.
// El orden es el de la pantalla: lo más frecuente primero.
const FORMAS: ReadonlyArray<{ trigger: string; titulo: string; detalle: (r: ReglaDef) => string | null }> = [
  { trigger: 'ASISTENCIA_CLASE', titulo: 'Asistir a una clase', detalle: () => null },
  { trigger: 'SEMANA_COMPLETA', titulo: 'Venir a clase cada semana', detalle: () => 'Con tu primera clase de la semana' },
  { trigger: 'OBJETIVO_MENSUAL', titulo: 'Cumplir tu objetivo del mes', detalle: () => 'Las clases que te marcas para el mes' },
  { trigger: 'PRIMERA_RESERVA', titulo: 'Tu primera reserva', detalle: () => null },
  {
    trigger: 'REFERIDO_AMIGO', titulo: 'Traer a una amiga',
    detalle: (r) => r.topeMensual && r.topeMensual > 0
      ? `Cuando venga a su primera clase · hasta ${r.topeMensual} ${r.topeMensual === 1 ? 'amiga' : 'amigas'} al mes`
      : 'Cuando venga a su primera clase',
  },
  { trigger: 'RENOVACION_PLAN', titulo: 'Renovar tu plan', detalle: () => null },
  {
    trigger: 'COMPRA', titulo: 'Comprar en el estudio',
    detalle: (r) => {
      const u = r.unidadEuros && r.unidadEuros > 0 ? r.unidadEuros : 1;
      return u === 1 ? 'Por cada euro que gastes en el estudio' : `Por cada ${euros(u)} € que gastes en el estudio`;
    },
  },
];

/**
 * Cómo se ganan créditos en ESTE estudio: solo sus reglas activas y con algo
 * que dar. Igual que la RPC que los otorga, vale la primera regla activa de
 * cada disparador.
 */
export function formasDeGanar(reglas: ReadonlyArray<ReglaDef>): FormaDeGanar[] {
  return FORMAS.flatMap(({ trigger, titulo, detalle }) => {
    const r = reglas.find((x) => x.trigger === trigger && x.activa);
    if (!r || !(r.creditos > 0)) return [];
    return [{
      trigger, titulo, detalle: detalle(r), creditos: r.creditos,
      porCadaEuros: trigger === 'COMPRA' ? (r.unidadEuros && r.unidadEuros > 0 ? r.unidadEuros : 1) : null,
    }];
  });
}

/** Lo que da asistir a una clase; `null` = el estudio no premia la asistencia. */
export function creditosPorAsistir(reglas: ReadonlyArray<ReglaDef>): number | null {
  return formasDeGanar(reglas).find((f) => f.trigger === 'ASISTENCIA_CLASE')?.creditos ?? null;
}

// ── Sus canjes ───────────────────────────────────────────────────────────────

export interface CanjeVista {
  id: string;
  /** Nombre de la recompensa, o un texto honesto si ya no está en el catálogo. */
  recompensa: string;
  creditos: number;
  fecha: string;
  estado: 'PENDIENTE' | 'ENTREGADO' | 'CANCELADO';
  codigo: string | null;
}

export interface CanjeCrudo {
  id: string;
  catalogItemId: string;
  estado: string;
  codigo?: string | null;
  creditosGastados?: number;
  creadoEn?: string;
}

/**
 * El historial de canjes de la socia, lo más reciente primero.
 *
 * ⚠️ Existe porque hasta ahora NO existía, y eso costó dinero real: el
 * 9-sep-2026 el fundador canjeó una botella, no vio nada más que un aviso que
 * se desvanece, y volvió a pulsar 41 segundos después. Dos canjes, diez
 * créditos, una botella. Un canje que no se puede volver a mirar es un canje
 * que la socia no sabe si ocurrió.
 *
 * Los CANCELADOS se quedan a propósito: cancelar devuelve créditos y stock, y
 * si desaparecieran, a la socia le faltarían créditos sin ninguna línea que lo
 * explicara.
 *
 * El nombre sale del catálogo. Cuando el estudio retira una recompensa, sus
 * canjes viejos siguen existiendo; decir «Recompensa retirada» es más honesto
 * que esconder la fila y que no cuadren los créditos gastados.
 */
export function canjesDe(
  canjes: CanjeCrudo[],
  items: { id: string; nombre: string }[],
): CanjeVista[] {
  const nombre = new Map(items.map((i) => [i.id, i.nombre]));
  return canjes
    .map((c) => ({
      id: c.id,
      recompensa: nombre.get(c.catalogItemId) ?? 'Recompensa retirada del catálogo',
      creditos: c.creditosGastados ?? 0,
      fecha: c.creadoEn ?? '',
      estado: (c.estado === 'ENTREGADO' || c.estado === 'CANCELADO' ? c.estado : 'PENDIENTE') as CanjeVista['estado'],
      codigo: c.codigo ?? null,
    }))
    .sort((a, b) => {
      // Lo pendiente arriba: es lo único que le queda por hacer (pasar por el
      // estudio). El resto es histórico y se ordena por fecha.
      if ((a.estado === 'PENDIENTE') !== (b.estado === 'PENDIENTE')) return a.estado === 'PENDIENTE' ? -1 : 1;
      return b.fecha.localeCompare(a.fecha);
    });
}
