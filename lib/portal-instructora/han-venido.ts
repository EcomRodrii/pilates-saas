// ¿Qué alumnas han venido alguna vez a una clase del estudio? Lo pinta la lista
// «Tus alumnas» como «primera clase» (15-sep-2026).
//
// Antes era una consulta POR ALUMNA, de 10 en 10: con 150 alumnas, 15 viajes en
// serie antes de pintar la lista. Ahora una consulta por trozo de alumnas.
//
// ⚠️ PostgREST corta en 1000 filas, y aquí vuelve UNA FILA POR CLASE ASISTIDA, no
// por alumna: un trozo de alumnas habituales puede llenarse. Si vuelve lleno, las
// que no han salido se comprueban una a una. Nunca se da por «primera clase» a
// quien solo faltaba por el corte.
//
// Sin imports: las consultas entran por parámetro para poder probarlo con el
// runner de Node.

export const TROZO_ALUMNAS = 50;
export const LIMITE_FILAS = 1000;
const TROZO_UNA_A_UNA = 10;

export async function sociasQueHanVenido(
  ids: readonly string[],
  /** `socio_id` de sus reservas ASISTIDA, pidiendo como mucho `limite` filas. */
  consultarTrozo: (ids: string[]) => Promise<string[]>,
  consultarUna: (id: string) => Promise<boolean>,
  opciones: { trozo?: number; limite?: number } = {},
): Promise<Set<string>> {
  const { trozo = TROZO_ALUMNAS, limite = LIMITE_FILAS } = opciones;
  const vinieron = new Set<string>();
  for (let i = 0; i < ids.length; i += trozo) {
    const parte = ids.slice(i, i + trozo);
    const filas = await consultarTrozo(parte);
    for (const id of filas) vinieron.add(id);
    if (filas.length < limite) continue;

    // Respuesta llena: puede haberse cortado. De 10 en 10, como antes.
    const dudosas = parte.filter((id) => !vinieron.has(id));
    for (let j = 0; j < dudosas.length; j += TROZO_UNA_A_UNA) {
      const grupo = dudosas.slice(j, j + TROZO_UNA_A_UNA);
      const vino = await Promise.all(grupo.map((id) => consultarUna(id)));
      grupo.forEach((id, k) => { if (vino[k]) vinieron.add(id); });
    }
  }
  return vinieron;
}
