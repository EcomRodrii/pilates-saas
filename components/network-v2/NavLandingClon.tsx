'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_PRODUCTO } from './tokens';

// Nav de la landing clon (app/network/page.tsx). Dos rondas de feedback:
//
// 1ª (#1487): los tres enlaces estaban `hidden sm:flex` SIN alternativa en
//    móvil — no había nada que tocar. Se añadió el menú hamburguesa.
// 2ª (2026-08-30): pedido explícito — "dejarlo como la landing de
//    tentare.app, ese menú arriba en forma de píldora". La barra oscura de
//    ancho completo de antes no era esa referencia: components/landing/
//    SeccionHero.tsx usa un nav `position: sticky` FLOTANTE (`width:
//    fit-content`, centrado, `border-radius: 999px`, cristal traslúcido con
//    blur) — la estructura se replica aquí tal cual, en su variante oscura
//    (el hero de Network es oscuro de fondo, no la foto clara de la landing
//    general) en vez del cristal claro del original.
const OSCURO = '#0F0F0C';
const PAPEL = '#FAF9F5';

const ENLACES = [
  { href: '#estudio', label: 'Producto' },
  { href: '#app', label: 'Estudio' },
  { href: '#network', label: 'Network' },
];

export function NavLandingClon() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div id="top" className="sticky top-3.5 z-[60] flex justify-center px-3">
      <nav
        aria-label="Principal"
        className="relative flex items-center gap-[18px] w-fit max-w-full rounded-full pl-[18px] pr-2 py-2"
        style={{
          background: 'rgba(15,15,12,.75)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          border: '1px solid rgba(255,255,255,.14)',
          boxShadow: '0 14px 44px rgba(0,0,0,.35)',
        }}
      >
        <Link href="/network" className="inline-flex shrink-0" onClick={() => setAbierto(false)}>
          <LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={24} decorativo />
        </Link>
        <div className="hidden sm:flex gap-[18px] items-center">
          {ENLACES.map((e, i) => (
            <a
              key={e.href} href={e.href}
              className="text-[14px] whitespace-nowrap pb-0.5"
              style={i === 0
                ? { color: PAPEL, fontWeight: 800, borderBottom: `2.5px solid ${NW_PRODUCTO}` }
                : { color: 'rgba(250,249,245,.65)', fontWeight: 600 }}
            >
              {e.label}
            </a>
          ))}
        </div>
        <Link href="/network/crear-perfil" className="hidden sm:inline-flex shrink-0 px-[18px] py-2.5 rounded-full text-[13.5px] font-extrabold whitespace-nowrap" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza</Link>
        <button
          type="button"
          className="sm:hidden flex items-center justify-center w-9 h-9 rounded-full shrink-0"
          style={{ border: '1px solid rgba(255,255,255,.14)' }}
          aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={abierto}
          onClick={() => setAbierto(v => !v)}
        >
          {abierto ? <X size={18} color={PAPEL} /> : <Menu size={18} color={PAPEL} />}
        </button>

        {abierto && (
          <div
            className="sm:hidden absolute top-[calc(100%+8px)] left-0 right-0 rounded-[22px] p-4 flex flex-col gap-1"
            style={{ background: OSCURO, border: '1px solid rgba(255,255,255,.14)', boxShadow: '0 14px 44px rgba(0,0,0,.4)' }}
          >
            {ENLACES.map(e => (
              <a
                key={e.href} href={e.href}
                className="py-2.5 text-[15px] font-bold"
                style={{ color: PAPEL, borderBottom: '1px solid rgba(250,249,245,.08)' }}
                onClick={() => setAbierto(false)}
              >
                {e.label}
              </a>
            ))}
            <Link
              href="/network/crear-perfil"
              className="mt-3 text-center px-5 py-3 rounded-full text-[14px] font-extrabold"
              style={{ background: NW_PRODUCTO, color: PAPEL }}
              onClick={() => setAbierto(false)}
            >
              Empieza
            </Link>
          </div>
        )}
      </nav>
    </div>
  );
}
