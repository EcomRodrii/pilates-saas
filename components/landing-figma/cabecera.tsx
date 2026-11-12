'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useIslaCompacta } from '@/components/landing/use-isla-compacta';
import { NAV } from './contenido';

// La cabecera: UNA sola píldora de cristal (translúcida, con desenfoque) con el logotipo oficial, la navegación (la sección activa en
// blanco) y «Entrar» + «Empezar gratis», pegada arriba y flotando sobre el héroe. Se comporta como la isla de la web actual: al
// BAJAR se encoge a logo + botón y al SUBIR se alarga (mismo oyente que la home: `useIslaCompacta`, que pone `data-compacta`).
// Cliente por eso, por la marca de «dónde estoy» (Inicio / Precios) y por el menú del móvil (≤ 1100 px).
export function Cabecera() {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState<'inicio' | 'precios'>('inicio');
  const idMenu = useId();
  const barra = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useIslaCompacta(barra);

  useEffect(() => {
    const precios = document.getElementById('precios');
    if (!precios || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setActivo(e.isIntersecting ? 'precios' : 'inicio'), { rootMargin: '-35% 0px -45% 0px' });
    io.observe(precios);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    const fuera = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!panel.current?.contains(n) && !boton.current?.contains(n)) setAbierto(false);
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('pointerdown', fuera);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('pointerdown', fuera); };
  }, [abierto]);

  const esActivo = (href: string) => (href === '#precios' ? activo === 'precios' : href === '/landing-figma' ? activo === 'inicio' : false);

  return (
    <header className="lf-cabecera">
      {/* Con el menú del móvil abierto la píldora no se encoge (el panel colgaría de unos botones que ya no se ven). */}
      <div ref={barra} className="lf-cabecera-barra" data-menu-abierto={abierto || undefined}>
        <Link href="/landing-figma" className="lf-marca" aria-label="Tentare — inicio">
          <LogoTentare formato="horizontal" tinta="color" alto={28} decorativo />
        </Link>

        <div className="lf-col lf-col-menu">
          <nav className="lf-menu" aria-label="Principal">
            {NAV.enlaces.map(e => (
              <Link key={e.texto} href={e.href} aria-current={esActivo(e.href) ? 'page' : undefined} className={esActivo(e.href) ? 'lf-menu-activo' : undefined}>{e.texto}</Link>
            ))}
          </nav>
        </div>

        <div className="lf-col lf-col-entrar">
          <Link href={NAV.login.href} className="lf-acceso-login">{NAV.login.texto}</Link>
        </div>
        <Link href={NAV.empezar.href} className="lf-acceso-empezar">{NAV.empezar.texto}</Link>

        <button
          ref={boton}
          type="button"
          className="lf-hamburguesa"
          aria-expanded={abierto}
          aria-controls={idMenu}
          aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
          onClick={() => setAbierto(a => !a)}
        >
          {abierto ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div ref={panel} id={idMenu} className="lf-panel-movil" data-abierto={abierto || undefined} inert={!abierto || undefined}>
        <nav aria-label="Principal (móvil)">
          {NAV.enlaces.map(e => (
            <Link key={e.texto} href={e.href} onClick={() => setAbierto(false)}>{e.texto}</Link>
          ))}
        </nav>
        <div className="lf-panel-acciones">
          <Link href={NAV.login.href} onClick={() => setAbierto(false)}>{NAV.login.texto}</Link>
          <Link href={NAV.empezar.href} className="lf-acceso-empezar" onClick={() => setAbierto(false)}>{NAV.empezar.texto}</Link>
        </div>
      </div>
    </header>
  );
}
