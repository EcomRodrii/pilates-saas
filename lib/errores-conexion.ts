// ¿Este error es de CONEXIÓN con la base de datos (no llega, o se corta), y no de una consulta mal hecha o de un dato raro?
// Puro, sin `@/`: lo usan las comprobaciones de salud y los barridos de los crons.
//
// Por qué existe: el 20-nov-2026 la base de datos de producción estuvo pausada y CADA comprobación y CADA barrido mandó su propio
// aviso a Sentry («[salud] …», «[penalizaciones] barrido …», «fetchAllRows …»…): una docena de incidencias distintas, cada una
// con su `TypeError: fetch failed`, que parecían errores de lógica y escondían que la causa era una sola. Una caída de conexión
// se manda como UN aviso con un mensaje estable (`MENSAJE_BD_NO_ACCESIBLE`), y el detalle de qué comprobación lo vio va en `extra`.
//
// ⚠️ No es un silenciador: sigue siendo un error de nivel `error`. Solo agrupa. Un timeout de una consulta (Postgres:
// «canceling statement due to statement timeout») NO cuenta: ese sí es un problema de la consulta.

export const MENSAJE_BD_NO_ACCESIBLE = '[infra] base de datos no accesible';

const PATRONES_DE_CONEXION = [
  /fetch failed/i,
  /network error/i,
  /failed to fetch/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE/i,
  /socket hang up/i,
  /UND_ERR_/i,
  /database is possibly not accessible/i,
  /project is (paused|inactive)/i,
];

export function esFalloDeConexion(mensaje: string | null | undefined): boolean {
  if (!mensaje) return false;
  return PATRONES_DE_CONEXION.some((p) => p.test(mensaje));
}
