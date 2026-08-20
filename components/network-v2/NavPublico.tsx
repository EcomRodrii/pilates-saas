import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_TINTA, NW_MUTED_2, NW_PRODUCTO, NW_BORDE } from './tokens';
import { MenuMovil } from './MenuMovil';
import { InsigniaBeta } from './InsigniaBeta';
import { EnlaceRastreo } from './EnlaceRastreo';

// Cabecera pública compartida por /network, /network/instructoras(/[slug]) —
// README 1a: logo 148px, nav "Explorar instructoras · Cómo funciona", derecha
// "Entrar como estudio" (quiet) + "Iniciar sesión" (14/700) + CTA "Crear
// perfil" pill verde. Server Component (sin 'use client'): no lleva estado,
// así que no hace falta pagar el bundle de un client component en cada
// página pública que la monta.
export function NavPublico() {
  return (
    <header style={{ borderBottom: `1px solid ${NW_BORDE}` }}>
      <div className="max-w-[1240px] mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <Link href="/network" className="flex items-center gap-2.5 shrink-0" aria-label="Tentare Network — inicio">
          <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={26} decorativo />
          <InsigniaBeta alto={26} />
        </Link>
        <nav className="hidden md:flex items-center gap-6" style={{ color: NW_TINTA }}>
          <Link href="/network/instructoras" className="text-[13.5px] font-semibold hover:opacity-70 transition-opacity">
            Explorar instructoras
          </Link>
          <Link href="/network#como-funciona" className="text-[13.5px] font-semibold hover:opacity-70 transition-opacity">
            Cómo funciona
          </Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <Link href="/network/acceso" className="hidden sm:inline text-[13.5px] font-medium" style={{ color: NW_MUTED_2 }}>
            Entrar como estudio
          </Link>
          {/* min-h-11 (44px): antes era solo texto de 14px sin relleno, área
              táctil muy por debajo del mínimo (auditoría mobile-first).
              Oculto por debajo de sm (como "Entrar como estudio" arriba):
              con hamburguesa + este link + el pill "Crear perfil" a la vez,
              el header no cabía en 375px (scrollWidth > clientWidth medido
              en vivo) — MenuMovil lleva su propio "Iniciar sesión" para que
              siga alcanzable en un toque en móvil. */}
          <Link href="/network/acceso" className="hidden sm:inline-flex items-center min-h-11 text-[14px] font-bold" style={{ color: NW_TINTA }}>
            Iniciar sesión
          </Link>
          <EnlaceRastreo
            href="/network/crear-perfil"
            evento="network_click_crear_perfil"
            className="inline-flex items-center min-h-11 px-[22px] rounded-full text-[13.5px] font-bold text-white transition-all hover:brightness-110"
            style={{ background: NW_PRODUCTO }}
          >
            Crear perfil
          </EnlaceRastreo>
          <MenuMovil />
        </div>
      </div>
    </header>
  );
}
