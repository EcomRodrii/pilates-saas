// Ranking del buscador — docs/NETWORK-IMPLEMENTATION-PLAN.md §8.
//
// Determinista, sin IA: un comparador por TUPLAS, no un score único
// ponderado. Cada campo de la tupla es un criterio, en el orden de
// prioridad pedido; solo se mira el siguiente si hay empate en el anterior.
// Esto lo hace auditable — "por qué esta profesional sale primero" tiene
// una respuesta literal, no una suma de pesos opacos — y evolucionable
// después a un score ponderado sin romper el contrato de
// `ordenarResultadosNetwork` si algún día hace falta.
//
// Orden de prioridad (pedido explícitamente): disponibilidad → coincidencia
// de especialidad → ubicación → experiencia → verificaciones → actividad
// reciente.
import type { DisponibilidadEstadoNetwork } from './catalogo.ts';
import type { FiltroBusquedaNetwork, PerfilNetworkPublico } from './tipos.ts';

const PRIORIDAD_DISPONIBILIDAD: Record<DisponibilidadEstadoNetwork, number> = {
  disponible: 3,
  disponible_sustituciones: 2,
  buscando_trabajo: 1,
  no_disponible: 0,
};

/** Cuántas especialidades filtradas tiene esta profesional. 0 si no se filtró por ninguna. */
function coincidenciaEspecialidad(especialidades: readonly string[], filtro: readonly string[]): number {
  if (filtro.length === 0) return 0;
  return especialidades.filter(e => filtro.includes(e)).length;
}

/**
 * Sin geolocalización real en V1 (docs/NETWORK-AUDIT.md, límite conocido):
 * comparación de texto, no de distancia. 0 = misma ciudad que el filtro
 * (mejor), 1 = sin filtro de ciudad o sin ciudad en el perfil (empatan,
 * ninguna razón para preferir una sobre otra), 2 = ciudad distinta a la
 * pedida (peor, pero no se descarta — puede seguir interesando por el resto
 * de criterios, filtrar del todo sería decisión del backend, no del ranking).
 */
function distanciaAproximada(ciudad: string | null, filtroCiudad: string | null): number {
  if (!filtroCiudad) return 1;
  if (!ciudad) return 1;
  return ciudad.trim().toLowerCase() === filtroCiudad.trim().toLowerCase() ? 0 : 2;
}

/**
 * Badges de verificación. Hoy solo `identidadVerificadaEn` está en el
 * perfil (Badge 5, siempre null en V1) — Badges 3/4 (experiencia/referencia
 * confirmadas) viven en `red_experiencias`/`red_referencias` (Fase 6/7) y
 * este endpoint de búsqueda no las consulta todavía. Se deja el hueco
 * documentado en vez de fingir una cuenta completa: cuando esas fases
 * lleguen, se pasa el recuento real aquí sin tocar el resto del algoritmo.
 */
function contarBadgesVerificacion(p: Pick<PerfilNetworkPublico, 'identidadVerificadaEn'>): number {
  return p.identidadVerificadaEn ? 1 : 0;
}

function actividadRecienteMs(ultimoAccesoEn: string | null): number {
  return ultimoAccesoEn ? new Date(ultimoAccesoEn).getTime() : 0;
}

function clavesOrden(p: PerfilNetworkPublico, filtro: FiltroBusquedaNetwork): number[] {
  return [
    -PRIORIDAD_DISPONIBILIDAD[p.disponibilidadEstado],
    -coincidenciaEspecialidad(p.especialidades, filtro.especialidades),
    distanciaAproximada(p.ciudad, filtro.ciudad),
    -(p.aniosExperiencia ?? 0),
    -contarBadgesVerificacion(p),
    -actividadRecienteMs(p.ultimoAccesoEn),
  ];
}

export function ordenarResultadosNetwork(
  perfiles: readonly PerfilNetworkPublico[],
  filtro: FiltroBusquedaNetwork,
): PerfilNetworkPublico[] {
  return [...perfiles].sort((a, b) => {
    const clavesA = clavesOrden(a, filtro);
    const clavesB = clavesOrden(b, filtro);
    for (let i = 0; i < clavesA.length; i++) {
      if (clavesA[i] !== clavesB[i]) return clavesA[i] - clavesB[i];
    }
    return 0;
  });
}
