'use client';

import type { Studio } from '@/lib/types';
import { Toggle } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Las instructoras crean sus clases», en Mi equipo (migr 20260914104856). Lo
// leen el calendario del panel y la agenda de la app del estudio
// (`puedeCrearClasesPropias`, lib/permisos-reglas.ts).
//
// Vivía dentro de las reglas de reserva. Se guarda igual que entonces
// (`instructoras_crean_clases`), pero sola: su barra de guardar manda esa columna
// y ninguna más.

export function formularioInstructoras(s: Studio | null): { instructorasCreanClases: boolean } {
  // Default true = lo de siempre (#550).
  return { instructorasCreanClases: s?.instructorasCreanClases ?? true };
}

export function TarjetaInstructorasCreanClases({ on, onCambiar }: { on: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <TarjetaAjuste id="ajuste-instructoras-crean-clases">
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-[13px] text-foreground">
          Las instructoras pueden crear sus clases
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Desactivado: solo tienen las clases que les asignas, y pueden editar las suyas.
          </span>
        </span>
        <Toggle on={on} onChange={onCambiar} />
      </label>
    </TarjetaAjuste>
  );
}
