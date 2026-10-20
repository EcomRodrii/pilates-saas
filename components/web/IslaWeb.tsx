'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { MedicionPaginasPublicas } from '@/components/seo/MedicionPaginasPublicas';
import { useIslaCompacta } from '@/components/landing/use-isla-compacta';
import { ALTA, NAV_CAMBIARSE } from '@/components/landing/enlaces';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { MENU_PRODUCTO, MENU_RECURSOS, MENU_SOLUCIONES, type EnlaceConResumen } from '@/lib/seo/navegacion-publica';
import './tokens.css';
import './armazon.css';

// ─────────────────────────────────────────────────────────────────────────────
// La isla: la navegación de TODA la web pública (fase 2.1, 19-oct-2026). Antes
// solo la tenía la home; las interiores llevaban `SiteNav` y las legales una
// cabecera propia.
//
// Lo que no cambia (lo fijan e2e/landing-isla.spec.ts y landing-cambiarme.spec.ts):
//  · vidrio en píldora, `position: sticky`, alto fijo (encoger no mueve nada);
//  · al BAJAR se encoge a logo + «Empezar gratis» y al SUBIR se alarga
//    (use-isla-compacta.ts). Encogida CAMBIA de contenido: no recorta;
//  · las clases `v5-nav`, `v5-nav-col`, `v5-nav-cta`, `v5-menu`: las leen los
//    tests y la medición (lib/landing/medicion.ts: `v5-menu` = «menu_movil»).
//
// Lo nuevo:
//  · «Producto», «Soluciones» y «Recursos» abren un panel del MISMO ancho que la
//    píldora y con el mismo vidrio, debajo de ella. Se abren con clic o con
//    Intro/Espacio, se cierran con Esc (el foco vuelve al botón), al pulsar fuera
//    o al salir el foco de la isla. Con un panel abierto la isla no se encoge;
//  · en móvil, el mismo contenido en el menú a pantalla completa;
//  · en las páginas interiores mide qué trae al alta (MedicionPaginasPublicas,
//    como hacía `SiteNav`); la home tiene su propia medición por secciones.
//
// ⚠️ «Precios» lleva a `#precio` en la home y a /precios fuera: en la home la
// sección es la misma tabla y su vista se mide (`landing_precio_visto`).
// ─────────────────────────────────────────────────────────────────────────────

type Panel = 'producto' | 'soluciones' | 'recursos';

const PANELES: { id: Panel; label: string }[] = [
  { id: 'producto', label: 'Producto' },
  { id: 'soluciones', label: 'Soluciones' },
  { id: 'recursos', label: 'Recursos' },
];

// Las cinco áreas en tres columnas de alto parecido (6 · 3+2 · 4+2 enlaces): en
// cinco columnas no caben en la píldora a 1024–1440 px sin partir los nombres.
// En el menú móvil las columnas se disuelven (`display: contents`).
const COLUMNAS_PRODUCTO = [[0], [1, 3], [2, 4]];

