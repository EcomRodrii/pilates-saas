'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ESPECIALIDAD_LABEL } from '@/lib/network/catalogo';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';

// Mapa real del buscador — F2 de Tentare Network 2.0. Solo pinta perfiles
// que YA tienen lat/lng (la mayoría no las tendrá hasta que el backfill de
// app/api/interno/network/geocodificar-backfill corra en producción), y lo
// dice siempre en voz alta: nunca finge cobertura completa (mismo criterio
// "nunca inventa una posición" que geocodificarDireccion/coordsDeCiudad).
//
// Iconos de Leaflet: la ruta relativa por defecto que usa el paquete
// (`images/marker-icon.png`) no sobrevive el bundling de Next/Turbopack —
// gotcha conocido de react-leaflet. Se apunta al CDN público de unpkg con
// la MISMA versión que package.json, en vez de pelear con el pipeline de
// assets estáticos por tres iconos.
const LEAFLET_CDN = 'https://unpkg.com/leaflet@1.9.4/dist/images';
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
  shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
});

// Centro por defecto: España peninsular, para cuando no hay ningún perfil
// geocodificado que fije los límites del mapa.
const CENTRO_ESPANA: [number, number] = [40.2, -3.7];
const ZOOM_ESPANA = 5;

export function MapaResultadosNetwork({ perfiles }: { perfiles: PerfilNetworkPublico[] }) {
  // Sin guardia de "montado" a propósito: este componente ya se carga con
  // next/dynamic(..., { ssr: false }) desde buscar/page.tsx, así que nunca
  // se ejecuta en el servidor — Leaflet solo toca `window` una vez ya
  // estamos en el navegador.
  const geocodificados = useMemo(
    () => perfiles.filter((p): p is PerfilNetworkPublico & { lat: number; lng: number } => p.lat != null && p.lng != null),
    [perfiles],
  );

  return (
    <div className="h-[520px] rounded-xl overflow-hidden border border-border">
      <MapContainer center={CENTRO_ESPANA} zoom={ZOOM_ESPANA} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geocodificados.map(perfil => (
          <Marker key={perfil.id} position={[perfil.lat, perfil.lng]}>
            <Popup>
              <div className="flex items-center gap-2 min-w-[180px]">
                <ProfileAvatar nombre={perfil.nombre} fotoUrl={perfil.fotoUrl} size="sm" />
                <div className="min-w-0">
                  <Link href={`/network/${perfil.id}`} className="text-[13px] font-semibold text-foreground hover:underline">
                    {perfil.nombre}
                  </Link>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {perfil.especialidades.slice(0, 2).map(e => ESPECIALIDAD_LABEL[e]).join(' · ') || perfil.ciudad}
                  </p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

/**
 * Aviso de cobertura del mapa — honesto siempre, nunca fingiendo cobertura
 * completa. `geocodificadosCount === 0` no oculta el aviso a propósito
 * (el toggle "Mapa" se oculta ANTES de llegar aquí si no hay ninguno, ver
 * app/(dashboard)/network/buscar/page.tsx): este componente puede seguir
 * usándose si algún día se decide mostrar el mapa vacío igualmente.
 */
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
