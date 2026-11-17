import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Minus, Plus } from 'lucide-react';
import { Cabecera } from '@/components/home-nueva/cabecera';
import { MedicionPaginasPublicas } from '@/components/seo/MedicionPaginasPublicas';
import { RevelarWeb } from '@/components/web/revelar-web';
import { PieWeb } from '@/components/web/PieWeb';
import { FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import '@/components/home-nueva/figma.css';
import './hub.css';

// ─────────────────────────────────────────────────────────────────────────────
// Armazón de los dos índices comerciales (/funcionalidades, «Producto» en el menú, y /soluciones), en el idioma de la home nueva
// (nov-2026): la misma cabecera de cristal, las tarjetas menta de radio 24–32, la etiqueta con icono, el botón con círculo y el cierre
// verde hondo. Antes llevaban la isla antigua y una rejilla de tarjetas de texto iguales: al pasar de la home a «Producto» parecía
// otra web, y las 17 funciones se leían como una lista de la compra.
//
// Lo que se mantiene a propósito: el `<h1>` EMPIEZA por la búsqueda a la que responde la página (SEO), las preguntas siguen siendo
// <details> con la respuesta en el HTML y el mismo array que el JSON-LD (e2e/landing-ronda-1), y la entrada al scroll es la de las
// interiores (`RevelarWeb`, sobre las <section> de primer nivel).
// ─────────────────────────────────────────────────────────────────────────────

export function Etiqueta({ icono, children, oscuro }: { icono: ReactNode; children: ReactNode; oscuro?: boolean }) {
  return <span className={oscuro ? 'lf-etiqueta lf-etiqueta--oscura' : 'lf-etiqueta'}>{icono}{children}</span>;
}

/** Botón pastilla de la home: texto + círculo con flecha. */
export function Boton({ href, children, tipo = 'verde' }: { href: string; children: ReactNode; tipo?: 'claro' | 'verde' }) {
  return (
    <Link href={href} className={`lf-boton lf-boton--${tipo}`}>
      <span>{children}</span>
      <span className="lf-boton-flecha" aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></span>
    </Link>
  );
}

/** `piezas`: la página lleva piezas de producto de la home (`.wh`, components/web/home/piezas.tsx); `hub.css` les pone la paleta menta. */
export function HubShell({ fija, piezas, children }: { fija: 'producto' | 'soluciones'; piezas?: boolean; children: ReactNode }) {
  return (
    <div className={piezas ? 'lf hx wh' : 'lf hx'}>
      <RevelarWeb />
      <MedicionPaginasPublicas />
      <Cabecera fija={fija} />
      <main>{children}</main>
      <PieWeb />
    </div>
  );
}

export function HeroHub({ etiqueta, categoria, titulo, texto, indice, children }: {
  etiqueta: ReactNode; categoria: string; titulo: ReactNode; texto: ReactNode; indice?: { href: string; texto: string }[]; children?: ReactNode;
}) {
  return (
    <section className="hx-hero">
      <div className="hx-hero-in">
        {etiqueta}
        {/* El h1 empieza por la búsqueda («Funcionalidades del software para…»), como el de la home: el titular con gancho va dentro. */}
        <h1 className="hx-h1">
          <span className="hx-h1-cat">{categoria}</span>{' '}
          <span className="hx-h1-promesa">{titulo}</span>
        </h1>
        <p className="hx-lead">{texto}</p>
        <div className="hx-acciones">
          <Boton href="/crear-estudio">{CTA_ALTA}</Boton>
          <Link href="/precios" className="hx-boton-linea">Ver precios</Link>
        </div>
        {indice && (
          <nav className="hx-indice" aria-label="Ir a un área">
            {indice.map(i => <a key={i.href} href={i.href}>{i.texto}</a>)}
          </nav>
        )}
        {children}
      </div>
    </section>
  );
}

export interface FilaFuncion { href: string; nombre: string; resumen: string }

/** Un área del producto: el resultado que busca la dueña, sus funciones como filas y el fragmento del producto dibujado al lado. */
export function AreaHub({ id, icono, etiqueta, titulo, texto, filas, escena, inversa }: {
  id: string; icono: ReactNode; etiqueta: string; titulo: string; texto: string; filas: FilaFuncion[]; escena: ReactNode; inversa?: boolean;
}) {
  return (
    <section id={id} className={inversa ? 'hx-area hx-area--inversa' : 'hx-area'} aria-labelledby={`${id}-t`}>
      <div className="hx-area-texto">
        <Etiqueta icono={icono}>{etiqueta}</Etiqueta>
        <h2 id={`${id}-t`}>{titulo}</h2>
        <p>{texto}</p>
        <ul className="hx-filas">
          {filas.map(f => (
            <li key={f.href}>
              <Link href={f.href} className="hx-fila">
                <span className="hx-fila-cuerpo"><b>{f.nombre}</b><span>{f.resumen}</span></span>
                <span className="hx-fila-flecha" aria-hidden="true"><ArrowRight size={16} strokeWidth={1.8} /></span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="hx-area-escena">{escena}</div>
    </section>
  );
}

export function FaqHub({ id, icono, etiqueta, titulo, texto, items }: {
  id: string; icono: ReactNode; etiqueta: string; titulo: string; texto: string; items: { q: string; a: string }[];
}) {
  return (
    <section id={id} className="hx-faq" aria-labelledby={`${id}-t`}>
      <FaqStructuredData items={items} />
      <div className="hx-faq-izq">
        <Etiqueta icono={icono}>{etiqueta}</Etiqueta>
        <h2 id={`${id}-t`}>{titulo}</h2>
        <p>{texto}</p>
      </div>
      <div className="hx-faq-lista">
        {items.map(p => (
          <details key={p.q}>
            {/* class="afaq-q" y <span> directo: es lo que lee e2e/landing-ronda-1 para cruzar la pregunta visible con el JSON-LD. */}
            <summary className="afaq-q">
              <span>{p.q}</span>
              <span className="hx-faq-mas" aria-hidden="true"><Plus className="hx-mas" size={20} strokeWidth={1.4} /><Minus className="hx-menos" size={20} strokeWidth={1.4} /></span>
            </summary>
            <p>{p.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CierreHub({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="lf-cta hx-cta" aria-labelledby="hx-cierre-t">
      <svg className="lf-flor lf-flor--1" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 50C50 20 70 0 100 0c0 30-20 50-50 50Zm0 0c30 0 50 20 50 50-30 0-50-20-50-50Zm0 0c0 30-20 50-50 50 0-30 20-50 50-50Zm0 0C20 50 0 30 0 0c30 0 50 20 50 50Z" /></svg>
      <div className="lf-cta-texto">
        <h2 id="hx-cierre-t">{titulo}</h2>
        <p>{texto}</p>
      </div>
      <div className="hx-acciones hx-acciones--cierre">
        <Boton href="/crear-estudio" tipo="claro">{CTA_ALTA}</Boton>
        <Link href="/precios" className="hx-boton-linea hx-boton-linea--oscuro">Ver precios</Link>
      </div>
    </section>
  );
}
