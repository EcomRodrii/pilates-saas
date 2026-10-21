'use client';

// La zona horaria, a la vista y sin selector (decisión del fundador, 21-oct-2026).
// Todo se calcula en hora de Madrid (`TZ_ESTUDIO`, lib/utils.ts) y ningún
// estudio usa otra: ofrecer cambiarla sería prometer algo que no funciona. Con
// un código postal de Canarias (35 y 38) se dice lo que pasa allí.
//
// La enseñan el paso «Tu estudio» del alta nueva y «Nombre y dirección» de
// Configuración: el mismo texto en los dos sitios.

import { AlertTriangle, Clock } from 'lucide-react';
import { esCanarias } from '@/lib/geo/provincias';
import { cn } from '@/lib/utils';

export const AVISO_CANARIAS =
  'Tentare trabaja hoy en hora peninsular: en Canarias, los recordatorios y los cierres de reserva irían una hora antes. Escríbenos antes de abrir reservas.';

/** Solo el aviso, para quien pinta la zona por su cuenta. `null` fuera de Canarias. */
export function AvisoCanarias({ codigoPostal, className }: { codigoPostal: string; className?: string }) {
  if (!esCanarias(codigoPostal)) return null;
  return (
    <div role="note" data-testid="aviso-canarias" className={cn('flex gap-2.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3', className)}>
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden />
      <p className="text-[13px] leading-relaxed text-foreground text-pretty">{AVISO_CANARIAS}</p>
    </div>
  );
}

export function ZonaHorariaFija({ codigoPostal, className, conAviso = true }: {
  codigoPostal: string;
  className?: string;
  /** `false` si el aviso de Canarias ya se pinta en otro sitio de la pantalla. */
  conAviso?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-3.5 py-3" data-testid="zona-horaria-fija">
        <Clock size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-5 text-foreground">Zona horaria: Madrid (peninsular)</p>
          <p className="text-[13px] leading-[18px] text-muted-foreground">La usan tu calendario, los recordatorios y los cierres de reserva.</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">De serie</span>
      </div>
      {conAviso && <AvisoCanarias codigoPostal={codigoPostal} />}
    </div>
  );
}
