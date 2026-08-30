'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_PRODUCTO } from './tokens';

// Nav sticky de la landing clon (app/network/page.tsx) — pedido explícito
// tras el clon literal (#1482): los tres enlaces (Producto/Estudio/Network,
// anclas dentro de la misma página) estaban ocultos por completo en móvil
// (`hidden sm:flex`, sin alternativa) — "los botones... no funcionan" era
// literal: no había nada que tocar. Client Component solo por el estado del
// menú; el resto de /network sigue siendo Server Component.

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
    <nav id="top" className="sticky top-0 z-[60]" style={{ background: OSCURO, color: PAPEL }}>
      <div className="flex items-center gap-[26px] px-[clamp(18px,3.5vw,48px)]" style={{ height: 64 }}>
        <Link href="/network" className="inline-flex" onClick={() => setAbierto(false)}>
          <LogoTentare formato="horizontal" tinta="blanco" producto="network" titulo="Tentare Network" alto={26} decorativo />
        </Link>
        <div className="hidden sm:flex gap-[22px] items-center">
          {ENLACES.map((e, i) => (
            <a
              key={e.href} href={e.href}
              className="text-[14px] pb-1"
              style={i === 0
                ? { color: PAPEL, fontWeight: 800, borderBottom: `2.5px solid ${NW_PRODUCTO}` }
                : { color: 'rgba(250,249,245,.65)', fontWeight: 600 }}
            >
              {e.label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/crear-estudio" className="hidden sm:inline-flex px-5 py-2.5 rounded-[10px] text-[13.5px] font-extrabold" style={{ background: NW_PRODUCTO, color: PAPEL }}>Empieza gratis</Link>
          <button
            type="button"
            className="sm:hidden flex items-center justify-center w-9 h-9 -mr-1.5"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
            onClick={() => setAbierto(v => !v)}
          >
            {abierto ? <X size={22} color={PAPEL} /> : <Menu size={22} color={PAPEL} />}
          </button>
        </div>
      </div>

      {abierto && (
        <div className="sm:hidden px-[clamp(18px,3.5vw,48px)] pb-5 flex flex-col gap-1" style={{ borderTop: '1px solid rgba(250,249,245,.12)' }}>
          {ENLACES.map(e => (
            <a
              key={e.href} href={e.href}
              className="py-3 text-[15px] font-bold"
              style={{ color: PAPEL, borderBottom: '1px solid rgba(250,249,245,.08)' }}
              onClick={() => setAbierto(false)}
            >
              {e.label}
            </a>
          ))}
          <Link
            href="/crear-estudio"
            className="mt-4 text-center px-5 py-3 rounded-[10px] text-[14px] font-extrabold"
            style={{ background: NW_PRODUCTO, color: PAPEL }}
            onClick={() => setAbierto(false)}
          >
            Empieza gratis
          </Link>
        </div>
      )}
    </nav>
  );
}
