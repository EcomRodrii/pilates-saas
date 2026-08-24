'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { SlidersHorizontal, Loader2, MapPin, Scale, X, List, Map as MapIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { FiltrosBusquedaNetwork } from '@/components/network/filtros-busqueda';
import { TarjetaResultadoNetwork } from '@/components/network/tarjeta-resultado';
import { AvisoCoberturaMapa } from '@/components/network/mapa-resultados';
import { buscarPerfilesNetwork } from '@/lib/api-client';
import { useCercaDeMi, distanciaDePerfil, ordenarPorCercania } from '@/lib/network/use-cerca-de-mi';
import { encajeBusquedaDe } from '@/lib/network/encaje-busqueda';
import type { FiltroBusquedaNetwork, OrdenarPorNetwork, PerfilNetworkPublico } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { EmptyState } from '@/components/ui/empty-state';

const FILTRO_VACIO: FiltroBusquedaNetwork = {
  ciudad: null, especialidades: [], disponibilidad: [], horarios: [], tipoTrabajo: [], experienciaMinima: null, tarifaRango: [], soloIdentidadVerificada: false, soloExperienciaVerificada: false, soloCertificacionVerificada: false, valoracionMinima: null, idioma: null,
};

const OPCIONES_ORDEN: Array<{ valor: OrdenarPorNetwork; etiqueta: string }> = [
  { valor: 'relevancia', etiqueta: 'Relevancia' },
  { valor: 'precio', etiqueta: 'Precio (más barato)' },
  { valor: 'valoracion', etiqueta: 'Mejor valoradas' },
  { valor: 'cercania', etiqueta: 'Cercanía' },
];

// Tercera pieza de F2 (comparación) — tope confirmado con el fundador.
const MAX_COMPARAR = 3;

// Mapa real del buscador (F2, cuarta pieza) — leaflet toca `window` en
// import, así que va sin SSR (mismo motivo que cualquier librería de mapas
// en Next: el HTML inicial no tiene navegador detrás).
const MapaResultadosNetwork = dynamic(
  () => import('@/components/network/mapa-resultados').then(m => m.MapaResultadosNetwork),
  { ssr: false, loading: () => <div className="h-[520px] rounded-xl bg-muted animate-pulse" /> },
);

