// Qué se le dice a la alumna al terminar de cancelar una clase, según lo que
// contestó el SERVIDOR (no lo que calculó el aviso previo: la ventana real puede
// diferir, con la del tipo de clase por encima de la del estudio).
//
// Lo comparten «Mis clases» y la tarjeta de su clase fija. Antes vivía escrito a
// mano en «Mis clases» y a una clase fija le decía «la sesión no se devuelve»:
// una clase fija no descuenta ninguna sesión, así que no hay nada que devolver, y
// quien la cancelaba creía haber perdido algo. Lógica pura y con tests.

export interface RespuestaCancelar {
  eraConfirmada: boolean;
  recuperacionCreada?: boolean;
  recuperacionCaducaEl?: string | null;
  recuperacionAlCerrarSemana?: boolean;
  bonoDevuelto?: boolean;
}

/** `fechaCorta`: «vie 11 sep». Entra por parámetro para que esto no importe nada. */
export function mensajeTrasCancelar(
  res: RespuestaCancelar,
  opciones: { esClaseFija: boolean; fechaCorta: (iso: string) => string },
): string {
  if (!res.eraConfirmada) return 'Has salido de la lista de espera';
  const hasta = res.recuperacionCaducaEl ? ` hasta el ${opciones.fechaCorta(res.recuperacionCaducaEl)}` : '';
  const prefijo = opciones.esClaseFija ? 'Cancelada solo esta semana' : 'Cancelada';
  if (res.recuperacionCreada) return `${prefijo} · tienes una clase para recuperar${hasta} ✓`;
  if (res.recuperacionAlCerrarSemana) {
    return `${prefijo} · si no usas ese hueco esta semana, al acabarla tendrás una clase para recuperar ✓`;
  }
  // Una clase fija nunca descontó una sesión: no hay nada que devolver ni que
  // perder, y lo que importa saber es que su clase fija sigue.
  if (opciones.esClaseFija) return `${prefijo} · tu clase fija sigue activa ✓`;
  return res.bonoDevuelto ? 'Cancelada · sesión devuelta a tu bono ✓' : 'Cancelada — la sesión no se devuelve';
}
