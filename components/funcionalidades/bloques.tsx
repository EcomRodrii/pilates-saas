import Image from 'next/image';
import { AlertTriangle } from 'lucide-react';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';

// Piezas de cuerpo compartidas por las páginas de funcionalidad. Son las que
// SÍ deben repetirse (una sección es una sección); los dibujos propios de cada
// página viven en ./visuales.

export function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 id={id}>{titulo}</h2>
      {children}
    </section>
  );
}

/** Entradilla de sección: un párrafo grande que resume antes del detalle. */
export function Entradilla({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--w-texto)' }}>{children}</p>;
}

/**
 * Aviso honesto. Distinto del `Callout` de las guías a propósito: este se usa
 * para los límites reales del producto ("esto todavía no", "esto depende de
 * que configures aquello"), y tiene que verse distinto de una ventaja.
 */
export function Limite({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  // Un filete a la izquierda en el color de aviso, como las notas del blog: se ve
  // distinto de una ventaja sin volver a las cajas de color (#2458, fase 2.4).
  return (
    <div style={{ borderLeft: '3px solid var(--w-aviso)', padding: '2px 0 2px 18px', margin: '24px 0', display: 'flex', gap: 12 }}>
      <span style={{ flexShrink: 0, color: 'var(--w-aviso)', marginTop: 1 }}>
        <AlertTriangle size={19} />
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 3, color: 'var(--w-texto)' }}>{titulo}</div>
        <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--w-texto-2)' }}>{children}</div>
      </div>
    </div>
  );
}

/** Tabla con scroll horizontal propio: el `<body>` nunca se desplaza en móvil. */
export function Tabla({ cabeceras, filas, primeraColumnaAncha = true }: { cabeceras: string[]; filas: React.ReactNode[][]; primeraColumnaAncha?: boolean }) {
  return (
    <div style={{ border: '1px solid var(--w-linea)', borderRadius: 16, overflow: 'hidden', margin: '24px 0', background: 'var(--w-papel)' }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'separate', borderSpacing: 0, fontSize: 14 }}>
          <thead>
            <tr>
              {cabeceras.map((c, i) => (
                <th key={c} style={{ textAlign: 'left', padding: '13px 16px', fontSize: 13, fontWeight: 600, color: 'var(--w-texto-2)', background: 'var(--w-cream)', borderBottom: '1px solid var(--w-linea)', ...(i === 0 && primeraColumnaAncha ? { minWidth: 190 } : {}) }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j} style={{ padding: '13px 16px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid var(--w-linea)', color: j === 0 ? 'var(--w-texto)' : 'var(--w-texto-2)', fontWeight: j === 0 ? 600 : 400, lineHeight: 1.45, verticalAlign: 'top' }}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Rejilla de "qué puedes configurar": título corto + una línea de explicación. */
export function Rejilla({ items, columnas = 2 }: { items: { titulo: string; body: React.ReactNode }[]; columnas?: 2 | 3 }) {
  return (
    <div className={columnas === 3 ? 'feat-rej3' : 'feat-rej2'} style={{ display: 'grid', gap: 14, margin: '24px 0' }}>
      {items.map((it) => (
        <div key={it.titulo} style={{ background: 'var(--w-papel)', border: '1px solid var(--w-linea)', borderRadius: 16, padding: '17px 19px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 6 }}>{it.titulo}</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--w-texto-2)' }}>{it.body}</div>
        </div>
      ))}
      <style>{`
        .feat-rej2 { grid-template-columns: 1fr 1fr; }
        .feat-rej3 { grid-template-columns: repeat(3,1fr); }
        @media (max-width: 720px) { .feat-rej2, .feat-rej3 { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}

/** Caso de uso concreto: escena de estudio real, no un beneficio abstracto. */
export function CasoDeUso({ hora, titulo, children }: { hora: string; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '18px 0', borderTop: '1px solid var(--w-linea)' }}>
      <div style={{ flexShrink: 0, width: 58, fontSize: 13, fontWeight: 600, color: 'var(--w-olive)', paddingTop: 2 }}>{hora}</div>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 5 }}>{titulo}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: 'var(--w-texto-2)' }}>{children}</div>
      </div>
    </div>
  );
}

export function FeatureFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <>
      <FaqStructuredData items={items} />
      <ArticleFaq items={items} />
    </>
  );
}

/** Cierre de página. Distinto del CtaBlock de las guías: más sobrio y sin sombra. */
export function CierreCta({ titulo, body }: { titulo: string; body: string }) {
  return (
    <section>
      {/* Tinta plana: sin el degradado ni el destello de antes (fase 2.4). */}
      <div style={{ background: 'var(--w-noche)', color: 'var(--w-sobre-noche)', borderRadius: 'var(--w-r-tarjeta)', padding: 'clamp(28px,4vw,42px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <h2 style={{ fontWeight: 600, fontSize: 'clamp(23px,2.8vw,31px)', lineHeight: 1.12, letterSpacing: 'var(--w-track-h2)', margin: '0 0 11px', color: 'var(--w-sobre-noche)' }}>{titulo}</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.58, color: 'var(--w-sobre-noche-2)', margin: '0 0 22px' }}>{body}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/crear-estudio" style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--w-olive)', background: 'var(--w-sand)', padding: '14px 26px', borderRadius: 999, textDecoration: 'none' }}>{CTA_ALTA}</a>
            <a href="/precios" style={{ fontSize: 15, fontWeight: 600, color: 'var(--w-sobre-noche)', padding: '14px 6px', textDecoration: 'none' }}>Ver precios →</a>
          </div>
        </div>
      </div>
    </section>
  );
}


/**
 * Captura vertical (de móvil) dentro del cuerpo.
 *
 * Aparte de la del encabezado a propósito: aquella vive en un marco ancho
 * pensado para una pantalla de escritorio, y una captura de móvil ahí queda
 * como una tira estrecha con dos vacíos a los lados.
 */
export function CapturaMovil({ src, alt, pie, children }: { src?: string; alt?: string; pie: string; children?: React.ReactNode }) {
  // `children`: una pieza en lugar de la imagen (la app nueva en el iPhone, fase 2.4).
  return (
    <figure style={{ margin: '28px 0', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,260px) 1fr', alignItems: 'center' }} className="cap-movil">
      {children ?? (src && (
        <Image
          src={src}
          alt={alt ?? ''}
          width={920}
          height={2000}
          sizes="(max-width: 620px) 92vw, 260px"
          style={{ width: '100%', height: 'auto', borderRadius: 18, border: '1px solid var(--w-linea)', boxShadow: '0 30px 60px -40px rgba(26,26,26,.4)' }}
        />
      ))}
      <figcaption style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--w-texto-2)' }}>{pie}</figcaption>
      <style>{`@media (max-width: 620px) { .cap-movil { grid-template-columns: 1fr !important; justify-items: center; } }`}</style>
    </figure>
  );
}
