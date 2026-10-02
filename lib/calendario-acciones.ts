// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 4, la parte de las 6 acciones que toca
// aforo/avisos y necesita una regla de negocio explícita, no solo un botón.
// Puro: nada de IO, solo decide si una acción es segura y qué texto mostrar
// antes de ejecutarla.
// ─────────────────────────────────────────────────────────────────────────────

import { plazasSobrantesTrasAforo } from './calendar-logic.ts';

// "Ajustar aforo" (desde la franja de decisiones) baja `aforoMaximo` hasta la
// capacidad real de la sala en un solo clic — nunca puede dejar a una clienta
// ya confirmada sin plaza. Reutiliza `plazasSobrantesTrasAforo` (I-2), la
// misma regla que ya protege el formulario de edición manual de sesión.
export function puedeAjustarAforoASalaCapacidad(confirmadas: number, capacidadSala: number): boolean {
  return plazasSobrantesTrasAforo(confirmadas, capacidadSala) === 0;
}

// Texto para el aviso de bloqueo cuando ajustar dejaría gente fuera — no se
// hace automáticamente porque no hay un criterio de "a quién quitar la plaza".
export function motivoAforoBloqueado(confirmadas: number, capacidadSala: number): string {
  const sobran = plazasSobrantesTrasAforo(confirmadas, capacidadSala);
  return sobran === 1
    ? `No se puede: hay 1 clienta confirmada de más para la capacidad de la sala (${capacidadSala}). Resuélvelo a mano primero.`
    : `No se puede: hay ${sobran} clientas confirmadas de más para la capacidad de la sala (${capacidadSala}). Resuélvelo a mano primero.`;
}
