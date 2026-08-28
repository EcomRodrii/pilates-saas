import type { Reserva } from '@/lib/types';

/** Fila anónima de aforo tal cual la devuelve /api/public/aforo. */
export type FilaAforo = { id: string; sesion_id: string; estado: string; spot_id: string | null };

/**
 * Mezcla el aforo recién leído con las reservas que ya hay en memoria.
 *
 * ⚠️ ESTA FUNCIÓN ES UN REEMPLAZO PARCIAL, Y ESO ES TODO EL PUNTO.
 *
 * En studio-context, `reservas` se construye ENTERA a partir de `aforoReservas`.
 * El refresco ligero solo trae la ventana de clases próximas
 * (AFORO_VENTANA_DIAS), así que sustituir la lista entera por lo que llega
 * borraría todas las reservas pasadas de la socia — y con ellas su pestaña
 * «Pasadas», Progreso y Retos. Sin ningún error: la pantalla se pinta bien y se
 * vacía sola cinco segundos después.
 *
 * Por eso solo se retiran las filas de las sesiones que la ventana cubre
 * (`sesionIds`) y se deja intacto todo lo demás.
 *
 * El aforo llega anónimo a propósito (así la respuesta es cacheable en CDN y se
 * comparte entre socias), de modo que cada fila se reconstruye PARTIENDO de la
 * que ya había: se conservan `socioId`, `creadoEn` y compañía, y solo se pisa lo
 * que este endpoint sabe de verdad — estado y plaza.
 */
export function fusionarAforo(
  previas: Reserva[],
  sesionIds: string[],
  aforo: FilaAforo[],
  studioId = '',
): Reserva[] {
  const enVentana = new Set(sesionIds);
  const previaPorId = new Map(previas.map(r => [r.id, r]));

  const fuera = previas.filter(r => !enVentana.has(r.sesionId));
  const dentro = aforo.map((r): Reserva => {
    const previa = previaPorId.get(r.id);
    const base: Reserva = previa ?? {
      id: r.id, studioId, sesionId: r.sesion_id, socioId: '',
      estado: r.estado as Reserva['estado'], spotId: null,
      posicionEspera: null, checkInEn: null, creadoEn: '', ofertaExpiraEn: null,
      valoracionExperiencia: null,
    };
    return { ...base, estado: r.estado as Reserva['estado'], spotId: r.spot_id ?? null };
  });

  return [...fuera, ...dentro];
}
