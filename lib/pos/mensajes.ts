// Lo que dice la Caja cuando el servidor no ha podido LEER algo (la caja, su
// saldo, el catálogo). Un fallo se ve como fallo, nunca como una cifra («caja
// cerrada», «0 € esperados», «Hoy 0,00 €»).
//
// ⚠️ Nunca «no se ha cobrado nada»: esta lectura se repite justo después de
// vender o de apuntar un movimiento de caja, y con esa frase quien cobra
// repetiría la acción (revisión de tentare-stripe, #2734).
export const NO_SE_PUDO_LEER_LA_CAJA =
  'No hemos podido leer la Caja ahora mismo. Esta lectura no cobra ni cambia nada, y lo que ya hayas hecho sigue hecho: vuelve a intentarlo en un momento.';
