// Del catálogo del motor al tipo del diseño. Sin imports ni `@/` (ver push-estado.ts).
//
// Los cinco tipos del diseño ('plaza-liberada', 'recordatorio', 'bono',
// 'estudio', 'valorar') NO existen en el backend: lo que hay son CATEGORÍAS por
// rol (`reservas`, `clases`, `pagos`, `marketing`, `mensajeria`) y, dentro de
// cada una, EVENTOS. Se mira primero el evento —«¿qué tal la clase?» va en la
// categoría `reservas` y con solo la categoría saldría con el 🎉 de plaza
// liberada— y después la categoría. Lo que no encaja cae en 'estudio' (📣), el
// icono neutro que no miente.

export type TipoAviso = 'plaza-liberada' | 'recordatorio' | 'bono' | 'estudio' | 'valorar';

const POR_EVENTO: Record<string, TipoAviso> = {
  'clase.valorar': 'valorar',
  'reserva.recordatorio_24h': 'recordatorio',
  'reserva.recordatorio_1h': 'recordatorio',
};

export function tipoDeAviso(eventType: string | null | undefined, categoria: string | null | undefined): TipoAviso {
  if (eventType && POR_EVENTO[eventType]) return POR_EVENTO[eventType];
  switch (categoria) {
    case 'reservas': return 'plaza-liberada';
    case 'clases': return 'recordatorio';
    case 'pagos': return 'bono';
    case 'marketing': return 'estudio';
    case 'mensajeria': return 'estudio';
    default: return 'estudio';
  }
}
