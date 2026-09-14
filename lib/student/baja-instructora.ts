// ─────────────────────────────────────────────────────────────────────────────
// El motivo de una baja que pide la instructora y la revisión del estudio. Puro.
//
// Decisiones del fundador (14-sep-2026):
//   · Motivo en tres opciones FIJAS y opcionales, más la nota de siempre: así
//     nadie tiene que escribir un diagnóstico para avisar.
//   · Solo las bajas con menos de 24 h de antelación esperan revisión. Con más,
//     es organización normal y no hay nada que revisar.
//   · El estudio decide «Todo en orden» o «Lo hablamos», con una nota que ella
//     ve. Nunca «no justificada», nunca una sanción ni un descuento.
//
// Lo comparten el servidor (`crearBaja`, la agenda) y la app de la instructora.
// ─────────────────────────────────────────────────────────────────────────────

export type CategoriaBaja = 'SALUD' | 'PERSONAL' | 'OTRO';
export type RevisionBaja = 'PENDIENTE' | 'EN_ORDEN' | 'LO_HABLAMOS';

export const CATEGORIAS_BAJA: ReadonlyArray<{ valor: CategoriaBaja; etiqueta: string }> = [
  { valor: 'SALUD', etiqueta: 'No me encuentro bien' },
  { valor: 'PERSONAL', etiqueta: 'Asunto personal' },
  { valor: 'OTRO', etiqueta: 'Otro motivo' },
];

/** Por debajo de esta antelación, la baja espera que el estudio la revise. */
export const MINUTOS_ULTIMA_HORA = 24 * 60;

/** Días que la instructora sigue viendo la revisión de una baja ya resuelta. */
export const DIAS_REVISION_VISIBLE = 7;

/** Cómo lo lee el estudio: en tercera persona, sin más detalle que el que ella dio. */
const CATEGORIA_PARA_ESTUDIO: Record<CategoriaBaja, string> = {
  SALUD: 'No se encuentra bien',
  PERSONAL: 'Asunto personal',
  OTRO: 'Otro motivo',
};

/** «No se encuentra bien · Me ha subido la fiebre», o `null` si no dio motivo. */
export function textoMotivoParaEstudio(categoria: unknown, motivo: unknown): string | null {
  const c = normalizarCategoria(categoria);
  const nota = typeof motivo === 'string' ? motivo.trim() : '';
  const partes = [c ? CATEGORIA_PARA_ESTUDIO[c] : '', nota].filter(Boolean);
  return partes.length ? partes.join(' · ') : null;
}

export function normalizarCategoria(x: unknown): CategoriaBaja | null {
  return x === 'SALUD' || x === 'PERSONAL' || x === 'OTRO' ? x : null;
}

/** Minutos entre el aviso y el inicio de la clase. Nunca negativo. */
export function antelacionMinutos(inicioISO: string, ahoraMs: number): number {
  const inicio = Date.parse(inicioISO);
  if (!Number.isFinite(inicio) || !Number.isFinite(ahoraMs)) return 0;
  return Math.max(0, Math.floor((inicio - ahoraMs) / 60_000));
}

/** 'PENDIENTE' si llega con menos de 24 h; si no, `null`: nada que revisar. */
export function revisionInicial(antelacionMin: number): 'PENDIENTE' | null {
  return antelacionMin < MINUTOS_ULTIMA_HORA ? 'PENDIENTE' : null;
}

/** Lo que decide el estudio. `PENDIENTE` nunca llega desde el panel. */
export type DecisionEstudio = 'EN_ORDEN' | 'LO_HABLAMOS';
export const MAX_NOTA_ESTUDIO = 500;

export function normalizarDecision(x: unknown): DecisionEstudio | null {
  return x === 'EN_ORDEN' || x === 'LO_HABLAMOS' ? x : null;
}

/** «Avisó con 3 h de antelación», «con 40 min». Solo hechos, sin adjetivos. */
export function textoAntelacion(minutos: number): string {
  const m = Number.isFinite(minutos) ? Math.max(0, Math.floor(minutos)) : 0;
  if (m < 60) return `Avisó con ${m} min de antelación`;
  const h = Math.floor(m / 60);
  return `Avisó con ${h} h de antelación`;
}

export interface RevisionVista {
  estado: RevisionBaja;
  /** Lo que el estudio le quiere decir. Solo con la revisión hecha. */
  nota: string | null;
  revisadaEn: string | null;
}

export function normalizarRevision(x: unknown): RevisionVista | null {
  if (!x || typeof x !== 'object') return null;
  const v = x as Record<string, unknown>;
  if (v.estado !== 'PENDIENTE' && v.estado !== 'EN_ORDEN' && v.estado !== 'LO_HABLAMOS') return null;
  const nota = typeof v.nota === 'string' && v.nota.trim() ? v.nota : null;
  const revisadaEn = typeof v.revisadaEn === 'string' && Number.isFinite(Date.parse(v.revisadaEn)) ? v.revisadaEn : null;
  if (v.estado !== 'PENDIENTE' && !revisadaEn) return null;
  return { estado: v.estado, nota: v.estado === 'PENDIENTE' ? null : nota, revisadaEn: v.estado === 'PENDIENTE' ? null : revisadaEn };
}

/**
 * Lo que ve la instructora de la revisión. Mientras está pendiente, nada: la
 * tarjeta ya dice lo que pasa con la clase, y un «pendiente de revisión» suena a
 * expediente abierto.
 */
export function textoRevision(r: RevisionVista | null): { titulo: string; nota: string | null } | null {
  if (!r || r.estado === 'PENDIENTE') return null;
  return {
    titulo: r.estado === 'EN_ORDEN' ? 'El estudio lo ha revisado: todo en orden' : 'El estudio quiere hablarlo contigo',
    nota: r.nota,
  };
}

/** ¿Sigue enseñándose la revisión de una baja que el estudio ya cerró? */
export function revisionReciente(r: RevisionVista | null | undefined, ahoraMs: number): boolean {
  if (!r || r.estado === 'PENDIENTE' || !r.revisadaEn) return false;
  const cuando = Date.parse(r.revisadaEn);
  return Number.isFinite(cuando) && ahoraMs - cuando <= DIAS_REVISION_VISIBLE * 86_400_000;
}
