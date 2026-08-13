// Las dos conversiones entre una fecha guardada (ISO) y el `<input
// type="datetime-local">` del diálogo de publicación.
//
// ⚠️ Están aquí, y no dentro del componente, porque una de ellas reventó en
// producción: `guardar()` hacía `new Date(fecha).toISOString()` sobre el valor
// crudo del input y, con el campo vacío, lanzaba `RangeError: Invalid time
// value` sin capturar. El botón se quedaba muerto —cuatro clics seguidos, cero
// publicaciones guardadas— y la propietaria no veía ningún motivo.
//
// Y no era un descuido suelto: la conversión de IDA tenía el mismo agujero por
// el otro lado. Con una fecha inválida, `new Date(x).getFullYear()` es `NaN` y
// la plantilla devolvía la cadena `"NaN-NaN-NaNTNaN:NaN"`, que el input
// RECHAZA y deja en blanco. Es decir: una publicación con la fecha estropeada
// se abría con el campo vacío y al guardar tumbaba la pantalla. Las dos mitades
// del mismo viaje, cada una fallando en silencio.

/** `true` si esta fecha se puede usar sin que nada reviente. */
export function fechaValida(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * ISO → el valor que entiende `<input type="datetime-local">`, en hora LOCAL.
 *
 * Sin sufijo de zona a propósito: el input trabaja en la hora de pared de quien
 * mira, y `desdeInputLocal` deshace exactamente esto.
 *
 * Devuelve `''` si la fecha no vale — un campo vacío es un problema visible y
 * arreglable; `"NaN-NaN-NaN"` es un campo vacío que además nadie sabe explicar.
 */
export function aInputLocal(iso: string | null | undefined): string {
  const d = new Date(iso ?? '');
  if (!fechaValida(d)) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * El valor del input → ISO, o `null` si no hay fecha utilizable.
 *
 * ⚠️ `null` y no una excepción, y tampoco «hoy» por defecto: quien llama tiene
 * que decidir qué hacer sin fecha. Rellenarla sola programaría la publicación
 * en un momento que la propietaria no eligió, que es peor que no guardarla.
 */
export function desdeInputLocal(valor: string): string | null {
  const d = new Date(valor);
  return fechaValida(d) ? d.toISOString() : null;
}
