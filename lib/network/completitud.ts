// Completitud del perfil de Network — docs/NETWORK-IMPLEMENTATION-PLAN.md §1.
//
// Se calcula, nunca se persiste: guardarlo en una columna lo desincroniza en
// cuanto se añade un campo nuevo al formulario. Pesos que suman 100, cada uno
// atado a UNA sección concreta de /network/mi-perfil.
//
// No confundir con verificación (badges): esto es "¿has rellenado tu
// perfil?", no "¿alguien ha confirmado lo que dices?" — riesgo #3 de
// docs/NETWORK-AUDIT.md, deliberadamente dos conceptos separados en la UI.

// Función pura: sin imports del resto del repo (aparte de tipos, que no
// generan dependencia en runtime) para que `node --test` la pruebe sola.
import type { PerfilNetwork } from './tipos.ts';

export interface DetalleCompletitud {
  datosBasicos: boolean;
  foto: boolean;
  especialidades: boolean;
  experiencia: boolean;
  disponibilidad: boolean;
  tarifa: boolean;
  preferencias: boolean;
}

const PESOS: Record<keyof DetalleCompletitud, number> = {
  datosBasicos: 20,
  foto: 10,
  especialidades: 15,
  experiencia: 20,
  disponibilidad: 15,
  tarifa: 10,
  preferencias: 10,
};

// Arrays como `readonly string[]`: solo importa su longitud aquí, y así
// tanto un array mutable (venido de la BD) como uno literal `as const` (en
// los tests) encajan sin fricción de tipos.
interface PerfilParaCompletitud {
  nombre: PerfilNetwork['nombre'];
  ciudad: PerfilNetwork['ciudad'];
  fotoUrl: PerfilNetwork['fotoUrl'];
  especialidades: readonly string[];
  disponibilidadHorarios: readonly string[];
  tarifaRango: PerfilNetwork['tarifaRango'];
  tipoTrabajo: readonly string[];
}

/**
 * `tieneExperiencia` se pasa aparte porque vive en `red_experiencias`
 * (Fase 6, tabla distinta) — el perfil por sí solo no lo sabe. Antes de que
 * esa fase exista, cualquier llamador pasa `false`: el 20% de "experiencia"
 * queda sin cubrir hasta entonces, documentado, no un bug.
 */
export function calcularCompletitudPerfil(
  perfil: PerfilParaCompletitud,
  tieneExperiencia: boolean,
): { porcentaje: number; detalle: DetalleCompletitud } {
  const detalle: DetalleCompletitud = {
    datosBasicos: Boolean(perfil.nombre?.trim() && perfil.ciudad?.trim()),
    foto: Boolean(perfil.fotoUrl),
    especialidades: perfil.especialidades.length > 0,
    experiencia: tieneExperiencia,
    disponibilidad: perfil.disponibilidadHorarios.length > 0,
    tarifa: Boolean(perfil.tarifaRango),
    preferencias: perfil.tipoTrabajo.length > 0,
  };
  const porcentaje = (Object.keys(PESOS) as (keyof DetalleCompletitud)[])
    .reduce((acc, clave) => acc + (detalle[clave] ? PESOS[clave] : 0), 0);
  return { porcentaje, detalle };
}
