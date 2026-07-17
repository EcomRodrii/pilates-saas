import type { LevelDefinition } from '@/lib/types';

// Calcula el nivel actual de una socia a partir de su total histórico de
// créditos ganados. Pura y reutilizable — la app decide qué niveles existen
// (LevelDefinition, configurables por el estudio); este motor solo ordena y
// compara.

export interface NivelInfo {
  actual: LevelDefinition | null;
  siguiente: LevelDefinition | null;
  creditosTotal: number;
  progreso: number; // 0..1 hacia el siguiente nivel (1 si ya es el máximo)
  creditosParaSiguiente: number | null;
}

export function calcularNivel(niveles: LevelDefinition[], creditosTotal: number): NivelInfo {
  const activos = [...niveles].filter(n => n.activo).sort((a, b) => a.orden - b.orden);

  let actual: LevelDefinition | null = null;
  let siguiente: LevelDefinition | null = null;
  for (const nivel of activos) {
    if (creditosTotal >= nivel.umbralCreditos) {
      actual = nivel;
    } else {
      siguiente = nivel;
      break;
    }
  }

  if (!siguiente) {
    return { actual, siguiente: null, creditosTotal, progreso: 1, creditosParaSiguiente: null };
  }

  const base = actual?.umbralCreditos ?? 0;
  const rango = siguiente.umbralCreditos - base;
  const progreso = rango > 0 ? Math.min(1, Math.max(0, (creditosTotal - base) / rango)) : 0;

  return {
    actual,
    siguiente,
    creditosTotal,
    progreso,
    creditosParaSiguiente: Math.max(0, siguiente.umbralCreditos - creditosTotal),
  };
}
