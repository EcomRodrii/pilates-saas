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
import { identidadVerificada, activaRecientemente } from './badges.ts';

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
 * Cuenta cuántos de los 4 badges de confianza (identidad, experiencia,
 * referencia profesional, actividad reciente) están activos para este
 * perfil. `identidadVerificadaEn` se escribe desde F1
 * (app/api/interno/network/verificaciones-identidad/route.ts, ya NO es
 * "siempre null" como en V1) y `experienciaVerificada`/`referenciaProfesional`
 * llegan calculados en LOTE en `PerfilNetworkPublico` (buscarPerfilesPublico).
 * Usada tanto para ORDENAR (aquí) como para ENSEÑAR el contador "X de 4
 * verificaciones" en la tarjeta del buscador (F2) — una sola fuente de
 * verdad, nunca un porcentaje fabricado (ver Tentare Brain en
 * .claude/tentare-os.md sobre "Compatibilidad 87%").
 */
export function contarBadgesVerificacion(
  p: Pick<PerfilNetworkPublico, 'identidadVerificadaEn' | 'experienciaVerificada' | 'referenciaProfesional' | 'ultimoAccesoEn'>,
  ahora: Date,
): number {
  return (
    (identidadVerificada(p.identidadVerificadaEn) ? 1 : 0) +
    (p.experienciaVerificada ? 1 : 0) +
    (p.referenciaProfesional ? 1 : 0) +
    (activaRecientemente(p.ultimoAccesoEn, ahora) ? 1 : 0)
  );
}

function actividadRecienteMs(ultimoAccesoEn: string | null): number {
  return ultimoAccesoEn ? new Date(ultimoAccesoEn).getTime() : 0;
}

/**
 * Límite inferior de `tarifaRango` para poder ordenar por precio — el dato
 * real es un rango categórico ('20-25', no un número, ver
 * TARIFAS_RANGO_NETWORK en catalogo.ts), así que se parsea el primer número
 * antes del guion. `null` para perfiles sin tarifa Y para 'a_negociar' (no
 * tiene cifra que ordenar) — mismo trato, "sin dato", nunca 0€/hora.
 */
function tarifaInferior(rango: PerfilNetworkPublico['tarifaRango']): number | null {
  if (!rango) return null;
  const match = /^(\d+)-/.exec(rango);
  return match ? Number(match[1]) : null;
}

/**
 * Clave [sinDato, valor] para un criterio de orden con "sin dato" explícito.
 * `sinDato` va primero siempre en último lugar (1 > 0) sea cual sea el
 * signo de `valor` — nunca se trata la ausencia de dato como el valor más
 * bajo (penalizaría a perfiles nuevos/incompletos) ni como el más alto
 * (favorecería inventar datos).
 */
function claveConDato(valor: number | null): [number, number] {
  return valor == null ? [1, 0] : [0, valor];
}

function clavesOrden(p: PerfilNetworkPublico, filtro: FiltroBusquedaNetwork, ahora: Date): number[] {
  const clavesResto = [
    -PRIORIDAD_DISPONIBILIDAD[p.disponibilidadEstado],
    -coincidenciaEspecialidad(p.especialidades, filtro.especialidades),
    distanciaAproximada(p.ciudad, filtro.ciudad),
    -(p.aniosExperiencia ?? 0),
    -contarBadgesVerificacion(p, ahora),
    -actividadRecienteMs(p.ultimoAccesoEn),
  ];
  // Destacado (app/interno/network, editorial — nunca la propia
  // instructora) es la clave PRIMERA por defecto (manda sobre todo lo
  // demás, incluida la disponibilidad: es una decisión humana del equipo de
  // Tentare, no una señal del perfil). Con un orden explícito por
  // precio/valoración, ese criterio pedido pasa a ser la primera clave y
  // destacado baja a desempate — pedir "ordenar por precio" y ver arriba a
  // alguien caro solo porque el equipo la destacó rompería la promesa del
  // selector.
  if (filtro.ordenarPor === 'precio') {
    return [...claveConDato(tarifaInferior(p.tarifaRango)), p.destacado ? 0 : 1, ...clavesResto];
  }
  if (filtro.ordenarPor === 'valoracion') {
    const { promedio, total } = p.resumenResenas;
    const valor = total > 0 && promedio != null ? -promedio : null; // descendente: mejor valorada primero
    return [...claveConDato(valor), p.destacado ? 0 : 1, ...clavesResto];
  }
  // 'relevancia' (default) y 'cercania': la cercanía no se resuelve aquí —
  // el servidor no tiene la posición del navegador — así que cae al orden
  // de relevancia de siempre; el cliente la reordena después reutilizando
  // `ordenarPorCercania` (lib/network/use-cerca-de-mi.ts) sobre esta misma
  // lista, sin duplicar el cálculo de distancia.
  return [p.destacado ? 0 : 1, ...clavesResto];
}

export function ordenarResultadosNetwork(
  perfiles: readonly PerfilNetworkPublico[],
  filtro: FiltroBusquedaNetwork,
): PerfilNetworkPublico[] {
  // Una sola vez por llamada, no por par comparado: `contarBadgesVerificacion`
  // depende de "ahora" (activaRecientemente) y un sort estable no debe ver el
  // reloj moverse entre comparaciones de la misma pasada.
  const ahora = new Date();
  return [...perfiles].sort((a, b) => {
    const clavesA = clavesOrden(a, filtro, ahora);
    const clavesB = clavesOrden(b, filtro, ahora);
    for (let i = 0; i < clavesA.length; i++) {
      if (clavesA[i] !== clavesB[i]) return clavesA[i] - clavesB[i];
    }
    return 0;
  });
}
