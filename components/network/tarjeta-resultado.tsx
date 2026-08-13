'use client';

import Link from 'next/link';
import { MapPin, Check, Star } from 'lucide-react';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ESPECIALIDAD_LABEL, TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL } from '@/lib/network/catalogo';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';

const PUNTO_DISPONIBILIDAD: Record<PerfilNetworkPublico['disponibilidadEstado'], string> = {
  disponible: '#2F9E44',
  disponible_sustituciones: '#2F9E44',
  buscando_trabajo: '#E8A33D',
  no_disponible: '#9CA3AF',
};

export function TarjetaResultadoNetwork({ perfil }: { perfil: PerfilNetworkPublico }) {
  return (
    <Link
      href={`/network/${perfil.id}`}
      className="flex items-start gap-3.5 p-4 rounded-xl bg-card border border-border hover:border-brand/40 hover:bg-muted/40 transition-colors"
    >
      <ProfileAvatar fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-[14px] font-semibold text-foreground truncate">{perfil.nombre}</p>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: PUNTO_DISPONIBILIDAD[perfil.disponibilidadEstado] }}
            title={DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}
          />
          {perfil.resumenResenas.total > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-medium text-foreground shrink-0">
              <Star size={10} className="text-amber-500" fill="currentColor" />
              {perfil.resumenResenas.promedio}
            </span>
          )}
        </div>
        {perfil.ciudad && (
          <p className="text-[12px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin size={11} className="shrink-0" />
            {perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
          </p>
        )}
        {perfil.especialidades.length > 0 && (
          <p className="text-[12px] text-foreground mt-1.5">
            {perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
          {perfil.aniosExperiencia != null && <span>{perfil.aniosExperiencia} años exp.</span>}
          {perfil.tarifaRango && <span>{TARIFA_RANGO_LABEL[perfil.tarifaRango]}</span>}
        </div>
        {perfil.experienciaVerificada && (
          <p className="text-[11px] text-success flex items-center gap-1 mt-1">
            <Check size={11} /> Experiencia verificada
          </p>
        )}
      </div>
    </Link>
  );
}