function ListaConResumen({ enlaces, alPulsar }: { enlaces: EnlaceConResumen[]; alPulsar: () => void }) {
  return (
    <ul className="w-isla-tarjetas">
      {enlaces.map((e) => (
        <li key={e.href}>
          <Link href={e.href} onClick={alPulsar} className="w-isla-tarjeta">
            <span className="w-isla-tarjeta-nombre">{e.label}</span>
            <span className="w-isla-tarjeta-resumen">{e.resumen}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ContenidoPanel({ panel, alPulsar }: { panel: Panel; alPulsar: () => void }) {
  if (panel === 'producto') {
    return (
      <>
        <div className="w-isla-areas">
          {COLUMNAS_PRODUCTO.map((columna) => (
            <div key={columna.join()} className="w-isla-columna">
              {columna.map((i) => MENU_PRODUCTO[i]).map((area) => (
                <div key={area.titulo} className="w-isla-area">
                  <p className="w-isla-area-titulo">{area.titulo}</p>
                  <ul>
                    {area.enlaces.map((e) => (
                      <li key={e.href}><Link href={e.href} onClick={alPulsar}>{e.label}</Link></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
        <Link href="/funcionalidades" onClick={alPulsar} className="w-isla-todas">
          Todas las funcionalidades <ArrowRight size={15} aria-hidden />
        </Link>
      </>
    );
  }
  if (panel === 'soluciones') {
    return (
      <>
        <ListaConResumen enlaces={MENU_SOLUCIONES} alPulsar={alPulsar} />
        <Link href="/soluciones" onClick={alPulsar} className="w-isla-todas">
          Todas las soluciones <ArrowRight size={15} aria-hidden />
        </Link>
      </>
    );
  }
  return <ListaConResumen enlaces={MENU_RECURSOS} alPulsar={alPulsar} />;
}

export function IslaWeb({ enHome = false }: { enHome?: boolean }) {
  const isla = useRef<HTMLElement>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [seccionMovil, setSeccionMovil] = useState<Panel | null>(null);
  const botones = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const burger = useRef<HTMLButtonElement>(null);
  const cerrarMovil = useRef<HTMLButtonElement>(null);
  const id = useId();
  const idPanel = (p: Panel) => `${id}-${p}`;
  const precios = enHome ? '#precio' : '/precios';

  // La isla se encoge al bajar y se alarga al subir (use-isla-compacta.ts).
  useIslaCompacta(isla);

  // Panel abierto: Esc lo cierra (y devuelve el foco a su botón) y un clic fuera
  // de la isla, también.
  useEffect(() => {
    if (!panel) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const abierto = panel;
      setPanel(null);
      botones.current[abierto]?.focus();
    };
    const alPulsarFuera = (e: PointerEvent) => {
      if (!isla.current?.contains(e.target as Node)) setPanel(null);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alPulsarFuera);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('pointerdown', alPulsarFuera);
    };
  }, [panel]);

  // Menú a pantalla completa: la página de detrás no se desplaza (en iOS el
  // scroll «atraviesa» el overlay si no se bloquea), el foco entra en el menú y
  // Esc lo cierra devolviendo el foco al botón que lo abrió.
  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cerrarMovil.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuAbierto(false);
      burger.current?.focus();
    };
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener('keydown', alTeclear);
    };
  }, [menuAbierto]);

  const cerrarPanel = () => setPanel(null);
  const cerrarMenu = () => setMenuAbierto(false);

  return (
    <>
      {!enHome && <MedicionPaginasPublicas />}
      <nav
        ref={isla}
        className="v5-nav"
        aria-label="Principal"
        data-contexto={enHome ? 'home' : 'interior'}
        {...(panel ? { 'data-menu-abierto': panel } : {})}
        onBlur={(e) => {
          // Si el foco sale de la isla con el teclado (Tab más allá del último
          // enlace), el panel se cierra. Sin `relatedTarget` es un clic en una
          // zona sin foco (dentro del panel, o fuera: eso ya lo cierra el
          // `pointerdown` de arriba), y no se cierra.
          const destino = e.relatedTarget as Node | null;
          if (panel && destino && !e.currentTarget.contains(destino)) setPanel(null);
        }}
      >
        {enHome ? (
          <a href="#top" className="v5-nav-logo" aria-label="Tentare — inicio">
            <LogoTentare formato="isotipo" tinta="color" alto={30} decorativo />
          </a>
        ) : (
          <Link href="/" className="v5-nav-logo" aria-label="Tentare — inicio">
            <LogoTentare formato="isotipo" tinta="color" alto={30} decorativo />
          </Link>
        )}
        {/* Lo que se esconde al encogerse va dentro de un envoltorio de rejilla
            que pasa de 1fr a 0fr: así el ancho de la isla (fit-content) se
            anima sin medir nada con JavaScript. */}
        <div className="v5-nav-col v5-nav-col-links">
          <div className="v5-nav-links">
            {PANELES.map((p) => (
              <Fragment key={p.id}>
                {p.id === 'recursos' && (enHome ? <a href={precios}>Precios</a> : <Link href={precios}>Precios</Link>)}
                <button
                  type="button"
                  ref={(b) => { botones.current[p.id] = b; }}
                  className="w-isla-boton"
                  aria-expanded={panel === p.id}
                  aria-controls={idPanel(p.id)}
                  onClick={() => setPanel((a) => (a === p.id ? null : p.id))}
                >
                  {p.label}<ChevronDown size={15} strokeWidth={2.2} aria-hidden />
                </button>
                {/* El panel va justo detrás de su botón: con Tab, del botón se
                    entra en sus enlaces. Cuelga de la isla con su mismo ancho
                    (posicionado contra el <nav>, que es lo que escapa del
                    `overflow: hidden` del envoltorio). Siempre en el HTML (los
                    buscadores leen sus enlaces), con `hidden` mientras está cerrado. */}
                <div
                  id={idPanel(p.id)}
                  className={`w-isla-panel w-isla-panel-${p.id}`}
                  role="region"
                  aria-label={p.label}
                  hidden={panel !== p.id}
                >
                  <ContenidoPanel panel={p.id} alPulsar={cerrarPanel} />
                </div>
              </Fragment>
            ))}
            {/* La entrada que se quita la primera cuando no cabe (ver armazon.css). */}
            <Link href={NAV_CAMBIARSE.href} className="v5-nav-cambiarse">{NAV_CAMBIARSE.label}</Link>
          </div>
        </div>
        <div className="v5-nav-col v5-nav-col-entrar">
          <Link href="/login" className="v5-nav-entrar">Entrar</Link>
        </div>
        <Link href={ALTA} className="v5-nav-cta">{CTA_ALTA}</Link>
        <button
          ref={burger}
          type="button"
          className="v5-nav-burger"
          aria-label="Abrir el menú"
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto(true)}
        >
          <span aria-hidden />
          <span aria-hidden />
        </button>
      </nav>

      {menuAbierto && (
        <div className="v5-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="v5-menu-top">
            <span className="v5-menu-etiqueta">Menú</span>
            <button ref={cerrarMovil} type="button" onClick={() => { cerrarMenu(); burger.current?.focus(); }} aria-label="Cerrar el menú" className="v5-menu-cerrar">✕</button>
          </div>
          <div className="v5-menu-links">
            {PANELES.slice(0, 2).map((p) => (
              <div key={p.id} className="v5-menu-grupo">
                <button
                  type="button"
                  className="v5-menu-seccion"
                  aria-expanded={seccionMovil === p.id}
                  aria-controls={`${idPanel(p.id)}-movil`}
                  onClick={() => setSeccionMovil((a) => (a === p.id ? null : p.id))}
                >
                  {p.label}<ChevronDown size={22} strokeWidth={2} aria-hidden />
                </button>
                <div id={`${idPanel(p.id)}-movil`} className="v5-menu-sub" hidden={seccionMovil !== p.id}>
                  <ContenidoPanel panel={p.id} alPulsar={cerrarMenu} />
                </div>
              </div>
            ))}
            {enHome ? <a href={precios} onClick={cerrarMenu}>Precios</a> : <Link href={precios} onClick={cerrarMenu}>Precios</Link>}
            <div className="v5-menu-grupo">
              <button
                type="button"
                className="v5-menu-seccion"
                aria-expanded={seccionMovil === 'recursos'}
                aria-controls={`${idPanel('recursos')}-movil`}
                onClick={() => setSeccionMovil((a) => (a === 'recursos' ? null : 'recursos'))}
              >
                Recursos<ChevronDown size={22} strokeWidth={2} aria-hidden />
              </button>
              <div id={`${idPanel('recursos')}-movil`} className="v5-menu-sub" hidden={seccionMovil !== 'recursos'}>
                <ContenidoPanel panel="recursos" alPulsar={cerrarMenu} />
              </div>
            </div>
            <Link href={NAV_CAMBIARSE.href} onClick={cerrarMenu}>{NAV_CAMBIARSE.label}</Link>
          </div>
          <div className="v5-menu-pie">
            <Link href="/login" onClick={cerrarMenu} className="v5-menu-entrar">Entrar</Link>
            <Link href={ALTA} onClick={cerrarMenu} className="v5-menu-cta">{CTA_ALTA}</Link>
          </div>
        </div>
      )}
    </>
  );
}
