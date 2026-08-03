'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useModo } from '@/lib/portal-modo';
import { display, texto, radio, altura, sombra, transicion, dur } from '@/lib/portal-design';
import { resolverHrefBloque, type BloqueHome, type EstiloBloque } from '@/lib/portal-home-bloques';

// Presentación de los bloques del catálogo (Fase 3) — banner/texto/cta/faq.
// Los bloques `sistema` NO pasan por aquí: siguen siendo el JSX ya existente
// e intocado en app/portal/[slug]/home/page.tsx.
//
// `estilo` (pedido explícitamente: "no es nada personalizable, tiene que ser
// un constructor totalmente libre") deja que CADA bloque del catálogo pise
// el tema global para sí mismo — fondo, color de texto, alineación,
// espaciado. Sin `estilo`, se ve exactamente como antes (hereda del tema).

const ESPACIADO_PADDING: Record<NonNullable<EstiloBloque['espaciado']>, number> = {
  compacto: 10, normal: 18, amplio: 32,
};
const ALINEACION_TEXT_ALIGN: Record<NonNullable<EstiloBloque['alineacion']>, React.CSSProperties['textAlign']> = {
  izquierda: 'left', centro: 'center', derecha: 'right',
};

/** Padding vertical del bloque según su `espaciado` (normal = el de siempre). */
function paddingDe(estilo: EstiloBloque | undefined): number {
  return ESPACIADO_PADDING[estilo?.espaciado ?? 'normal'];
}

function BannerBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'banner' }>; slug: string }) {
  const { t, noche } = useModo();
  const { imagenUrl, titulo, texto: cuerpo, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = href ? resolverHrefBloque(href) : null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBanner: React.CSSProperties = {
    position: 'relative', display: 'block', height: altura.banner, borderRadius: radio.banner,
    // El fondo propio solo tiene sentido SIN imagen — con foto, la imagen ya
    // ocupa todo el bloque y un color detrás nunca se vería.
    overflow: 'hidden', background: !imagenUrl && estilo?.fondo ? estilo.fondo : t.surface2, boxShadow: sombra.banner, textDecoration: 'none',
    transition: transicion(['transform'], dur.card),
  };
  const contenido = (
    <>
      {imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagenUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: estilo?.fondo ?? t.hero }} />
      )}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: noche
          ? 'linear-gradient(94deg, rgba(18,20,14,.97) 6%, rgba(18,20,14,.88) 42%, rgba(18,20,14,.35) 72%, rgba(18,20,14,.06) 100%)'
          : 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : undefined,
        textAlign: alineacion, pointerEvents: 'none',
      }}>
        {titulo && <div style={{ ...display(29, true, 1.12), color: estilo?.color ?? t.ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>{titulo}</div>}
        {cuerpo && <div style={{ ...texto.nota, color: estilo?.color ?? t.muted, marginTop: 12 }}>{cuerpo}</div>}
      </div>
    </>
  );
  return (
    <div>
      <div style={{ height: 18 }} />
      {!resuelto ? (
        <div style={estiloBanner}>{contenido}</div>
      ) : resuelto.interno ? (
        <Link href={`/portal/${slug}${resuelto.valor}`} style={estiloBanner}>{contenido}</Link>
      ) : (
        <a href={resuelto.valor} target="_blank" rel="noopener noreferrer" style={estiloBanner}>{contenido}</a>
      )}
    </div>
  );
}

function TextoBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'texto' }> }) {
  const { t } = useModo();
  const { titulo, texto: cuerpo } = bloque.config;
  const { estilo } = bloque;
  if (!cuerpo && !titulo) return null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{
      padding: `${paddingDe(estilo)}px 16px`, margin: '0 -16px', borderRadius: estilo?.fondo ? radio.card : undefined,
      background: estilo?.fondo ?? undefined, textAlign: alineacion,
    }}>
      {titulo && <div style={{ ...display(24), color: estilo?.color ?? t.ink, marginBottom: 8 }}>{titulo}</div>}
      {cuerpo && <p style={{ ...texto.meta, color: estilo?.color ?? t.muted2, lineHeight: 1.55 }}>{cuerpo}</p>}
    </div>
  );
}

function CtaBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'cta' }>; slug: string }) {
  const { t } = useModo();
  const { titulo, textoBoton, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = resolverHrefBloque(href);
  if (!resuelto || !textoBoton) return null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBoton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: altura.botonCta,
    padding: '0 22px', borderRadius: radio.botonCta, background: 'var(--portal-brand)', color: t.surface,
    boxShadow: sombra.cta, textDecoration: 'none', ...texto.botonCta,
  };
  return (
    <div style={{
      padding: `${paddingDe(estilo)}px 16px`, margin: '0 -16px', borderRadius: estilo?.fondo ? radio.card : undefined,
      background: estilo?.fondo ?? undefined,
      display: 'flex', flexDirection: 'column',
      alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : 'flex-start',
      textAlign: alineacion, gap: 12,
    }}>
      {titulo && <div style={{ ...display(24), color: estilo?.color ?? t.ink }}>{titulo}</div>}
      {resuelto.interno ? (
        <Link href={`/portal/${slug}${resuelto.valor}`} style={estiloBoton}>{textoBoton}</Link>
      ) : (
        <a href={resuelto.valor} target="_blank" rel="noopener noreferrer" style={estiloBoton}>{textoBoton}</a>
      )}
    </div>
  );
}

function FilaFaq({ pregunta, respuesta, color }: { pregunta: string; respuesta: string; color?: string | null }) {
  const { t } = useModo();
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${t.line}`, padding: '14px 0' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ ...texto.metaFuerte, color: color ?? t.ink }}>{pregunta}</span>
        <ChevronDown size={16} color={color ?? t.muted} style={{ transform: abierta ? 'rotate(180deg)' : undefined, transition: transicion(['transform'], dur.color), flexShrink: 0 }} />
      </button>
      {abierta && <p style={{ ...texto.meta, color: color ?? t.muted2, marginTop: 10, lineHeight: 1.5 }}>{respuesta}</p>}
    </div>
  );
}

function FaqBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'faq' }> }) {
  const { t } = useModo();
  const { titulo, preguntas } = bloque.config;
  const { estilo } = bloque;
  if (preguntas.length === 0) return null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{
      padding: `${paddingDe(estilo)}px 16px`, margin: '0 -16px', borderRadius: estilo?.fondo ? radio.card : undefined,
      background: estilo?.fondo ?? undefined, textAlign: alineacion,
    }}>
      {titulo && <div style={{ ...display(24), color: estilo?.color ?? t.ink, marginBottom: 4 }}>{titulo}</div>}
      {preguntas.map((p, i) => <FilaFaq key={i} pregunta={p.pregunta} respuesta={p.respuesta} color={estilo?.color} />)}
    </div>
  );
}

export function BloqueHomeRender({ bloque, slug }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; slug: string }) {
  if (bloque.kind === 'banner') return <BannerBloque bloque={bloque} slug={slug} />;
  if (bloque.kind === 'texto') return <TextoBloque bloque={bloque} />;
  if (bloque.kind === 'cta') return <CtaBloque bloque={bloque} slug={slug} />;
  return <FaqBloque bloque={bloque} />;
}
