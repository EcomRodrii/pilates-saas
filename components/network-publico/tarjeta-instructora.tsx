import Link from 'next/link';
import { MapPin, BadgeCheck, Star } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ESPECIALIDAD_LABEL, TARIFA_RANGO_LABEL } from '@/lib/network/catalogo';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';

// Card de marketplace, deliberadamente distinta de components/network/
// tarjeta-resultado.tsx (esa es del panel privado de la propietaria — CRUD,
// densa, sin foto grande). Esta es la que ve alguien sin cuenta viniendo de
// Google: foto protagonista, jerarquía visual fuerte, "premium", no una fila
// de tabla. brief punto 10/27.
//
// El rating solo se pinta si resumenResenas.total > 0 — promedio es `null`
// sin reseñas publicadas (lib/network/publico.ts), nunca 0 ni un "4.9 ★"
// inventado. El badge de verificación SÍ es real (experienciaVerificada,
// calculado en lote en el buscador).
const DISPONIBILIDAD_ETIQUETA: Partial<Record<PerfilNetworkPublico['disponibilidadEstado'], string>> = {
  disponible: 'Disponible ahora',
  disponible_sustituciones: 'Disponible para sustituciones',
  buscando_trabajo: 'Buscando trabajo',
};

export function TarjetaInstructoraPublica({ perfil, distanciaKm }: { perfil: PerfilNetworkPublico; distanciaKm?: number | null }) {
  const disponibilidadTexto = DISPONIBILIDAD_ETIQUETA[perfil.disponibilidadEstado];
  return (
    <Link
      href={perfil.slug ? `/network/instructoras/${perfil.slug}` : '#'}
      className="group flex flex-col rounded-2xl bg-card border border-border overflow-hidden hover:border-brand/50 hover:shadow-lg transition-all"
    >
      <div className="relative aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
        <ProfileAvatar fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} size="xl" className="scale-[2.2] group-hover:scale-[2.35] transition-transform duration-300" />
        {perfil.destacado && (
          <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/95 text-[11px] font-semibold text-amber-950 shadow-sm">
            <Star size={12} fill="currentColor" /> Destacada
          </span>
        )}
        {perfil.experienciaVerificada && (
          <span className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/95 text-[11px] font-medium text-foreground shadow-sm">
            <BadgeCheck size={14} className="text-brand" /> Perfil verificado
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[15px] font-semibold text-foreground">{perfil.nombre}</p>
          {perfil.resumenResenas.total > 0 && (
            <span className="flex items-center gap-0.5 text-[12px] font-medium text-foreground shrink-0">
              <Star size={11} className="text-amber-500" fill="currentColor" />
              {perfil.resumenResenas.promedio}
              <span className="text-muted-foreground font-normal">({perfil.resumenResenas.total})</span>
            </span>
          )}
        </div>
        <p className="text-[12.5px] text-muted-foreground">Instructora de Pilates</p>
        {perfil.ciudad && (
          <p className="text-[12.5px] text-muted-foreground flex items-center gap-1">
            <MapPin size={12} className="shrink-0" />
            {perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
            {distanciaKm != null && <span className="text-foreground font-medium"> · a {distanciaKm} km</span>}
          </p>
        )}
        {perfil.especialidades.length > 0 && (
          <p className="text-[12.5px] text-foreground mt-1">
            {perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
          </p>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/70">
          <span className="text-[12.5px] font-medium text-foreground">
            {perfil.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[perfil.tarifaRango]}` : 'Tarifa a consultar'}
          </span>
          {disponibilidadTexto && (
            <span className="text-[11px] text-success font-medium">{disponibilidadTexto}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
