import Link from 'next/link';
import { Heart } from 'lucide-react';
import { NW_BORDE, NW_MUTED, NW_MUTED_2, NW_SAND, NW_TINTA, NW_PRODUCTO } from './tokens';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';

// Tarjeta horizontal de vacante — "Oportunidades para ti" (Inicio, mockup
// 2026-09) y reutilizable tal cual cuando /network/oportunidades gane su
// propio rediseño de grid en una fase futura. Sin foto de estudio propia
// (`red_vacantes` no guarda ninguna) — franja de color en vez de una imagen
// inventada, mismo criterio que "nunca fabricar un dato que no existe".
export function TarjetaVacanteHorizontal({ vacante }: { vacante: VacanteNetwork }) {
  return (
    <Link
      href={`/network/oportunidades/${vacante.id}`}
      className="flex items-stretch gap-3.5 p-3.5 rounded-2xl bg-white hover:opacity-90 transition-opacity"
      style={{ border: `1px solid ${NW_BORDE}` }}
    >
      <div className="w-3 rounded-xl shrink-0" style={{ background: NW_SAND }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13.5px] font-bold truncate" style={{ color: NW_TINTA }}>{vacante.titulo}</p>
          <Heart size={15} style={{ color: NW_MUTED_2 }} className="shrink-0 mt-0.5" />
        </div>
        <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED_2 }}>
          {vacante.estudioNombre}{vacante.estudioCiudad ? ` · ${vacante.estudioCiudad}` : ''}
        </p>
        <p className="text-[12px] mt-1" style={{ color: NW_MUTED }}>
          {TIPO_TRABAJO_LABEL[vacante.tipoTrabajo]} · {TARIFA_RANGO_LABEL[vacante.tarifaRango]}
        </p>
      </div>
      <span
        className="shrink-0 self-center px-3.5 py-1.5 rounded-full text-[12px] font-bold text-white whitespace-nowrap"
        style={{ background: NW_PRODUCTO }}
      >
        Me interesa
      </span>
    </Link>
  );
}
