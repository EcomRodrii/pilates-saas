'use client';

import { MapPin } from 'lucide-react';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';

// ⚠️ 62ª pasada de auditoría: este aviso vivía en `mapa-resultados.tsx`, junto al
// mapa. Como `buscar/page.tsx` lo importa de forma ESTÁTICA, ese import arrastraba
// al grafo `react-leaflet` + `leaflet` + su CSS, y el `next/dynamic({ ssr: false })`
// con el que se carga el mapa no ahorraba nada: medido sobre `next build`, el chunk
// de leaflet (152 KB) aparecía referenciado en el HTML inicial de /network/buscar.
// El aviso no usa nada de leaflet —solo cuenta cuántos perfiles traen lat/lng—, así
// que separarlo deja el mapa realmente diferido sin tocar su comportamiento.
export function AvisoCoberturaMapa({ perfiles }: { perfiles: PerfilNetworkPublico[] }) {
  const total = perfiles.length;
  const geocodificados = perfiles.filter(p => p.lat != null && p.lng != null).length;
  if (total === 0 || geocodificados === total) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground px-1">
      <MapPin size={12} className="shrink-0" />
      {geocodificados} de {total} profesionales tienen ubicación en el mapa.
    </p>
  );
}
