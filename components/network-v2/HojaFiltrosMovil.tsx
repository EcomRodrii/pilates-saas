'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { FiltrosSidebar } from './FiltrosSidebar';
import { NW_TINTA, NW_BORDE, NW_PRODUCTO } from './tokens';

// Bottom sheet de filtros para móvil (README 1b/1e: "filtros en bottom
// sheet tras botón Filtros") — deliberadamente NO reutiliza
// components/ui/dashboard-sheet.tsx: ese componente vive en el panel
// privado y trae supuestos de ese contexto (DashboardShell), aquí es una
// página pública sin sesión.
export function HojaFiltrosMovil() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="lg:hidden w-full mb-4 flex items-center justify-center gap-2 py-3 text-[13.5px] font-semibold"
        style={{ border: `1px solid ${NW_BORDE}`, borderRadius: 13, color: NW_TINTA, background: '#fff' }}
      >
        <SlidersHorizontal size={14} /> Filtros
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtros">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[26px] bg-[#FAF9F5] p-5 pb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>Filtros</p>
              <button onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={20} color={NW_TINTA} /></button>
            </div>
            <FiltrosSidebar />
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="w-full mt-5 py-3 rounded-full text-[14px] font-bold text-white"
              style={{ background: NW_PRODUCTO }}
            >
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </>
  );
}
