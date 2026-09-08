// Qué se archiva de la bandeja al publicar el mensaje del día.
//
// El mensaje del día se elige cada mañana. Cuando el asunto sigue vivo —un bono
// que aún no ha caducado, una socia que sigue sin venir— vuelve a ganar, y la
// clave de dedup del aviso lleva la FECHA, así que cada día dejaba una fila
// nueva. Medido en producción: «A Carmen le caducan 4 sesiones sin usar» doce
// días seguidos (13→28 ago), «Llamaría hoy a Laura» seis, «Elena reserva pero
// no está viniendo» cinco. Con 59 sin leer, el aviso deja de ser un aviso.
//
// La clave por fecha se queda como está —protege «un push al día»— y lo que se
// hace es archivar lo anterior del mismo asunto que siga sin leer.
//
// El criterio vive aquí, separado del `update`, porque cada una de sus cuatro
// condiciones evita un daño distinto y conviene que eso esté fijado por un
// test y no por la memoria de quien lo escribió:
//   · `studioId`   — sin él, un estudio archivaría avisos de otro;
//   · `eventType`  — sin él, se llevaría por delante reservas y cobros;
//   · `sinLeer`    — sin él, borraría de la bandeja lo que ya leyó (su historial);
//   · `asuntoKey`  — sin él, archivaría el mensaje de ayer aunque fuese de otra cosa.

export const EVENTO_MENSAJE_DIA = 'decision.mensaje_dia';

export type CriterioArchivado = {
  studioId: string;
  eventType: string;
  /** Ruta jsonb tal cual la entiende PostgREST. */
  campoAsunto: 'data->>asuntoKey';
  asuntoKey: string;
  /** Ambos van como `IS NULL`: solo lo que sigue vivo en la bandeja. */
  sinLeer: true;
  sinArchivar: true;
};

/**
 * `null` cuando no hay asunto con el que comparar: sin él no se puede saber si
 * lo de ayer era «lo mismo», y archivar a ciegas se llevaría por delante un
 * aviso distinto. Dos filas repetidas molestan; una borrada por error, no se
 * recupera.
 */
export function criterioArchivadoMensajeDia(
  studioId: string,
  asuntoKey: string | null | undefined,
): CriterioArchivado | null {
  if (!asuntoKey) return null;
  return {
    studioId,
    eventType: EVENTO_MENSAJE_DIA,
    campoAsunto: 'data->>asuntoKey',
    asuntoKey,
    sinLeer: true,
    sinArchivar: true,
  };
}
