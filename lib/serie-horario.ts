// Reconstrucción de la hora de una serie recurrente (I-3), anclada a la zona del
// estudio (Europe/Madrid).
//
// Es el ESPEJO en TypeScript de lo que hace la RPC `editar_serie_desde` en SQL
// (`... AT TIME ZONE 'Europe/Madrid'`, migración 0114). La RPC es la autoridad —lo
// escribe todo-o-nada en una transacción—; esto calcula lo mismo para el pintado
// optimista, de modo que lo que se ve en el calendario coincide con lo que la base
// de datos acaba guardando, incluido el cambio de horario de verano. El test
// (serie-horario.test.ts) fija esa equivalencia.
//
// Antes esto se hacía con `new Date('YYYY-MM-DDTHH:MM:00')`, que interpreta la
// cadena en la zona DEL NAVEGADOR: si la dueña editaba desde otro país, la hora
// pintada no era la del estudio. Igual que ya se hizo con los avisos (TZ_ESTUDIO
// en utils), aquí se ancla Madrid.

import { fechaLocalDe, horaParedAInstante } from './citas/slots.ts';

// La zona del estudio. Constante en todo el sistema (utils.TZ_ESTUDIO,
// citas.TZ_CITAS, migraciones 0084/0100/0109): España peninsular.
const TZ_ESTUDIO = 'Europe/Madrid';

/**
 * Nuevo inicio/fin (ISO/UTC) de una sesión manteniendo su FECHA local (Madrid) y
 * cambiando solo la hora de pared. `horaInicio`/`horaFin` en formato 'HH:MM'.
 *
 * La fecha local se toma de `inicioISO` en Europe/Madrid — no de su día UTC, que
 * en la banda ~22:00–00:00 es el anterior (el bug que arregló 0100).
 */
export function horarioConNuevaHora(
  inicioISO: string,
  horaInicio: string,
  horaFin: string,
): { inicio: string; fin: string } {
  const dia = fechaLocalDe(new Date(inicioISO), TZ_ESTUDIO); // 'YYYY-MM-DD' en Madrid
  return {
    inicio: horaParedAInstante(dia, horaInicio, TZ_ESTUDIO).toISOString(),
    fin: horaParedAInstante(dia, horaFin, TZ_ESTUDIO).toISOString(),
  };
}
