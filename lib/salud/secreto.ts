// Comparación del secreto de sondeo. En módulo aparte —y no como una función
// suelta dentro del route— para que se pueda probar: una comparación de
// credenciales que nadie ha ejercitado nunca es justo el sitio donde un `>=` en
// vez de un `===`, o un early-return mal puesto, pasa desapercibido para
// siempre.
//
// Tiempo constante: el endpoint es sondeable desde fuera y el secreto viaja en
// una cabecera. Comparar con `!==` filtra por temporización cuántos caracteres
// iniciales se acertaron. El coste de hacerlo bien aquí es nulo.
export function secretoValido(cabecera: string | null, secreto: string): boolean {
  // Un secreto vacío no autoriza a nadie: si no, no configurar CRON_SECRET
  // dejaría el endpoint abierto a cualquiera que mandase "Bearer ".
  if (!secreto) return false;
  const esperado = `Bearer ${secreto}`;
  // La longitud sí se filtra (es inevitable comparando strings de largo
  // distinto), pero no revela el contenido.
  if (!cabecera || cabecera.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) {
    dif |= cabecera.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return dif === 0;
}
