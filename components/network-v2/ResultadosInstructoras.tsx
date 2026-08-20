'use client';

import { MapPin, Loader2 } from 'lucide-react';
import { TarjetaInstructora } from './TarjetaInstructora';
import { useCercaDeMi, distanciaDePerfil, ordenarPorCercania } from '@/lib/network/use-cerca-de-mi';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';
import { NW_TINTA, NW_MUTED_2 } from './tokens';

// Grid de resultados del marketplace rediseñado, con "cerca de mí" (#1047)
// reintegrado — mismo hook y mismas funciones puras que ya usa
// components/network-publico/resultados-marketplace.tsx (lib/network/
// use-cerca-de-mi.ts, sin tocar), solo con la tarjeta y los tokens del
// rediseño en vez de los de esa versión anterior. Client Component aparte
// del Server Component de la página, mismo motivo de siempre: el HTML que
// ve Google no depende de la geolocalización del navegador.
export function ResultadosInstructoras({ perfiles }: { perfiles: PerfilNetworkPublico[] }) {
  const { estado, posicion, activar } = useCercaDeMi();

  const resultados = posicion
    ? ordenarPorCercania(perfiles, p => distanciaDePerfil(p.ciudad, posicion))
    : perfiles.map(item => ({ item, distanciaKm: null as number | null }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={activar}
          disabled={estado === 'pidiendo' || estado === 'activo'}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold disabled:opacity-70"
          style={{ color: NW_TINTA }}
        >
          {estado === 'pidiendo' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {estado === 'activo' ? 'Ordenado por cercanía' : 'Cerca de mí'}
        </button>
        <p className="text-[12.5px] font-medium" style={{ color: NW_MUTED_2 }}>
          {estado === 'denegado' ? 'No hemos podido acceder a tu ubicación.'
            : estado === 'no_disponible' ? 'Tu navegador no soporta geolocalización.'
              : 'Ordenar: Relevancia'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {resultados.map(({ item: perfil, distanciaKm }) => (
          <TarjetaInstructora key={perfil.id} perfil={perfil} distanciaKm={distanciaKm} />
        ))}
      </div>
    </div>
  );
}
