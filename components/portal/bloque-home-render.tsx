'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { display, escala, texto, radio, altura, sombra, transicion, dur } from '@/lib/portal-design';
import { coloresDe } from '@/lib/theme/superficie';
import { resolverHrefBloque, resolverVideoEmbed, bloqueEstaCompleto, type BloqueHome, type BloqueTipoCatalogo, type EstiloBloque, type ContenedorConfig } from '@/lib/portal-home-bloques';
import { paraKind, type PropsBloqueRender } from '@/components/portal/bloques/registro-render';
import { TextoRico } from './texto-rico';
import { usePortalHref } from '@/components/portal/portal-preview-bridge';

/**
 * Los neutros de los bloques del catálogo, del kit (`--ap-*`) y no de
 * `useModo()`. Mismos nombres que los del tema a propósito: el diff es el
 * cambio de ORIGEN del color, no una reescritura de cada `style`.
 *
 * `hero` era un degradado crema de tres paradas del tema; el kit no tiene
 * equivalente (sus superficies son planas), así que pasa a la pill neutra —
 * que es lo que el kit usa para un bloque sin imagen.
 */
/** Radio de tarjeta del kit (`.ap-card` = 16). Ver el comentario largo en
 *  components/portal/portal-home-view.tsx. */
const RADIO_TARJETA = 16;

const T = {
  surface: 'var(--ap-card, #FFFFFF)',
  surface2: 'var(--ap-pill, #EFEDE4)',
  ink: 'var(--ap-tinta, #1A1A1A)',
  muted: 'var(--ap-sec, #5A5A52)',
  muted2: 'var(--ap-sec, #5A5A52)',
  line: 'var(--ap-borde, #E5E3DA)',
  hero: 'var(--ap-pill, #EFEDE4)',
} as const;

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
// Escala de tamaño de texto — multiplica el `fontSize` de los tokens de
// portal-design.ts en vez de inventar tallas nuevas sueltas.
const TAMANO_TEXTO_ESCALA: Record<NonNullable<EstiloBloque['tamanoTexto']>, number> = {
  pequeno: 0.85, normal: 1, grande: 1.25,
};
// Esquinas: `redondeada`/`pill` indexan radio.* ya existente; `ninguna`/`suave`
// son la granularidad extra que faltaba entre "recto" y "tarjeta".
const ESQUINAS_RADIO: Record<NonNullable<EstiloBloque['esquinas']>, number> = {
  ninguna: 0, suave: 12, redondeada: RADIO_TARJETA, pill: radio.pill,
};
const SOMBRA_VALOR: Record<NonNullable<EstiloBloque['sombra']>, string> = {
  ninguna: 'none', suave: sombra.cardSemana, marcada: sombra.cardInterna,
};

/** Padding vertical del bloque según su `espaciado` (normal = el de siempre). */
function paddingDe(estilo: EstiloBloque | undefined): number {
  return ESPACIADO_PADDING[estilo?.espaciado ?? 'normal'];
}

/** Escala un estilo con `fontSize` numérico según `tamanoTexto` (normal = sin cambios). */
function escalar(estilo: EstiloBloque | undefined, base: React.CSSProperties): React.CSSProperties {
  const factor = TAMANO_TEXTO_ESCALA[estilo?.tamanoTexto ?? 'normal'];
  if (factor === 1 || typeof base.fontSize !== 'number') return base;
  return { ...base, fontSize: base.fontSize * factor };
}

/**
 * Estilo común del "contenedor tarjeta" que comparten texto/cta/faq/galería/
 * vídeo/testimonios: padding por espaciado, ancho completo (full-bleed,
 * `margin: 0 -16px`, el de siempre) o contenido, fondo/esquinas/sombra
 * propios. Banner no lo usa: ya tiene su propia geometría fija de imagen.
 */
function contenedorDe(estilo: EstiloBloque | undefined): React.CSSProperties {
  const completo = (estilo?.ancho ?? 'completo') === 'completo';
  return {
    padding: `${paddingDe(estilo)}px 16px`,
    margin: completo ? '0 -16px' : '0',
    borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : (estilo?.fondo ? RADIO_TARJETA : undefined),
    background: estilo?.fondo ?? undefined,
    boxShadow: estilo?.sombra ? SOMBRA_VALOR[estilo.sombra] : undefined,
  };
}

function BannerBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'banner' }>; slug: string }) {
  const portalHref = usePortalHref();
  const { imagenUrl, titulo, texto: cuerpo, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = href ? resolverHrefBloque(href) : null;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBanner: React.CSSProperties = {
    position: 'relative', display: 'block', height: altura.banner,
    borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : radio.banner,
    // El fondo propio solo tiene sentido SIN imagen — con foto, la imagen ya
    // ocupa todo el bloque y un color detrás nunca se vería.
    overflow: 'hidden', background: !imagenUrl && estilo?.fondo ? estilo.fondo : T.surface2,
    boxShadow: estilo?.sombra ? SOMBRA_VALOR[estilo.sombra] : sombra.banner, textDecoration: 'none',
    transition: transicion(['transform'], dur.card),
  };
  const contenido = (
    <>
      {imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagenUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: estilo?.fondo ?? T.hero }} />
      )}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(94deg, rgba(246,244,239,.97) 6%, rgba(246,244,239,.88) 42%, rgba(246,244,239,.35) 72%, rgba(246,244,239,.06) 100%)',
      }} />
      <div style={{
        position: 'absolute', inset: 0, padding: '26px 24px', display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : undefined,
        textAlign: alineacion, pointerEvents: 'none',
      }}>
        {titulo && <div style={{ ...escalar(estilo, display(29, true, 1.12)), color: coloresDe(estilo, T).ink, maxWidth: 220, textWrap: 'pretty' } as React.CSSProperties}>{titulo}</div>}
        {cuerpo && <div style={{ ...escalar(estilo, texto.nota), color: coloresDe(estilo, { ink: T.ink, muted: T.muted }).muted, marginTop: 12 }}><TextoRico texto={cuerpo} /></div>}
      </div>
    </>
  );
  return (
    <div>
      <div style={{ height: 18 }} />
      {!resuelto ? (
        <div style={estiloBanner}>{contenido}</div>
      ) : resuelto.interno ? (
        <Link href={portalHref(`/${slug}${resuelto.valor}`)} style={estiloBanner}>{contenido}</Link>
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
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion }}>
      {titulo && <div style={{ ...escalar(estilo, display(24)), color: coloresDe(estilo, T).ink, marginBottom: 8 }}>{titulo}</div>}
      {cuerpo && <p style={{ ...escalar(estilo, texto.meta), color: coloresDe(estilo, { ink: T.ink, muted: T.muted2 }).muted, lineHeight: 1.55 }}><TextoRico texto={cuerpo} /></p>}
    </div>
  );
}

function CtaBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'cta' }>; slug: string }) {
  const portalHref = usePortalHref();
  const { titulo, textoBoton, href } = bloque.config;
  const { estilo } = bloque;
  const resuelto = resolverHrefBloque(href)!; // BloqueHomeRender ya comprobó completoSi
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  const estiloBoton: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: altura.botonCta,
    padding: '0 22px', borderRadius: radio.botonCta, background: 'var(--portal-brand)', color: T.surface,
    boxShadow: sombra.cta, textDecoration: 'none', ...texto.botonCta,
  };
  return (
    <div style={{
      ...contenedorDe(estilo),
      display: 'flex', flexDirection: 'column',
      alignItems: alineacion === 'center' ? 'center' : alineacion === 'right' ? 'flex-end' : 'flex-start',
      textAlign: alineacion, gap: 12,
    }}>
      {titulo && <div style={{ ...escalar(estilo, display(24)), color: coloresDe(estilo, T).ink }}>{titulo}</div>}
      {resuelto.interno ? (
        <Link href={portalHref(`/${slug}${resuelto.valor}`)} style={estiloBoton}>{textoBoton}</Link>
      ) : (
        <a href={resuelto.valor} target="_blank" rel="noopener noreferrer" style={estiloBoton}>{textoBoton}</a>
      )}
    </div>
  );
}

function FilaFaq({ pregunta, respuesta, color }: { pregunta: string; respuesta: string; color?: string | null }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, padding: '14px 0' }}>
      <button
        onClick={() => setAbierta((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ ...texto.metaFuerte, color: color ?? T.ink }}>{pregunta}</span>
        <ChevronDown size={16} color={color ?? T.muted} style={{ transform: abierta ? 'rotate(180deg)' : undefined, transition: transicion(['transform'], dur.color), flexShrink: 0 }} />
      </button>
      {abierta && <p style={{ ...texto.meta, color: color ?? T.muted2, marginTop: 10, lineHeight: 1.5 }}>{respuesta}</p>}
    </div>
  );
}

function FaqBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'faq' }> }) {
  const { titulo, preguntas } = bloque.config;
  const { estilo } = bloque;
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion }}>
      {titulo && <div style={{ ...escalar(estilo, display(24)), color: coloresDe(estilo, T).ink, marginBottom: 4 }}>{titulo}</div>}
      {preguntas.map((p, i) => <FilaFaq key={i} pregunta={p.pregunta} respuesta={p.respuesta} color={estilo?.color} />)}
    </div>
  );
}

function GaleriaBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'galeria' }> }) {
  const { imagenes } = bloque.config;
  const { estilo } = bloque;
  const radioImagen = estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : RADIO_TARJETA;
  return (
    <div style={contenedorDe(estilo)}>
      {/* Mismo patrón que "Esta semana" en portal-home-view.tsx: flex +
          overflow-x + gap, SIN scroll-snap (se come la sangría inicial). */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', margin: '0 -16px', padding: '0 16px', scrollbarWidth: 'none' } as React.CSSProperties}>
        {imagenes.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i} src={img.url} alt={img.alt}
            style={{ flex: '0 0 220px', height: 160, objectFit: 'cover', borderRadius: radioImagen, background: T.surface2 }}
          />
        ))}
      </div>
    </div>
  );
}

