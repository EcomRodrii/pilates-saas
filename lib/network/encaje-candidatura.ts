// Encaje candidatura↔vacante — Fase 2 "marketplace bidireccional", matching.
//
// Mismo criterio que lib/sustituciones/encaje.ts (que existe precisamente
// para corregir "Compatibilidad 87 %" fabricado con
// `LEAST(99, GREATEST(55, score))`, un número que no medía nada): aquí solo
// se construye ENCAJE — barra cualitativa con criterios literales, auditable
// — nunca una PROBABILIDAD con cifra dura. No hay volumen de candidaturas
// resueltas en Network todavía para respaldar una probabilidad real (mismo
// principio que Prediccion/Confianza, lib/decision/prediccion.ts: sin datos
// suficientes, no se inventa un número).
//
// Deliberadamente NO vive en el buscador de instructoras del panel de
// estudio: `studios` no tiene ningún campo de especialidades/horarios propio
// en el schema — construir "afinidad con el estudio" ahí exigiría un dato
// fantasma. `red_vacantes` sí tiene requisitos estructurados directamente
// comparables con `red_perfiles` (mismo tipo de dato en ambos lados), así
// que el matching vive ahí: candidatura a UNA vacante concreta.
import type { VacanteNetwork } from './tipos.ts';
import type { EspecialidadNetwork, HorarioNetwork, TarifaRangoNetwork } from './catalogo.ts';

export interface PerfilParaEncaje {
  ciudad: string | null;
  especialidades: EspecialidadNetwork[];
  disponibilidadHorarios: HorarioNetwork[];
  tipoTrabajo: string[];
  tarifaRango: TarifaRangoNetwork | null;
}

export interface VacanteParaEncaje {
  especialidades: VacanteNetwork['especialidades'];
  horarios: VacanteNetwork['horarios'];
  tipoTrabajo: VacanteNetwork['tipoTrabajo'];
  tarifaRango: VacanteNetwork['tarifaRango'];
  estudioCiudad: string | null;
}

export interface CriterioEncaje {
  label: string;
  cumple: boolean;
}

export interface EncajeCandidatura {
  /** Ancho de la barra, 0..100. Solo cuenta criterios APLICABLES. */
  barra: number;
  /** Vacío si ningún criterio era aplicable (sin dato en algún lado) — nunca un 50 % neutro. */
  criterios: CriterioEncaje[];
}

function interseccionNoVacia<T>(a: T[], b: T[]): boolean {
  return a.some(v => b.includes(v));
}

export function encajeCandidaturaDe(vacante: VacanteParaEncaje, perfil: PerfilParaEncaje): EncajeCandidatura {
  const criterios: CriterioEncaje[] = [];

  // Especialidad: aplicable si ambos lados tienen alguna.
  if (vacante.especialidades.length > 0 && perfil.especialidades.length > 0) {
    criterios.push({ label: 'Especialidad', cumple: interseccionNoVacia(vacante.especialidades, perfil.especialidades) });
  }

  // Horario: aplicable si ambos lados tienen alguno.
  if (vacante.horarios.length > 0 && perfil.disponibilidadHorarios.length > 0) {
    criterios.push({ label: 'Horario', cumple: interseccionNoVacia(vacante.horarios, perfil.disponibilidadHorarios) });
  }

  // Tipo de trabajo: aplicable si el perfil declaró alguno.
  if (perfil.tipoTrabajo.length > 0) {
    criterios.push({ label: 'Tipo de trabajo', cumple: perfil.tipoTrabajo.includes(vacante.tipoTrabajo) });
  }

  // Tarifa: excluida si cualquiera de los dos lados es "a negociar" o falta
  // — no es un desencaje, es la ausencia de una cifra comparable.
  if (vacante.tarifaRango !== 'a_negociar' && perfil.tarifaRango && perfil.tarifaRango !== 'a_negociar') {
    criterios.push({ label: 'Tarifa', cumple: perfil.tarifaRango === vacante.tarifaRango });
  }

  // Ciudad: aplicable solo si ambos lados tienen dato (mismo criterio que
  // `distanciaAproximada` en ranking.ts: sin dato, no penaliza).
  if (vacante.estudioCiudad && perfil.ciudad) {
    criterios.push({
      label: 'Ciudad',
      cumple: perfil.ciudad.trim().toLowerCase() === vacante.estudioCiudad.trim().toLowerCase(),
    });
  }

  if (criterios.length === 0) return { barra: 0, criterios: [] };

  const cumplidos = criterios.filter(c => c.cumple).length;
  const barra = Math.round((cumplidos / criterios.length) * 100);
  return { barra, criterios };
}
