// Un <select> controlado cuyo valor ya no está entre sus opciones ENSEÑA la primera, pero el estado
// conserva el id viejo (o ''). Para lo que se envía a la base de datos, la opción elegida es la que
// existe AHORA: la de antes si sigue ahí; si no, la primera; y '' solo si no hay ninguna.
// Sin imports a propósito (corre bajo `node --test`).
export function opcionVigente(idElegido: string, opciones: readonly { id: string }[]): string {
  return opciones.some(o => o.id === idElegido) ? idElegido : (opciones[0]?.id ?? '');
}
