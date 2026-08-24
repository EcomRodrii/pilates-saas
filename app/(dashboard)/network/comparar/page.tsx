'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin, Star } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { compararPerfilesNetwork } from '@/lib/api-client';
import {
  ESPECIALIDAD_LABEL, HORARIO_LABEL, TIPO_TRABAJO_LABEL,
  TARIFA_RANGO_LABEL, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import type { DetallePerfilPublico } from '@/lib/network/publico.ts';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

// Tercera pieza de F2: comparación de 2-3 perfiles a la vez (tope
// confirmado con el fundador). Mismo patrón que /network/buscar — Client
// Component, fetch en un efecto, sin Server Component porque el resto del
// dominio Network en el panel ya funciona así (auth de sesión de staff vía
// authHeader(), no cookies de servidor).
export default function CompararPerfilesPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: idsRaw } = use(searchParams);
  const ids = (idsRaw ?? '').split(',').map(v => v.trim()).filter(Boolean);

  const [perfiles, setPerfiles] = useState<DetallePerfilPublico[]>([]);
  // Sin ids en la URL, no hay nada que pedir — el estado inicial ya refleja
  // eso (nunca un `setCargando(false)` síncrono dentro del efecto, regla
  // react-hooks/set-state-in-effect).
  const [cargando, setCargando] = useState(ids.length > 0);

  useEffect(() => {
    let vivo = true;
    if (ids.length === 0) return;
    compararPerfilesNetwork(ids).then(r => { if (vivo) { setPerfiles(r); setCargando(false); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids se deriva de idsRaw, comparar por valor bastaría pero idsRaw ya es estable por navegación
  }, [idsRaw]);

  return (
    <div className="space-y-5">
      <Link href="/network/buscar" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={14} /> Volver al buscador
      </Link>

      <PageHeader title="Comparar profesionales" description="Los mismos datos que ves en cada ficha, uno al lado del otro." />

      {cargando ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : perfiles.length === 0 ? (
        <div className={cardCls}>
          <EmptyState
            compacto
            titulo="No hay perfiles que comparar."
            descripcion="Vuelve al buscador y selecciona entre 2 y 3 profesionales."
          />
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-4 min-w-max md:min-w-0"
            style={{ gridTemplateColumns: `repeat(${perfiles.length}, minmax(240px, 1fr))` }}
          >
            {perfiles.map(({ perfil, badges }) => (
              <div key={perfil.id} className={`${cardCls} p-5 space-y-4 w-60 md:w-auto`}>
                <Link href={`/network/${perfil.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                  <ProfileAvatar fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} size="lg" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">{perfil.nombre}</p>
                    {perfil.ciudad && (
                      <p className="text-[12px] text-muted-foreground flex items-center gap-1">
                        <MapPin size={11} className="shrink-0" />
                        {perfil.ciudad}{perfil.zona ? ` · ${perfil.zona}` : ''}
                      </p>
                    )}
                  </div>
                </Link>

                {perfil.resumenResenas.total > 0 && (
                  <CampoComparacion etiqueta="Valoración">
                    <p className="text-[13px] text-foreground flex items-center gap-1">
                      <Star size={12} className="text-amber-500" fill="currentColor" />
                      {perfil.resumenResenas.promedio}
                      <span className="text-muted-foreground">({perfil.resumenResenas.total})</span>
                    </p>
                  </CampoComparacion>
                )}

                <CampoComparacion etiqueta="Tarifa orientativa">
                  <p className="text-[13px] text-foreground">
                    {perfil.tarifaRango ? TARIFA_RANGO_LABEL[perfil.tarifaRango] : 'A consultar'}
                  </p>
                </CampoComparacion>

                <CampoComparacion etiqueta="Disponibilidad">
                  <p className="text-[13px] text-foreground">{DISPONIBILIDAD_ESTADO_LABEL[perfil.disponibilidadEstado]}</p>
                  {perfil.disponibilidadHorarios.length > 0 && (
                    <p className="text-[11.5px] text-muted-foreground mt-0.5">
                      {perfil.disponibilidadHorarios.map(h => HORARIO_LABEL[h]).join(' · ')}
                    </p>
                  )}
                </CampoComparacion>

                <CampoComparacion etiqueta="Especialidades">
                  <p className="text-[13px] text-foreground">
                    {perfil.especialidades.length > 0 ? perfil.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ') : '—'}
                  </p>
                </CampoComparacion>

                <CampoComparacion etiqueta="Años de experiencia">
                  <p className="text-[13px] text-foreground">{perfil.aniosExperiencia != null ? `${perfil.aniosExperiencia} años` : '—'}</p>
                </CampoComparacion>

                {perfil.tipoTrabajo.length > 0 && (
                  <CampoComparacion etiqueta="Tipo de trabajo">
                    <p className="text-[13px] text-foreground">{perfil.tipoTrabajo.map(t => TIPO_TRABAJO_LABEL[t]).join(' · ')}</p>
                  </CampoComparacion>
                )}

                {/* Mismo bloque "N de 4 verificaciones" que la tarjeta del buscador (contarBadgesVerificacion) — aquí se enseña el detalle completo (ListaBadgesNetwork), no solo el contador, porque esta pantalla ya es de comparación a fondo. */}
                <CampoComparacion etiqueta="Verificaciones">
                  <ListaBadgesNetwork badges={badges} />
                </CampoComparacion>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CampoComparacion({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">{etiqueta}</p>
      {children}
    </div>
  );
}
