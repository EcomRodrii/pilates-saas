'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { serif, sans, cq, radius, shadow } from '@/lib/reservar-publico-tokens';
import { resolverHrefBloque, resolverVideoEmbed, bloqueEstaCompleto, type BloqueHome, type BloqueTipoCatalogo, type EstiloBloque, type ContenedorConfig } from '@/lib/portal-home-bloques';
import { paraKind, type PropsBloqueRender } from '@/components/reservar/comun/registro-render';
import { TextoRico } from '@/components/reservar/comun/texto-rico';

// Presentación de los bloques del catálogo (banner/texto/cta/faq/galería/
// vídeo/testimonios/contenedor) para /reservar — la generalización del
// constructor de bloques a esta pantalla (Fase 2 del Theme Builder).
//
// Es una copia adaptada de components/portal/bloque-home-render.tsx, NO el
// mismo componente reutilizado, por un motivo real y ya medido: /reservar
// tiene su PROPIO lenguaje visual (lib/reservar-publico-tokens.ts — Instrument
// Serif/Sans, radios y sombras propios) y, sobre todo, NUNCA lee color por
// `useModo()`/un objeto de tokens JS — lo hace por variable CSS
// (`var(--portal-ink)`…) para que el modo incrustado (widget sobre una web
// oscura) siga funcionando. `useModo()` exige un Provider que esta página no
// monta, y un objeto de tokens fijado a "día" es exactamente el bug que ya
// costó un icono claro sobre fondo oscuro en producción (ver el comentario de
// `RESERVAR_TOKENS` en app/reservar/[slug]/page.tsx). Duplicar es el precio de
// no repetir ese bug aquí.
//
// ⚠️ Límite conocido, no silencioso: aquí NO se replica `coloresDe()` (el
// auto-contraste de lib/theme/superficie.ts cuando un bloque pone `fondo`
// propio). Ese cálculo necesita un color de tinta REAL para medir contraste
// (WCAG), y el único que existe en esta página es la variable CSS — que
// puede estar pisada por la paleta de noche del embed y no se puede leer en
// el momento de construir el estilo. Si la propietaria pone un fondo propio
// SIN color de texto propio, el texto sigue en `var(--portal-ink)` de
// siempre — puede no contrastar con ese fondo. Con color de texto explícito
// (`estilo.color`), ese SÍ se respeta tal cual: "si hay color explícito,
// gana" es la única de las tres reglas de `coloresDe` que no necesita un hex
// de referencia.

const ESPACIADO_PADDING: Record<NonNullable<EstiloBloque['espaciado']>, number> = {
  compacto: 10, normal: 18, amplio: 32,
};
const ALINEACION_TEXT_ALIGN: Record<NonNullable<EstiloBloque['alineacion']>, React.CSSProperties['textAlign']> = {
  izquierda: 'left', centro: 'center', derecha: 'right',
};
const TAMANO_TEXTO_ESCALA: Record<NonNullable<EstiloBloque['tamanoTexto']>, number> = {
  pequeno: 0.85, normal: 1, grande: 1.25,
};
const ESQUINAS_RADIO: Record<NonNullable<EstiloBloque['esquinas']>, number> = {
  ninguna: 0, suave: 12, redondeada: radius.card, pill: radius.pill,
};
const SOMBRA_VALOR: Record<NonNullable<EstiloBloque['sombra']>, string> = {
  ninguna: 'none', suave: shadow.miniCard, marcada: shadow.card,
};

/** Color de texto de un bloque: el explícito manda, si no el de siempre. Ver
 *  el comentario de arriba sobre por qué no hay auto-contraste aquí. */
function inkDe(estilo: EstiloBloque | undefined): string { return estilo?.color ?? 'var(--portal-ink)'; }
function mutedDe(estilo: EstiloBloque | undefined): string { return estilo?.color ?? 'var(--portal-muted)'; }

function paddingDe(estilo: EstiloBloque | undefined): number {
  return ESPACIADO_PADDING[estilo?.espaciado ?? 'normal'];
}

function escalar(estilo: EstiloBloque | undefined, base: React.CSSProperties): React.CSSProperties {
  const factor = TAMANO_TEXTO_ESCALA[estilo?.tamanoTexto ?? 'normal'];
  if (factor === 1 || typeof base.fontSize !== 'number') return base;
  return { ...base, fontSize: base.fontSize * factor };
}

function contenedorDe(estilo: EstiloBloque | undefined): React.CSSProperties {
  const completo = (estilo?.ancho ?? 'completo') === 'completo';
  return {
    padding: `${paddingDe(estilo)}px ${cq(20, 3.8, 48)}`,
    margin: completo ? `0 -${cq(20, 3.8, 48)}` : '0',
    borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : (estilo?.fondo ? radius.card : undefined),
    background: estilo?.fondo ?? undefined,
    boxShadow: estilo?.sombra ? SOMBRA_VALOR[estilo.sombra] : undefined,
  };
}

