'use client';

// Hermana de TarjetaInstructora.tsx — mismo motivo de 'use client' (el hover
// del borde usa onMouseEnter/onMouseLeave; ver la nota extensa en ese
// fichero sobre por qué esto rompe el build de Vercel si se olvida). Antes,
// app/network/estudios/page.tsx pintaba un <Link> plano sin este tratamiento
// — sin hover, sin CTA, sin descripción (aunque `descripcion` ya viene de
// buscarEstudiosPublicos, lib/network/publico-estudios.ts, y se tiraba sin
// usar). Esta tarjeta cierra ese hueco reutilizando el mismo lenguaje visual.
import Link from 'next/link';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { FotoInstructora } from './FotoInstructora';
import type { EstudioListadoPublico } from '@/lib/network/publico-estudios';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_PRODUCTO, NW_BORDE, NW_BORDE_HOVER } from './tokens';

export function TarjetaEstudio({ estudio }: { estudio: EstudioListadoPublico }) {
  return (
    <Link
      href={`/network/estudios/${estudio.slug}`}
      className="group flex flex-col bg-white transition-all"
      style={{
        border: `1px solid ${NW_BORDE}`, borderRadius: 22, padding: '10px 10px 16px',
        transitionProperty: 'transform, box-shadow, border-color',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = NW_BORDE_HOVER; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = NW_BORDE; }}
    >
      <div className="relative overflow-hidden" style={{ borderRadius: 15 }}>
        <div className="transition-transform duration-500 group-hover:scale-[1.035]">
          <FotoInstructora fotoUrl={estudio.fotoUrl ?? estudio.logoUrl} nombre={estudio.nombre} aspectRatio="1 / 1.1" radius={15} />
        </div>
        <span
          className="absolute left-2.5 right-2.5 bottom-2.5 flex items-center justify-center gap-1.5 text-center py-2.5 rounded-full text-[13px] font-bold text-white opacity-0 translate-y-1.5 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0"
          style={{ background: NW_PRODUCTO }}
        >
          Ver estudio <ArrowUpRight size={13} />
        </span>
      </div>
      <div className="pt-3 flex flex-col gap-0.5">
        <p className="text-[16px] font-extrabold" style={{ color: NW_TINTA }}>{estudio.nombre}</p>
        {estudio.ciudad && (
          <p className="flex items-center gap-1 text-[12.5px]" style={{ color: '#808A7E' }}>
            <MapPin size={12} />{estudio.ciudad}
          </p>
        )}
        {estudio.descripcion && (
          <p
            className="mt-1.5 text-[12.5px] leading-[1.5]"
            style={{
              color: NW_MUTED, display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {estudio.descripcion}
          </p>
        )}
        {!estudio.descripcion && (
          <p className="mt-1.5 text-[12.5px]" style={{ color: NW_MUTED_2 }}>
            Estudio del directorio de Tentare Network.
          </p>
        )}
      </div>
    </Link>
  );
}
