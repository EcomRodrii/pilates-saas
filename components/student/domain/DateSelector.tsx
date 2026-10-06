'use client';
import type { ReactNode } from 'react';
import { addDias, etiquetaDia, fechaCorta, hoyISO } from '@/lib/student/formato';
import { marcaDeMes } from '@/lib/student/horario-dias';
import { vibrar } from '@/lib/nativo/puente';

const SEMANA = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DIA_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * ⚠️ Sin `aria-pressed`: el paquete lo pone junto a `aria-selected` sobre un
 * `role="tab"`, y ese rol no lo admite — un lector de pantalla anuncia dos
 * estados a la vez. `aria-selected` es el correcto para una pestaña.
 *
 * Pills de día (kit): activa en tinta invertida. Scroll horizontal sin barra.
 *
 * `formato="semana"` (el horario de la alumna, P13): «LUN / 6» («Hoy» en lugar del día), el mes solo en el primer día y
 * en cada día 1 («1 nov»: una tira que cruza de mes no engaña), un punto en los días con reserva suya (`marcados`, y lo
 * dice su nombre accesible: «con reserva») y los días sin clases apagados y sin poder elegirse (`habilitados`; hoy y el
 * elegido, siempre). `final` va después de la tira, en el mismo carril que se desliza, pero FUERA del `tablist`: un
 * enlace no es una pestaña. Sin estas props, todo como siempre (la agenda de la instructora no cambia).
 */
export function DateSelector({ value, onChange, dias = 7, formato, marcados, habilitados, final }: {
  value: string; onChange: (iso: string) => void; dias?: number;
  formato?: 'semana';
  /** Días con una reserva suya (un punto). */
  marcados?: Set<string>;
  /** Días que se pueden elegir (los que tienen clases). Ausente = todos. Hoy y el elegido lo están siempre. */
  habilitados?: Set<string>;
  final?: ReactNode;
}) {
  const h = hoyISO();
  const tira = Array.from({ length: dias }).map((_, i) => addDias(h, i));
  if (formato !== 'semana') {
    return (
      <div role="tablist" aria-label="Día" className="no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '0 var(--px)' }}>
        {tira.map((iso) => (
          <button key={iso} role="tab" type="button" className="day" aria-selected={iso === value} onClick={() => { if (iso !== value) void vibrar('suave'); onChange(iso); }}>{etiquetaDia(iso)}<small>{fechaCorta(iso).slice(4)}</small></button>
        ))}
      </div>
    );
  }
  return (
    <div className="no-scrollbar" style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', padding: '0 var(--px)' }}>
      <div role="tablist" aria-label="Día" style={{ display: 'flex', gap: 6 }}>
        {tira.map((iso, i) => {
          const d = new Date(`${iso}T12:00:00Z`);
          const numero = d.getUTCDate();
          const esHoy = iso === h;
          const elegido = iso === value;
          const conReserva = marcados?.has(iso) ?? false;
          const activo = !habilitados || habilitados.has(iso) || esHoy || elegido;
          const mes = i === 0 || numero === 1 ? marcaDeMes(iso).split(' ')[1] : null;
          const nombre = `${esHoy ? 'Hoy' : DIA_LARGO[d.getUTCDay()]} ${numero}${mes ? ` de ${mes}` : ''}${conReserva ? ', con reserva' : ''}${activo ? '' : ', sin clases'}`;
          return (
            <button
              key={iso} role="tab" type="button" className="day day--semana"
              aria-selected={elegido} aria-disabled={activo ? undefined : true} aria-label={nombre}
              data-con-reserva={conReserva ? '' : undefined}
              onClick={() => {
                if (!activo) return;
                if (!elegido) void vibrar('suave');
                onChange(iso);
              }}
            >
              <span className="day__semana">{esHoy ? 'Hoy' : SEMANA[d.getUTCDay()]}</span>
              <span className="day__numero t-num">{numero}</span>
              <span className="day__pie" aria-hidden>{mes}{conReserva && <i className="day__punto" />}</span>
            </button>
          );
        })}
      </div>
      {final}
    </div>
  );
}
