// Del catálogo del motor al tipo del diseño. Sin imports ni `@/` (ver push-estado.ts).
//
// Los tipos del diseño NO existen en el backend: lo que hay son CATEGORÍAS por
// rol (`reservas`, `clases`, `pagos`, `marketing`, `mensajeria`) y, dentro de
// cada una, EVENTOS.
//
// ⚠️ Esto miraba primero tres eventos sueltos y para todo lo demás la CATEGORÍA,
// con un valor por defecto por categoría que era la buena noticia. Una alumna
// recibe 21 eventos distintos (`lib/notifications/catalog.ts`, audiencia
// `socia-*`) y solo tres estaban nombrados, así que el resto heredaba la cara
// de otro:
//
//   · La categoría `reservas` caía en 'plaza-liberada' (🎉). Ahí viven, además
//     de la plaza que se libera, «tu reserva se ha cancelado», «no terminaste
//     tu reserva» y «tu plaza fija no se ha podido reservar». En producción hay
//     26 cancelaciones y 12 abandonos entregados a alumnas: confeti encima de
//     las tres malas noticias del grupo.
//   · La categoría `clases` caía en 'recordatorio' (⏰), y ahí vive
//     «se ha cancelado tu clase»: un despertador para avisar de que no hay clase
//     a la que despertarse.
//   · La categoría `pagos` caía en 'bono' (🎟), y ahí viven «no hemos podido
//     cobrarte» y la penalización por no presentarse.
//
// Es el mismo error que el ✓ verde de la hoja de confirmar (#1827): una sola
// cara para mensajes que significan cosas opuestas. Ahora los 21 eventos que
// llegan a una alumna están nombrados uno a uno, y **la categoría solo actúa de
// red de seguridad — hacia 'estudio' (📣), el icono neutro que no miente**.
// Un evento nuevo saldrá neutro hasta que alguien lo añada aquí; antes salía
// celebrándose o metiendo prisa, que es peor que no decir nada.

export type TipoAviso = 'plaza-liberada' | 'recordatorio' | 'bono' | 'estudio' | 'valorar' | 'atencion';

/**
 * Los 21 eventos con audiencia `socia-*` del catálogo, uno a uno.
 *
 * `atencion` (⚠️) agrupa lo que salió mal o le cuesta dinero. No es un tipo
 * inventado por gusto: sin él, la única alternativa honesta para una
 * cancelación era el 📣 neutro, y «se ha cancelado tu clase» merece leerse como
 * lo que es, no como un anuncio del estudio.
 */
const POR_EVENTO: Record<string, TipoAviso> = {
  // Buenas noticias de verdad.
  'reserva.plaza_liberada': 'plaza-liberada',
  'reserva.oferta_lista_espera': 'plaza-liberada',
  'reserva.confirmada': 'plaza-liberada',
  'recuperacion.otorgada': 'plaza-liberada',

  // Tu clase se acerca.
  'reserva.recordatorio_24h': 'recordatorio',
  'reserva.recordatorio_1h': 'recordatorio',

  // Bonos y dinero que ha ido bien.
  'bono.por_caducar': 'bono',
  'bono.agotado': 'bono',
  'pago.realizado': 'bono',

  'clase.valorar': 'valorar',

  // Salió mal, o le cuesta dinero.
  'reserva.cancelada': 'atencion',
  'reserva.abandonada': 'atencion',
  'reserva.plaza_fija_no_materializada': 'atencion',
  'clase.cancelada': 'atencion',
  'pago.fallido': 'atencion',
  'pago.devuelto': 'atencion',
  'pago.penalizacion': 'atencion',

  // El estudio le cuenta algo: ni bueno ni malo.
  'reserva.lista_espera': 'estudio',
  'clase.modificada': 'estudio',
  'clase.sustituta': 'estudio',
  'comunidad.post_nuevo': 'estudio',
  'documento_socio.nuevo': 'estudio',
};

/** Los eventos nombrados aquí. Lo usa el guardia de `tipo-aviso.test.ts`. */
export const EVENTOS_DE_ALUMNA: ReadonlySet<string> = new Set(Object.keys(POR_EVENTO));

export function tipoDeAviso(eventType: string | null | undefined, categoria: string | null | undefined): TipoAviso {
  if (eventType && POR_EVENTO[eventType]) return POR_EVENTO[eventType];
  // ⚠️ Red de seguridad, no clasificación: un evento que no esté arriba sale
  // neutro. Que la categoría eligiera una cara concreta es justo lo que ponía
  // confeti sobre una cancelación.
  void categoria;
  return 'estudio';
}
