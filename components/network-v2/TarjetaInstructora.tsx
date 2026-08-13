import Link from 'next/link';
import { BadgeCheck, Star } from 'lucide-react';
import { FotoInstructora } from './FotoInstructora';
import { ESPECIALIDAD_LABEL, TARIFA_RANGO_LABEL } from '@/lib/network/catalogo';
import type { PerfilNetworkPublico } from '@/lib/network/tipos';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_ESTRELLA, NW_PRODUCTO, NW_BORDE, NW_BORDE_HOVER } from './tokens';

// "Tarjeta de instructora (patrón)" del README: foto grande, chip
// verificada arriba-izda, CTA "Ver perfil" que aparece al hover, nombre +
// rating, zona · especialidades, fila final tarifa + estado. Misma data
// (`PerfilNetworkPublico`) que la card anterior en components/network-publico/
// tarjeta-instructora.tsx — esto es un rediseño visual, no una fuente de
// datos nueva (esa sigue siendo lib/network/publico.ts, sin tocar).
const DISPONIBILIDAD_ETIQUETA: Partial<Record<PerfilNetworkPublico['disponibilidadEstado'], string>> = {
  disponible: 'Disponible ahora',
  disponible_sustituciones: 'Sustituciones',
  buscando_trabajo: 'Freelance',
};

export function TarjetaInstructora({ perfil }: { perfil: PerfilNetworkPublico }) {
  const disponibilidadTexto = DISPONIBILIDAD_ETIQUETA[perfil.disponibilidadEstado];
  return (
    <Link
      href={perfil.slug ? `/network/instructoras/${perfil.slug}` : '#'}
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
          <FotoInstructora fotoUrl={perfil.fotoUrl} nombre={perfil.nombre} aspectRatio="4 / 4.4" radius={15} />
        </div>
        {perfil.experienciaVerificada && (
          <span
            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(255,255,255,.93)', color: '#2E5A3A' }}
          >
            <BadgeCheck size={12} /> Verificada
          </span>
        )}
        <span
          className="absolute left-2.5 right-2.5 bottom-2.5 text-center py-2.5 rounded-full text-[13px] font-bold text-white opacity-0 translate-y-1.5 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0"
          style={{ background: NW_PRODUCTO }}
        >
          Ver perfil
        </span>
      </div>
      <div className="pt-3 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <p className="text-[16px] font-extrabold" style={{ color: NW_TINTA }}>{perfil.nombre}</p>
          {perfil.resumenResenas.total > 0 && (
            <span className="flex items-center gap-0.5 text-[12px] font-semibold shrink-0" style={{ color: NW_TINTA }}>
              <Star size={11} style={{ color: NW_ESTRELLA }} fill="currentColor" />
              {perfil.resumenResenas.promedio}
              <span className="font-normal" style={{ color: NW_MUTED_2 }}>({perfil.resumenResenas.total})</span>
            </span>
          )}
        </div>
        {perfil.ciudad && (
          <p className="text-[12.5px]" style={{ color: '#808A7E' }}>
            {perfil.zona ? `${perfil.zona} · ` : ''}{perfil.especialidades.slice(0, 3).map(e => ESPECIALIDAD_LABEL[e]).join(', ') || perfil.ciudad}
          </p>
        )}
        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
          <span className="text-[13.5px] font-extrabold" style={{ color: NW_TINTA }}>
            {perfil.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[perfil.tarifaRango]}` : 'A consultar'}
          </span>
          {disponibilidadTexto && (
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: NW_MUTED }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: NW_PRODUCTO }} />
              {disponibilidadTexto}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
