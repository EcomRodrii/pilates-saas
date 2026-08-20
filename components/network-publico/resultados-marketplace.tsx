'use client';

import { MapPin, Loader2 } from 'lucide-react';
import { TarjetaInstructoraPublica } from './tarjeta-instructora';
import { useCercaDeMi, distanciaDePerfil, ordenarPorCercania } from '@/lib/network/use-cerca-de-mi';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';

// Resultados del marketplace público, en un Client Component aparte del
// Server Component de la página (docs/NETWORK-AUDIT-2.md §11) — Google sigue
// viendo la lista completa en el HTML inicial (SSR, sin geolocalización);
// "cerca de mí" es una reordenación que solo ocurre en el navegador, después
// de un clic explícito del usuario (nunca se pide el permiso sola al
// cargar). Nadie desaparece: un perfil cuya ciudad no está en
// lib/network/ciudades-coords.ts se queda al final, no se oculta.
export function ResultadosMarketplace({ perfiles, hayFiltrosActivos }: { perfiles: PerfilNetworkPublico[]; hayFiltrosActivos: boolean }) {
  const { estado, posicion, activar } = useCercaDeMi();

  const resultados = posicion
    ? ordenarPorCercania(perfiles, p => distanciaDePerfil(p.ciudad, posicion))
    : perfiles.map(item => ({ item, distanciaKm: null as number | null }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={activar}
          disabled={estado === 'pidiendo' || estado === 'activo'}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#1A1A1A] disabled:opacity-70"
        >
          {estado === 'pidiendo' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {estado === 'activo' ? 'Ordenado por cercanía' : 'Cerca de mí'}
        </button>
        {estado === 'denegado' && (
          <p className="text-[11px] text-[#8E8E86]">No hemos podido acceder a tu ubicación.</p>
        )}
        {estado === 'no_disponible' && (
          <p className="text-[11px] text-[#8E8E86]">Tu navegador no soporta geolocalización.</p>
        )}
      </div>

      {perfiles.length === 0 ? (
        <div className="rounded-2xl border border-[#E7E7E0] bg-white p-10 text-center">
          <p className="text-[14px] font-medium text-[#1A1A1A]">
            {hayFiltrosActivos
              ? 'Ninguna instructora coincide con estos filtros.'
              : 'Todavía no hay instructoras disponibles en esta zona.'}
          </p>
          <p className="text-[13px] text-[#8E8E86] mt-1.5">
            {hayFiltrosActivos ? 'Prueba a ampliar tu búsqueda.' : 'Sé de las primeras en unirte a Tentare Network.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resultados.map(({ item: perfil, distanciaKm }) => (
            <TarjetaInstructoraPublica key={perfil.id} perfil={perfil} distanciaKm={distanciaKm} />
          ))}
        </div>
      )}
    </div>
  );
}