function VideoBloque({ bloque }: { bloque: Extract<BloqueHome, { kind: 'video' }> }) {
  const { titulo, url } = bloque.config;
  const { estilo } = bloque;
  const embed = resolverVideoEmbed(url)!; // BloqueHomeRender ya comprobó completoSi
  const alineacion = estilo?.alineacion ? ALINEACION_TEXT_ALIGN[estilo.alineacion] : undefined;
  return (
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion }}>
      {titulo && <div style={{ ...escalar(estilo, display(24)), color: coloresDe(estilo, T).ink, marginBottom: 12 }}>{titulo}</div>}
      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: estilo?.esquinas ? ESQUINAS_RADIO[estilo.esquinas] : RADIO_TARJETA, overflow: 'hidden' }}>
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
    <div style={{ ...contenedorDe(estilo), textAlign: alineacion }}>
      {titulo && <div style={{ ...escalar(estilo, display(24)), color: coloresDe(estilo, T).ink, marginBottom: 12 }}>{titulo}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {testimonios.map((te, i) => (
          <div key={i} style={{ borderTop: i > 0 ? `1px solid ${T.line}` : undefined, paddingTop: i > 0 ? 18 : 0 }}>
            <p style={{ ...escalar(estilo, display(19, true, 1.2)), color: coloresDe(estilo, T).ink, textWrap: 'pretty' } as React.CSSProperties}>“{te.cita}”</p>
            <p style={{ ...escalar(estilo, texto.nota), color: coloresDe(estilo, { ink: T.ink, muted: T.muted }).muted, marginTop: 8 }}>
              {te.autor}{te.rol ? ` · ${te.rol}` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Qué componente pinta cada bloque. La clave es el `kind` persistido, la misma
 * que la de `REGISTRO_BLOQUES`.
 *
 * Que los dos conjuntos coincidan lo garantiza el COMPILADOR, no un test: los
 * dos son `Record<…>` sobre el mismo tipo derivado de `BloqueHome['kind']`, así
 * que dejarse uno no compila. (Antes aquí ponía que había un test; no lo había
 * — ver la nota de `bloques/registro-render.ts`.)
 */
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

export { RENDER_BLOQUES };

const SEPARACION_GAP: Record<NonNullable<ContenedorConfig['separacion']>, number> = {
  poca: 8, normal: 16, mucha: 28,
};

/**
 * Grupo: coloca a sus hijos en fila o en columna. Es el primer bloque del
 * portal que usa el anidamiento — el mecanismo llevaba varias PRs construido y
 * sin un solo consumidor.
 *
 * Los hijos se pintan con `BloqueHomeRender`, el MISMO camino que los bloques
 * de primer nivel: así un hijo hereda por construcción la guarda de kind
 * desconocido y el gate de "¿tiene contenido?", sin repetir ninguna de las
 * dos aquí.
 */
function ContenedorBloque({ bloque, slug }: { bloque: Extract<BloqueHome, { kind: 'contenedor' }>; slug: string }) {
  const { titulo, direccion, separacion, reparto } = bloque.config;
  const hijos = (bloque.hijos ?? []).filter((h) => !h.oculto);
  // Un grupo vacío no deja un hueco con su padding en el portal de la socia.
  if (hijos.length === 0) return null;
  const fila = direccion === 'fila';
  return (
    <div style={contenedorDe(bloque.estilo)}>
      {titulo && (
        <h2 style={{ ...display(escala('seccion', 24)), color: coloresDe(bloque.estilo, T).ink, marginBottom: 12 }}>
          {titulo}
        </h2>
      )}
      <div style={{
        display: 'flex',
        flexDirection: fila ? 'row' : 'column',
        gap: SEPARACION_GAP[separacion ?? 'normal'],
        alignItems: fila ? 'flex-start' : 'stretch',
      }}>
        {hijos.map((h) => (
          // `flex: 1 1 0` reparte a partes iguales; `0 1 auto` deja que cada
          // hijo ocupe lo suyo. En columna no aplica ninguno de los dos.
          <div key={h.id} style={fila ? { flex: reparto === 'ajustado' ? '0 1 auto' : '1 1 0%', minWidth: 0 } : undefined}>
            <BloqueHomeRender bloque={h} slug={slug} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BloqueHomeRender({ bloque, slug }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; slug: string }) {
  // Antes esto era una cadena de `if` que terminaba en `return
  // <TestimoniosBloque>` SIN guarda: un kind inesperado leía
  // `config.testimonios.map` de una config que no lo tiene y se llevaba por
  // delante la pantalla entera de la socia. Buscar en el registro y devolver
  // null si no está mata esa clase de fallo por construcción.
  const Render = RENDER_BLOQUES[bloque.kind];
  if (!Render) return null;
  // El "¿tiene contenido suficiente?" se comprueba UNA vez aquí y no siete
  // veces repartidas por los componentes. Es la misma condición que usa el
  // gate de "antes de publicar" del editor, así que lo que la propietaria ve
  // avisado ahí es exactamente lo que no se pinta aquí.
  if (!bloqueEstaCompleto(bloque)) return null;
  return <Render bloque={bloque} slug={slug} />;
}