// Buscador de profesionales — docs/NETWORK-IMPLEMENTATION-PLAN.md Fases 4/5
// fusionadas: el backend ya soporta todos los filtros a la vez (mismo coste
// que construirlos por separado), así que no tenía sentido enviar primero
// una pantalla con solo ciudad+especialidad y volver en el turno siguiente
// a añadir el resto — el usuario habría visto la misma pantalla dos veces.
export default function NetworkBuscadorPage() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroBusquedaNetwork>(FILTRO_VACIO);
  const [resultados, setResultados] = useState<PerfilNetworkPublico[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  // Comparación de 2-3 perfiles: el estado vive AQUÍ (no en la tarjeta) para
  // que la barra flotante y el checkbox de cada tarjeta compartan la misma
  // fuente de verdad, sin duplicarlo.
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  // Mapa real (F2): toggle Lista/Mapa. Solo tiene sentido enseñarlo si hay
  // AL MENOS un resultado geocodificado — antes del backfill en producción
  // eso puede ser ninguno, y un botón "Mapa" que lleva a un mapa vacío es
  // peor que no ofrecerlo (mismo criterio "honesto, nunca cobertura
  // fingida" del resto de esta pieza).
  const [vistaElegida, setVistaElegida] = useState<'lista' | 'mapa'>('lista');
  const hayGeocodificados = resultados.some(p => p.lat != null && p.lng != null);
  // Derivado, no sincronizado con un efecto (mismo criterio que
  // ordenarPorEfectivo más abajo): si la búsqueda cambia y deja de haber
  // ningún resultado geocodificado, la vista "Mapa" deja de tener sentido
  // sin que haga falta un setState encadenado.
  const vista: 'lista' | 'mapa' = hayGeocodificados ? vistaElegida : 'lista';
  function alternarSeleccion(id: string) {
    setSeleccionados(prev => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else if (siguiente.size < MAX_COMPARAR) siguiente.add(id);
      return siguiente;
    });
  }
  const { estado: estadoCercaDeMi, posicion, activar: activarCercaDeMi } = useCercaDeMi();
  // `null` = "sin elección manual", no un valor de orden real. Se deriva el
  // orden EFECTIVO más abajo en vez de sincronizar un `setFiltro` desde un
  // efecto que observa `estadoCercaDeMi` (encadenaría renders, regla
  // react-hooks/set-state-in-effect) — así "Cerca de mí" sigue ordenando por
  // cercanía en cuanto hay posición, sin que haga falta un segundo clic en
  // el selector, y basta con elegir a mano para dejar de seguir ese default.
  const [ordenarPorElegido, setOrdenarPorElegido] = useState<OrdenarPorNetwork | null>(null);
  const ordenarPorEfectivo: OrdenarPorNetwork = ordenarPorElegido ?? (posicion ? 'cercania' : 'relevancia');

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
      buscarPerfilesNetwork({ ...filtro, ordenarPor: ordenarPorEfectivo }).then(r => { if (vivo) { setResultados(r); setCargando(false); } });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [filtro, ordenarPorEfectivo]);

  const hayFiltrosActivos = Boolean(
    filtro.ciudad || filtro.especialidades.length || filtro.disponibilidad.length
    || filtro.horarios.length || filtro.tipoTrabajo.length || filtro.experienciaMinima != null,
  );

  // La cercanía solo se reordena aquí, en el cliente — el servidor ya
  // devuelve `resultados` en el orden pedido para 'relevancia'/'precio'/
  // 'valoracion' (lib/network/ranking.ts), y 'cercania' cae ahí también
  // porque el servidor no conoce la posición del navegador. La distancia se
  // sigue mostrando en la tarjeta aunque no se esté ordenando por ella
  // (p.ej. "Cerca de mí" activo pero orden por precio elegido a mano).
  const resultadosOrdenados = posicion
    ? ordenarPorEfectivo === 'cercania'
      ? ordenarPorCercania(resultados, p => distanciaDePerfil(p.ciudad, posicion))
      : resultados.map(item => ({ item, distanciaKm: distanciaDePerfil(item.ciudad, posicion) }))
    : resultados.map(item => ({ item, distanciaKm: null as number | null }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buscar instructoras"
        description="Encuentra profesionales de Pilates y Yoga de Tentare Network disponibles para tu estudio."
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="md:hidden flex-1">
          <button
            onClick={() => setFiltrosAbiertos(true)}
            className="w-full px-4 py-2.5 rounded-lg bg-card border border-border text-[13px] font-medium text-foreground flex items-center justify-center gap-2"
          >
            <SlidersHorizontal size={14} />
            Filtros{hayFiltrosActivos ? ' (activos)' : ''}
          </button>
        </div>
        <button
          onClick={activarCercaDeMi}
          disabled={estadoCercaDeMi === 'pidiendo' || estadoCercaDeMi === 'activo'}
          className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors flex items-center gap-1.5 disabled:opacity-70"
        >
          {estadoCercaDeMi === 'pidiendo' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {estadoCercaDeMi === 'activo' ? 'Ordenado por cercanía' : 'Cerca de mí'}
        </button>
        {estadoCercaDeMi === 'denegado' && (
          <p className="text-[11px] text-muted-foreground">No hemos podido acceder a tu ubicación.</p>
        )}
        {hayGeocodificados && (
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-[12px] font-medium">
            <button
              onClick={() => setVistaElegida('lista')}
              className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${vista === 'lista' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setVistaElegida('mapa')}
              className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors ${vista === 'mapa' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <MapIcon size={13} /> Mapa
            </button>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground ml-auto">
          Ordenar por
          <select
            value={ordenarPorEfectivo}
            onChange={e => setOrdenarPorElegido(e.target.value as OrdenarPorNetwork)}
            className="px-2.5 py-2 rounded-lg bg-card border border-border text-[12px] font-medium text-foreground"
          >
            {OPCIONES_ORDEN.map(o => (
              // Sin posición conocida, "Cercanía" no significa nada — se
              // deshabilita en vez de ocultarse para que la propietaria
              // entienda por qué (activa "Cerca de mí" primero), no
              // desaparezca sin explicación.
              <option key={o.valor} value={o.valor} disabled={o.valor === 'cercania' && !posicion}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
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
            <div className={cardCls}>
              <EmptyState
                compacto
                titulo={hayFiltrosActivos
                  ? 'Ninguna profesional coincide con estos filtros.'
                  : 'Todavía no hay profesionales publicadas en tu zona.'}
              />
            </div>
          ) : vista === 'mapa' ? (
            <>
              <AvisoCoberturaMapa perfiles={resultados} />
              <MapaResultadosNetwork perfiles={resultados} />
            </>
          ) : (
            resultadosOrdenados.map(({ item: perfil, distanciaKm }) => (
              <TarjetaResultadoNetwork
                key={perfil.id}
                perfil={perfil}
                distanciaKm={distanciaKm}
                encaje={encajeBusquedaDe(filtro, perfil)}
                comparando={{
                  seleccionado: seleccionados.has(perfil.id),
                  deshabilitado: !seleccionados.has(perfil.id) && seleccionados.size >= MAX_COMPARAR,
                  onToggle: alternarSeleccion,
                }}
              />
            ))
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

      {seleccionados.size >= 2 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border shadow-2xl">
          <p className="text-[12.5px] font-medium text-foreground">
            {seleccionados.size} de {MAX_COMPARAR} seleccionadas para comparar
          </p>
          <button
            onClick={() => router.push(`/network/comparar?ids=${[...seleccionados].map(encodeURIComponent).join(',')}`)}
            className="px-3.5 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 hover:brightness-95 transition-colors"
          >
            <Scale size={14} /> Comparar ({seleccionados.size})
          </button>
          <button
            onClick={() => setSeleccionados(new Set())}
            title="Cancelar comparación"
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
