// El número que de verdad decide entre un bono y otro.
//
// La tienda de la alumna puede enseñar cinco productos a la vez —suelta 16 €,
// bono de 4 a 56 €, bono de 8 a 96 €, mensual, trimestral— y la comparación
// que tiene que hacer para elegir es una división de cabeza. El dato ya está
// en `planes_tarifa` (precio y sesiones), así que esto no pide nada nuevo ni
// inventa ninguna oferta: solo escribe la división que la pantalla le estaba
// dejando a ella.
//
// ⚠️ Una SUSCRIPCIÓN no tiene precio por clase. «89 € al mes entre clases
// ilimitadas» no es una división: depende de cuántas vaya, que es justo lo que
// nadie sabe todavía. Un número ahí sería inventado, así que devuelve `null`
// y la tarjeta no escribe nada — mismo criterio que `resumenProducto`, que
// omite lo que no sabe en vez de rellenar.

/**
 * Lo que sale cada clase de un producto con sesiones contadas, o `null`
 * cuando la división no significa nada.
 *
 * `null` en tres casos, y los tres a propósito:
 *  · `sesiones === null` — ilimitado: no hay entre cuánto dividir.
 *  · `sesiones <= 1` — una clase suelta YA es su precio por clase; repetirlo
 *    debajo del importe es ruido, no ayuda.
 *  · precio no positivo — un producto gratuito o mal configurado; «0 €/clase»
 *    se lee como una promesa.
 */
export function precioPorSesion(precio: number, sesiones: number | null): number | null {
  if (sesiones === null || !Number.isFinite(sesiones) || sesiones <= 1) return null;
  if (!Number.isFinite(precio) || precio <= 0) return null;
  return precio / sesiones;
}
