import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_BORDE } from '@/components/network-v2/tokens';

/**
 * Tarjeta de "Estamos en mantenimiento" para Tentare Network — compartida
 * por /network/acceso y /network/crear-perfil (29-sep-2026, decisión del
 * fundador). `pieAdicional` es opcional porque solo /network/acceso lo usa
 * (enlace cruzado a Tentare Software); crear-perfil no lo necesita, dado
 * que quien llega ahí no tiene ninguna cuenta de Software que enlazar.
 */
export function AvisoMantenimientoNetwork({ mensaje, pieAdicional }: { mensaje: string; pieAdicional?: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center p-8" style={{ background: NW_FONDO }}>
      <div className="max-w-[420px] w-full bg-white rounded-2xl p-8 text-center" style={{ border: `1px solid ${NW_BORDE}` }}>
        <Link href="/network" className="inline-flex mb-6">
          <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={22} decorativo />
        </Link>
        <h1 className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>Estamos en mantenimiento</h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: NW_MUTED }}>{mensaje}</p>
        {pieAdicional && (
          <div className="mt-6 rounded-xl p-4 text-[12.5px]" style={{ background: NW_SAGE, color: NW_TINTA }}>
            {pieAdicional}
          </div>
        )}
      </div>
    </div>
  );
}
