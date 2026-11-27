'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { BotonTutorial } from '@/components/tutorial/boton-tutorial';
import e from './escaparate.module.css';

// Las piezas de «Mi app» y «Mi web» con la forma de «Tienda online» (27-nov-2026). Solo pintan: qué abre cada
// cosa lo deciden las secciones, igual que en las pantallas guiadas.

export type Accion = { tipo: 'cajon'; abrir: () => void; texto: string } | { tipo: 'enlace'; href: string; texto: string };
export type Tono = 'ok' | 'falta' | 'neutra';

export function BotonAccion({ accion, clase = e.botonGris, texto, children, etiqueta }: {
  accion: Accion; clase?: string; texto?: string; children?: ReactNode; etiqueta?: string;
}) {
  const dentro = <>{children}{texto ?? accion.texto}</>;
  return accion.tipo === 'cajon'
    ? <button type="button" aria-haspopup="dialog" aria-label={etiqueta} onClick={accion.abrir} className={clase}>{dentro}</button>
    : <Link href={accion.href} aria-label={etiqueta} className={clase}>{dentro}</Link>;
}

export function Barra({ titulo, Icono, ruta, children }: { titulo: string; Icono: LucideIcon; ruta: string; children: ReactNode }) {
  return (
    <div className={e.barra}>
      {/* El <h2> de la sección sigue en la página para el lector de pantalla: este es el que se ve. */}
      <p className={e.titulo} aria-hidden><span className={e.icono}><Icono size={13} strokeWidth={2.2} /></span>{titulo}</p>
      <div className={e.acciones}>
        {children}
        <BotonTutorial ruta={ruta} />
      </div>
    </div>
  );
}

export function Etiqueta({ tono, children }: { tono: Tono | 'contorno'; children: ReactNode }) {
  return <span className={`${e.etiqueta} ${e[tono]}`}>{children}</span>;
}

/**
 * Una página nuestra de verdad en pequeño. Solo se pide cuando va a verse (son varias en la misma pantalla) y no
 * se puede tocar: es para mirar; para entrar está el botón de al lado.
 */
export function Marco({ src, titulo, ancho, alto, escala, estiloDentro }: {
  src: string; titulo: string; ancho: number; alto: number;
  /** Sin escala, la página ocupa todo el ancho de su hueco, mida lo que mida. */
  escala?: number;
  estiloDentro?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [listo, setListo] = useState(false);
  const [medido, setMedido] = useState(0);
  useEffect(() => {
    const el = caja.current;
    if (!el || escala !== undefined) return;
    const o = new ResizeObserver(([x]) => setMedido(x.contentRect.width));
    o.observe(el);
    return () => o.disconnect();
  }, [escala]);
  useEffect(() => {
    const el = caja.current;
    if (!el || visible) return;
    const o = new IntersectionObserver(entradas => { if (entradas.some(x => x.isIntersecting)) setVisible(true); }, { rootMargin: '200px' });
    o.observe(el);
    return () => o.disconnect();
  }, [visible]);
  function alCargar() {
    const doc = ref.current?.contentDocument;
    if (estiloDentro && doc?.head && !doc.getElementById('escaparate-margen')) {
      const s = doc.createElement('style');
      s.id = 'escaparate-margen';
      s.textContent = estiloDentro;
      doc.head.appendChild(s);
    }
    setListo(true);
  }
  return (
    <div ref={caja} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {visible && (
        <iframe
          ref={ref} title={titulo} src={src} onLoad={alCargar} tabIndex={-1} loading="lazy" className={e.marco}
          style={{ width: ancho, height: alto, transform: `scale(${escala ?? medido / ancho})`, opacity: listo ? 1 : 0 }}
        />
      )}
    </div>
  );
}

// En un iPhone la app aparta la isla y el indicador con `env(safe-area-inset-*)`, que en un iframe valen 0.
const MARGEN_IPHONE = 'html .student-app { --safe-top: 62px; --safe-bottom: 34px; }';

export function Telefono({ src, titulo, ancho, clase = '', bajoLaIsla = false, estilo }: {
  src: string; titulo: string; ancho: number; clase?: string;
  /** Una página web no aparta la isla (la app sí): se pinta por debajo de ella. */
  bajoLaIsla?: boolean;
  estilo?: CSSProperties;
}) {
  return (
    <div className={`${e.telefono} ${clase}`} style={{ '--w': `${ancho}px`, ...estilo } as CSSProperties}>
      <div className={e.pantalla}>
        <div className={bajoLaIsla ? e.bajoIsla : e.entera}>
          <Marco src={src} titulo={titulo} ancho={402} alto={874} escala={(ancho * 0.948) / 402} estiloDentro={MARGEN_IPHONE} />
        </div>
        <span className={e.isla} aria-hidden />
      </div>
    </div>
  );
}

export function Tema({ nombre, detalle, accion, estado, tono = 'neutra', children, id }: {
  nombre: string; detalle: string; accion: Accion | null; estado?: string | null; tono?: Tono; children: ReactNode; id?: string;
}) {
  return (
    <li id={id}>
      <div className={e.mini}>{children}</div>
      <div className={e.temaPie}>
        <div>
          <b>{nombre}</b>
          <span className={e.suave}>{detalle}</span>
          {estado && <div className={e.estado}><Etiqueta tono={tono}>{estado}</Etiqueta></div>}
        </div>
        {accion && <BotonAccion accion={accion} etiqueta={`${accion.texto}: ${nombre}`} />}
      </div>
    </li>
  );
}

export function Fila({ cuadro, titulo, detalle, accion, etiqueta, tono = 'neutra', id }: {
  cuadro: ReactNode; titulo: string; detalle: string; accion: Accion | null; etiqueta?: string | null; tono?: Tono; id?: string;
}) {
  const dentro = (
    <>
      <span className={e.cuadro} aria-hidden>{cuadro}</span>
      <span className={e.filaTexto}><b>{titulo}</b><span>{detalle}</span></span>
      {etiqueta && <Etiqueta tono={tono}>{etiqueta}</Etiqueta>}
      {accion && <ChevronRight size={16} aria-hidden />}
    </>
  );
  return (
    <li id={id}>
      {!accion ? <div className={e.fila}>{dentro}</div> : accion.tipo === 'cajon'
        ? <button type="button" aria-haspopup="dialog" onClick={accion.abrir} className={e.fila}>{dentro}</button>
        : <Link href={accion.href} className={e.fila}>{dentro}</Link>}
    </li>
  );
}
