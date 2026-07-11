// Versión del algoritmo de decisión (DECISION-OS-MODELO-DATOS.md §2.12).
// Se estampa en cada Recomendacion y DecisionSession al crearse. La
// calibración de confianza (confianza.ts, camino futuro Fase F) solo agrupa
// outcomes dentro de la misma versión MAYOR — un cambio de PESOS/umbrales
// invalida la comparabilidad con outcomes previos.
//
// MAYOR (x.0.0): cambia PESOS, umbrales de confianza o fórmula de score.
// MENOR (1.x.0): nueva regla o especialista, sin alterar el comportamiento existente.
// PARCHE (1.0.x): fix que no toca scoring ni umbrales.
// 1.1.0 — Retención R5 (baja sin renovar), Ingresos I3 (impago sin tarjeta,
// gestión manual) y nuevo Especialista Agenda A1 (clase infrautilizada). Reglas
// y especialista nuevos; no cambian PESOS, umbrales de score ni reglas previas.
export const ALGORITHM_VERSION = '1.1.0';
