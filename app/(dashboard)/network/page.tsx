'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, SlidersHorizontal, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { FiltrosBusquedaNetwork } from '@/components/network/filtros-busqueda';
import { TarjetaResultadoNetwork } from '@/components/network/tarjeta-resultado';
import { buscarPerfilesNetwork } from '@/lib/api-client';
import type { FiltroBusquedaNetwork, PerfilNetworkPublico } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

const FILTRO_VACIO: FiltroBusquedaNetwork = {
  ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null,
};

// Buscador de profesionales — docs/NETWORK-IMPLEMENTATION-PLAN.md Fases 4/5
// fusionadas: el backend ya soporta todos los filtros a la vez (mismo coste
// que construirlos por separado), así que no tenía sentido enviar primero
// una pantalla con solo ciudad+especialidad y volver en el turno siguiente
// a añadir el resto — el usuario habría visto la misma pantalla dos veces.
export default function NetworkBuscadorPage() {
  const [filtro, setFiltro] = useState<FiltroBusquedaNetwork>(FILTRO_VACIO);
  const [resultados, setResultados] = useState<PerfilNetworkPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Debounce corto: el texto de ciudad dispara una búsqueda por cada
    // pulsación si no se retrasa — los chips no lo necesitan (un clic, un
    // cambio), pero comparten el mismo efecto por simplicidad. `setCargando`
    // va DENTRO del timeout (no en el cuerpo del efecto) — regla de
    // react-hooks/set-state-in-effect: un setState síncrono en el cuerpo
    // encadena renders.
    const t = setTimeout(() => {
      setCargando(true);
      buscarPerfilesNetwork(filtro).then(r => { if (vivo) { setResultados(r); setCargando(false); } });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [filtro]);

  const hayFiltrosActivos = Boolean(
    filtro.ciudad || filtro.especialidades.length || filtro.disponibilidad.length
    || filtro.horarios.length || filtro.tipoTrabajo.length || filtro.experienciaMinima != null,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="Tentare Network"
          description="Encuentra profesionales de Pilates disponibles para tu estudio."
        />
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/network/solicitudes"
            className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            Solicitudes
          </Link>
          <Link
            href="/network/mi-perfil"
            className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
          >
            Tu perfil <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="md:hidden">
        <button
          onClick={() => setFiltrosAbiertos(true)}
          className="w-full px-4 py-2.5 rounded-lg bg-card border border-border text-[13px] font-medium text-foreground flex items-center justify-center gap-2"
        >
          <SlidersHorizontal size={14} />
          Filtros{hayFiltrosActivos ? ' (activos)' : ''}
        </button>
      </div>

      <div className="flex gap-6">
        <aside className={`${cardCls} p-5 w-64 shrink-0 hidden md:block self-start`}>
          <FiltrosBusquedaNetwork filtro={filtro} onChange={setFiltro} />
        </aside>

        <div className="flex-1 min-w-0 space-y-2.5">
          {cargando ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : resultados.length === 0 ? (
            <div className={`${cardCls} p-8 text-center`}>
              <p className="text-[13px] text-muted-foreground">
                {hayFiltrosActivos
                  ? 'Ninguna profesional coincide con estos filtros.'
                  : 'Todavía no hay profesionales publicadas en tu zona.'}
              </p>
            </div>
          ) : (
            resultados.map(perfil => <TarjetaResultadoNetwork key={perfil.id} perfil={perfil} />)
          )}
        </div>
      </div>

      <DashboardSheet
        open={filtrosAbiertos}
        onClose={() => setFiltrosAbiertos(false)}
        label="Filtros de búsqueda"
        sheetClassName="bg-card rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[14px] font-semibold text-foreground">Filtros</h3>
            <button
              onClick={() => setFiltrosAbiertos(false)}
              className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium"
            >
              Ver {resultados.length} resultado{resultados.length === 1 ? '' : 's'}
            </button>
          </div>
          <FiltrosBusquedaNetwork filtro={filtro} onChange={setFiltro} />
        </div>
      </DashboardSheet>
    </div>
  );
}