/**
 * Título de sección, en el mismo serif que el resto de /reservar.
 *
 * Tamaño base NUMÉRICO (no `cq()`, que devuelve un `clamp()` en string): lo
 * exige `escalar()`, que multiplica el número por el factor de `tamanoTexto`
 * — con un string ahí el control existiría en el panel y no haría nada,
 * exactamente el "editor visual falso" que no se quiere.
 */
function TituloBloque({ texto: t, estilo }: { texto: string; estilo: EstiloBloque | undefined }) {
  return (
    <div style={{ ...escalar(estilo, { fontFamily: serif, fontSize: 26 } as React.CSSProperties), color: inkDe(estilo), marginBottom: 12, lineHeight: 1.05 }}>
      {t}
    </div>
  );
}

function BannerBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'banner' }> }) {
  const { imagenUrl, titulo, texto: cuerpo, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = href ? resolverHrefBloque(href) : null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBanner: React.CSSProperties = {
    position: 'relative', display: 'block', height: cq(220, 24, 340),
    borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : radius.hero,
    overflow: 'hidden', background: !imagenUrl && estilo?.fondo ? estilo.fondo : 'var(--portal-surface-2)',
    boxShadow: estilo?.sombra ? SOMBRA_VALOR[estilo.sombra] : shadow.hero, textDecoration: 'none',
  };
  const contenido = (
    <>
      {imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagenUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: estilo?.fondo ?? 'var(--portal-surface-2)' }} />
      )}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(94deg, rgba(34,42,30,.75) 6%, rgba(34,42,30,.45) 42%, rgba(34,42,30,.1) 72%, rgba(34,42,30,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, padding: cq(20, 2.4, 32), display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : undefined,
        textAlign: alineacion, pointerEvents: 'none',
      }}>
        {titulo && <div style={{ fontFamily: serif, fontSize: cq(24, 2.8, 34), color: estilo?.color ?? '#fff', maxWidth: 420, lineHeight: 1.05 }}>{titulo}</div>}
        {cuerpo && <div style={{ fontFamily: sans, fontSize: cq(13, 1.4, 15), color: estilo?.color ?? 'rgba(255,255,255,.85)', marginTop: 10 }}><TextoRico texto={cuerpo} /></div>}
      </div>
    </>
  );
  return (
    <div>
      {!resuelto ? (
        <div style={estiloBanner}>{contenido}</div>
      ) : resuelto.interno ? (
        <Link href={resuelto.valor} style={estiloBanner}>{contenido}</Link>
      ) : (
        <a href={resuelto.valor} target="_blank" rel="noopener noreferrer" style={estiloBanner}>{contenido}</a>
      )}
    </div>
  );
}

function TextoBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'texto' }> }) {
  const { titulo, texto: cuerpo } = bloque.config;
  const { estilo } = bloque;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion, maxWidth: 1280, marginInline: 'auto' }}>
      {titulo && <TituloBloque texto={titulo} estilo={estilo} />}
      {cuerpo && (
        <p style={{ ...escalar(estilo, { fontFamily: sans, fontSize: cq(14, 1.4, 17) } as React.CSSProperties), color: mutedDe(estilo), lineHeight: 1.55 }}>
          <TextoRico texto={cuerpo} />
        </p>
      )}
    </div>
  );
}

function CtaBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'cta' }> }) {
  const { titulo, textoBoton, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = resolverHrefBloque(href)!; // BloqueReservarRender ya comprobó bloqueEstaCompleto
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBoton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 52,
    padding: '0 26px', borderRadius: radius.pillBtnLg, background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
    boxShadow: shadow.ctaOscuro, textDecoration: 'none', fontFamily: sans, fontSize: 14, fontWeight: 600,
  };
  return (
    <div style={{
      ...contenedorDe(estilo), maxWidth: 1280, marginInline: 'auto',
      display: 'flex', flexDirection: 'column',
      alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : 'flex-start',
      textAlign: alineacion, gap: 14,
    }}>
      {titulo && <TituloBloque texto={titulo} estilo={estilo} />}
      {resuelto.interno ? (
        <Link href={resuelto.valor} style={estiloBoton}>{textoBoton}</Link>
      ) : (
        <a href={resuelto.valor} target="_blank" rel="noopener noreferrer" style={estiloBoton}>{textoBoton}</a>
      )}
    </div>
  );
}

function FilaFaq({ pregunta, respuesta, color }: { pregunta: string; respuesta: string; color?: string | null }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--portal-surface-2)', padding: '16px 0' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: sans }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: color ?? 'var(--portal-ink)' }}>{pregunta}</span>
        <ChevronDown size={16} color={color ?? 'var(--portal-muted)'} style={{ transform: abierta ? 'rotate(180deg)' : undefined, transition: 'transform .3s ease', flexShrink: 0 }} />
      </button>
      {abierta && <p style={{ fontFamily: sans, fontSize: 13.5, color: color ?? 'var(--portal-muted)', marginTop: 10, lineHeight: 1.55 }}>{respuesta}</p>}
    </div>
  );
}

function FaqBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'faq' }> }) {
  const { titulo, preguntas } = bloque.config;
  const { estilo } = bloque;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion, maxWidth: 1280, marginInline: 'auto' }}>
      {titulo && <TituloBloque texto={titulo} estilo={estilo} />}
      {preguntas.map((p, i) => <FilaFaq key={i} pregunta={p.pregunta} respuesta={p.respuesta} color={estilo?.color} />)}
    </div>
  );
}

function GaleriaBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'galeria' }> }) {
  const { imagenes } = bloque.config;
  const { estilo } = bloque;
  const radioImagen = estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : radius.card;
  return (
    <div style={{ ...contenedorDe(estilo), maxWidth: 1280, marginInline: 'auto' }}>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', scrollbarWidth: 'none' } as React.CSSProperties}>
        {imagenes.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i} src={img.url} alt={img.alt}
            style={{ flex: '0 0 260px', height: 190, objectFit: 'cover', borderRadius: radioImagen, background: 'var(--portal-surface-2)' }}
          />
        ))}
      </div>
    </div>
  );
}

function VideoBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'video' }> }) {
  const { titulo, url } = bloque.config;
  const { estilo } = bloque;
  const embed = resolverVideoEmbed(url)!; // BloqueReservarRender ya comprobó bloqueEstaCompleto
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion, maxWidth: 1280, marginInline: 'auto' }}>
      {titulo && <TituloBloque texto={titulo} estilo={estilo} />}
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : radius.card, overflow: 'hidden' }}>
        <iframe
          src={embed} title={titulo || 'Vídeo'} allowFullScreen
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}

function TestimoniosBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'testimonios' }> }) {
  const { titulo, testimonios } = bloque.config;
  const { estilo } = bloque;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion, maxWidth: 1280, marginInline: 'auto' }}>
      {titulo && <TituloBloque texto={titulo} estilo={estilo} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {testimonios.map((te, i) => (
          <div key={i} style={{
            flex: '1 1 280px', minWidth: 240, borderRadius: radius.card, background: 'var(--portal-surface)',
            border: '1px solid var(--portal-line)', boxShadow: shadow.miniCard, padding: 20,
          }}>
            <p style={{ fontFamily: serif, fontSize: cq(17, 1.8, 20), color: inkDe(estilo), lineHeight: 1.3 }}>&ldquo;{te.cita}&rdquo;</p>
            <p style={{ fontFamily: sans, fontSize: 12.5, color: mutedDe(estilo), marginTop: 10 }}>
              {te.autor}{te.rol ? ` · ${te.rol}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const SEPARACION_GAP: Record<NonNullable<ContenedorConfig['separacion']>, number> = {
  poca: 8, normal: 16, mucha: 28,
};

function ContenedorBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'contenedor' }>; slug: string }) {
  const { titulo, direccion, separacion, reparto } = bloque.config;
  const hijos = (bloque.hijos ?? []).filter((h) => !h.oculto);
  if (hijos.length === 0) return null;
  const fila = direccion === 'fila';
  return (
    <div style={{ ...contenedorDe(bloque.estilo), maxWidth: 1280, marginInline: 'auto' }}>
      {titulo && <TituloBloque texto={titulo} estilo={bloque.estilo} />}
      <div style={{
        display: 'flex',
        flexDirection: fila ? 'row' : 'column',
        gap: SEPARACION_GAP[separacion ?? 'normal'],
        alignItems: fila ? 'flex-start' : 'stretch',
        flexWrap: fila ? 'wrap' : 'nowrap',
      }}>
        {hijos.map((h) => (
          <div key={h.id} style={fila ? { flex: reparto === 'ajustado' ? '0 1 auto' : '1 1 260px', minWidth: 0 } : undefined}>
            <BloqueReservarRender bloque={h} slug={slug} />
          </div>
        ))}
      </div>
    </div>
  );
}

const RENDER_BLOQUES: Record<BloqueTipoCatalogo, ComponentType<PropsBloqueRender>> = {
  banner: paraKind<'banner'>(BannerBloque),
  texto: paraKind<'texto'>(TextoBloque),
  cta: paraKind<'cta'>(CtaBloque),
  faq: paraKind<'faq'>(FaqBloque),
  galeria: paraKind<'galeria'>(GaleriaBloque),
  video: paraKind<'video'>(VideoBloque),
  testimonios: paraKind<'testimonios'>(TestimoniosBloque),
  contenedor: paraKind<'contenedor'>(ContenedorBloque),
};

/** Mismas dos guardas que el portal: kind desconocido y contenido insuficiente
 *  no pintan nada, en vez de reventar la página pública de un estudio. */
export function BloqueReservarRender({ bloque, slug }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; slug: string }) {
  const Render = RENDER_BLOQUES[bloque.kind];
  if (!Render) return null;
  if (!bloqueEstaCompleto(bloque)) return null;
  return <Render bloque={bloque} slug={slug} />;
}
