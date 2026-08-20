import Image from 'next/image';
import { AlertTriangle } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData } from '@/components/recursos/ArticleStructuredData';

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
  return <p style={{ fontSize: 19, lineHeight: 1.6, color: '#2A2A26' }}>{children}</p>;
}

/**
 * Aviso honesto. Distinto del `Callout` de las guías a propósito: este se usa
 * para los límites reales del producto ("esto todavía no", "esto depende de
 * que configures aquello"), y tiene que verse distinto de una ventaja.
 */
export function Limite({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FBF6F4', border: '1px solid #F0DED8', borderRadius: 14, padding: '16px 18px', margin: '24px 0', display: 'flex', gap: 13 }}>
      <span style={{ flexShrink: 0, color: '#C2503A', marginTop: 1 }}>
        <AlertTriangle size={19} />
      </span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: '#7A2E1F' }}>{titulo}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: '#6A4238' }}>{children}</div>
      </div>
    </div>
  );
}

/** Tabla con scroll horizontal propio: el `<body>` nunca se desplaza en móvil. */
export function Tabla({ cabeceras, filas, primeraColumnaAncha = true }: { cabeceras: string[]; filas: React.ReactNode[][]; primeraColumnaAncha?: boolean }) {
  return (
    <div style={{ border: '1px solid #E7E7E0', borderRadius: 16, overflow: 'hidden', margin: '24px 0', background: '#fff' }}>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'separate', borderSpacing: 0, fontSize: 14 }}>
          <thead>
            <tr>
              {cabeceras.map((c, i) => (
                <th key={c} style={{ textAlign: 'left', padding: '13px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: '#8E8E86', background: '#F5F5F1', borderBottom: '1px solid #E7E7E0', ...(i === 0 && primeraColumnaAncha ? { minWidth: 190 } : {}) }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j} style={{ padding: '13px 16px', borderBottom: i === filas.length - 1 ? 'none' : '1px solid #F0F0EA', color: j === 0 ? '#1A1A1A' : '#5A5A52', fontWeight: j === 0 ? 600 : 400, lineHeight: 1.45, verticalAlign: 'top' }}>{celda}</td>
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
        <div key={it.titulo} style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '17px 19px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 6 }}>{it.titulo}</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: MUTED }}>{it.body}</div>
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
    <div style={{ display: 'flex', gap: 16, padding: '18px 0', borderTop: '1px solid #E7E7E0' }}>
      <div className="lp-mono" style={{ flexShrink: 0, width: 58, fontSize: 12.5, fontWeight: 500, color: ACC, paddingTop: 2 }}>{hora}</div>
      <div>
        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 5 }}>{titulo}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6, color: '#4A4A44' }}>{children}</div>
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
      <div style={{ background: 'linear-gradient(135deg,#343825,#191C11)', color: '#fff', borderRadius: 22, padding: 'clamp(28px,4vw,42px)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-46%', right: '-6%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.14), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 520 }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,31px)', lineHeight: 1.12, letterSpacing: '-.03em', margin: '0 0 11px', color: '#fff' }}>{titulo}</h2>
          <p style={{ fontSize: 15.5, lineHeight: 1.58, color: '#D6DAC6', margin: '0 0 22px' }}>{body}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="/crear-estudio" style={{ fontSize: 15.5, fontWeight: 700, color: '#343825', background: '#D9C29E', padding: '14px 26px', borderRadius: 999, textDecoration: 'none' }}>Crear mi estudio</a>
            <a href="/precios" style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,.85)', padding: '14px 6px', textDecoration: 'none' }}>Ver precios →</a>
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
export function CapturaMovil({ src, alt, pie }: { src: string; alt: string; pie: string }) {
  return (
    <figure style={{ margin: '28px 0', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,260px) 1fr', alignItems: 'center' }} className="cap-movil">
      <Image
        src={src}
        alt={alt}
        width={920}
        height={2000}
        sizes="(max-width: 620px) 92vw, 260px"
        style={{ width: '100%', height: 'auto', borderRadius: 18, border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -40px rgba(26,26,26,.4)' }}
      />
      <figcaption className="lp-mono" style={{ fontSize: 12.5, lineHeight: 1.55, color: '#5A5A52' }}>{pie}</figcaption>
      <style>{`@media (max-width: 620px) { .cap-movil { grid-template-columns: 1fr !important; } }`}</style>
    </figure>
  );
}
