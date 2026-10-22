import type { LevelDefinition } from '@/lib/types';
import { vistaDeNivel } from '../gamificacion/ritmo-niveles.ts';

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
  // Una sola función para panel, app y servidor: ritmo-niveles.ts (por umbral, no por `orden`).
  const v = vistaDeNivel(creditosTotal, niveles);
  return {
    actual: v.actual,
    siguiente: v.siguiente,
    creditosTotal,
    progreso: v.siguiente ? v.progreso : 1,
    creditosParaSiguiente: v.faltan,
  };
}
