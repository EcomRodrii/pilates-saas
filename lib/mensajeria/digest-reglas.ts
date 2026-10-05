// Reglas puras del resumen diario de mensajes sin leer (`digest.ts`). Aparte
// para poder probarlas con `node --test`, que no carga el motor de avisos.

/**
 * El resumen de EQUIPO lleva siempre su propio sufijo en la clave; el de
 * alumna, la clave de siempre.
 *
 * ⚠️ Siempre, y no «solo si esa cuenta tiene también resumen de alumna en este
 * barrido»: el cron pasa cada 3 h y lo que hay sin leer cambia entre pasadas.
 * Con la condición, a quien es instructora y alumna le llegaba primero el de
 * equipo con la clave sin sufijo, luego el de alumna chocaba con él (y se
 * perdía) y el de equipo volvía a salir con sufijo: dos de equipo y ninguno de
 * alumna el mismo día. El precio de «siempre»: el día que se despliega, quien
 * ya recibió su resumen de equipo con la clave vieja puede recibir uno más.
 */
export function sufijoDedupDelResumen(lado: 'SOCIO' | 'STAFF' | null | undefined): string | null {
  return lado === 'STAFF' ? 'equipo' : null;
}
