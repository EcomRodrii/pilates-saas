import Link from 'next/link';
import { G2_NOTA, G2_URL } from '@/lib/seo/g2';
import { ACC, ACC_SOFT, DARK, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { ComparativaBreadcrumb, FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';
import { ID_ORGANIZACION } from '@/components/OrganizationStructuredData';
import { LEGAL } from '@/lib/legal-info';

export type Verdict = 'yes' | 'no' | 'partial';

function Mark({ v, label }: { v: Verdict; label: string }) {
  const color = v === 'yes' ? '#3F8A6C' : v === 'no' ? '#B8472F' : '#A9801F';
  const symbol = v === 'yes' ? '✓' : v === 'no' ? '✗' : '≈';
  const lectura = v === 'yes' ? 'Sí' : v === 'no' ? 'No' : 'En parte';
  return <><span style={{ color, fontWeight: 800 }} aria-label={lectura}>{symbol}</span> {label}</>;
}

// La nota pública de G2 (lib/seo/g2.ts): se enseña porque cualquiera puede comprobarla.

/**
 * Lo que distingue a Tentare frente a cualquiera de la lista. Solo cosas que el
 * producto hace hoy. «Pilates y yoga», no «solo Pilates»: desde el 6-oct-2026 el
 * producto se presenta para las dos disciplinas (decisión del fundador).
 */
const POR_QUE = [
  { titulo: 'Pensado para Pilates y yoga', texto: 'Plaza por reformer, plazas fijas, bonos y lista de espera pensados para tu estudio, no para un gimnasio.' },
  { titulo: 'Si falla una instructora, Tentare la cubre', texto: 'Busca sustituta, la contacta y avisa a tus alumnas. Sin llamadas ni grupos de WhatsApp.' },
  { titulo: 'Cobras tú, sin comisión', texto: 'Tarjeta y SEPA directos a tu cuenta con Stripe. Tentare no se queda nada de cada cobro.' },
];

/** La columna de Tentare del resumen: la misma en las trece comparativas. */
const TENTARE_RESUMEN = {
  queEs: 'Software de gestión para estudios de Pilates y yoga, hecho en España',
  precio: 'Desde 29 €/mes con IVA, precio publicado',
  permanencia: 'Sin permanencia: mes a mes',
  prueba: '7 días gratis, sin tarjeta',
};

export type ComparativaRow = { feature: string; tentare: [Verdict, string]; them: [Verdict, string] };

/**
 * El «en resumen» de cada comparativa: lo que alguien que busca «¿merece la pena
 * X?» quiere saber antes de leer nada más. Todo lo del competidor sale de su web
 * pública (la misma revisión que la tabla), nunca de lo que «se dice».
 */
export interface ResumenCompetidor {
  /** Qué es, con sus propias palabras cuando las hay. Una línea. */
  queEs: string;
  precio: string;
  permanencia: string;
  /** Su prueba gratuita. Es la cuarta fila salvo que haya `destacado`. */
  prueba?: string;
  /**
   * La cuarta fila cuando la prueba no es lo que más distingue a Tentare frente a
   * este competidor (p. ej. uno con un mes de prueba, pero sin app con su marca
   * salvo en el plan más caro). Mismo criterio que la tabla: se elige qué se
   * compara, nunca se falsea lo comparado.
   */
  destacado?: { etiqueta: string; suyo: string; nuestro: string };
  /** La respuesta directa a «¿merece la pena X para un estudio de Pilates?». 40-70 palabras. */
  respuesta: React.ReactNode;
}

/** Un bloque de análisis propio de este competidor: su h2 y su texto. */
export interface SeccionAnalisis {
  titulo: string;
  cuerpo: React.ReactNode;
}

// Página 1-vs-1 en /comparativa/tentare-vs-X. Comparte estructura y estilos con
// app/comparativa/page.tsx (la tabla general), pero enfrenta el logo real de
// cada competidor al nuestro — logos descargados de la propia web pública de
// cada proveedor (public/comparativa/logos/), no un placeholder de IA.
//
// Estructura (7-oct-2026): lo que busca quien escribe «bsport precios» o
// «¿merece la pena Momence?» va primero —el resumen con la respuesta y las
// cuatro cifras—, después la tabla y después el análisis propio de cada
// competidor. Antes las trece páginas compartían todo menos una frase y la
// tabla: casi 600 palabras, la mitad idénticas en todas.
export function CompetitorPage({
  name,
  slug,
  logo,
  intro,
  resumen,
  rows,
  analisis = [],
  veredicto,
  footnote,
  faq,
  ctaBody = 'Te ayudamos a traer tus datos. Sin permanencia. Sin sorpresas.',
}: {
  name: string;
  slug: string;
  logo: { src: string; alt: string; height: number; width: number; cardBg?: string };
  intro: React.ReactNode;
  resumen: ResumenCompetidor;
  rows: ComparativaRow[];
  /** Análisis propio de este competidor. Sin plantilla: cada uno tiene su punto débil. */
  analisis?: SeccionAnalisis[];
  /** Párrafo corto del veredicto final. Sintetiza `rows`, no añade datos nuevos del competidor. */
  veredicto: React.ReactNode;
  footnote: string;
  /** Preguntas que la gente hace de VERDAD sobre este competidor («¿cuánto cuesta?», «¿alternativas?»). Opcional: sin ellas no se pinta ni se declara nada. */
  faq?: { q: string; a: string }[];
  ctaBody?: string;
}) {
  const relacionadas = relacionadasDe(`/comparativa/${slug}`);
  const pagina = paginaDe(`/comparativa/${slug}`);
  // Fecha de la última revisión de los datos del competidor (del registro): se ve
  // en pantalla Y se declara en el JSON-LD. Un comparativa sin fecha es una
  // afirmación sin caducidad, y es lo primero que un buscador con IA desconfía.
  const revisada = pagina?.actualizado;
  const revisadaTexto = revisada ? new Date(`${revisada}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
  const webPageLd = pagina ? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: pagina.titulo,
    description: pagina.descripcion,
    url: `${LEGAL.url}/comparativa/${slug}`,
    inLanguage: 'es-ES',
    ...(revisada ? { dateModified: revisada } : {}),
    isPartOf: { '@id': `${LEGAL.url}/#web` },
    publisher: { '@id': ID_ORGANIZACION },
    about: { '@type': 'SoftwareApplication', name: 'Tentare', url: LEGAL.url },
    mentions: { '@type': 'SoftwareApplication', name },
  } : null;

  const filasResumen: { etiqueta: string; suyo: string; nuestro: string }[] = [
    { etiqueta: 'Qué es', suyo: resumen.queEs, nuestro: TENTARE_RESUMEN.queEs },
    { etiqueta: 'Precio', suyo: resumen.precio, nuestro: TENTARE_RESUMEN.precio },
    { etiqueta: 'Permanencia', suyo: resumen.permanencia, nuestro: TENTARE_RESUMEN.permanencia },
    resumen.destacado ?? { etiqueta: 'Prueba', suyo: resumen.prueba ?? 'No consta en su web pública', nuestro: TENTARE_RESUMEN.prueba },
  ];

  return (
    <PageShell>
      <OrganizationStructuredData />
      <ComparativaBreadcrumb slug={slug} name={`Tentare vs ${name}`} />
      {webPageLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageLd).replace(/</g, '\\u003c') }} />}
      {faq && faq.length > 0 && <FaqStructuredData items={faq} />}
      {/* La vuelta lleva a la home: quien llega aquí desde Google no viene de
          la comparativa general, y «volver» a ella no le enseña el producto. */}
      <SiteNav backHref="/" backLabel="Inicio" />

      <header className="cmp1-heroe">
        <div className="cmp1-heroe-in">
          <nav aria-label="Ruta" className="lp-mono cmp1-miga">
            <Link href="/">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/comparativa">Comparativa</Link>
            <span aria-hidden>/</span>
            <span>Tentare vs {name}</span>
          </nav>
          <div className="cmp1-logos">
            <div className="cmp1-logo">
              <LogoTentare formato="horizontal" alto={22} />
            </div>
            <span className="lp-mono cmp1-vs">vs</span>
            <div className="cmp1-logo" style={logo.cardBg ? { background: logo.cardBg } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.src} alt={logo.alt} height={logo.height} width={logo.width} style={{ height: logo.height, width: 'auto', maxWidth: 160, display: 'block' }} />
            </div>
          </div>
          <p className="cmp1-kicker"><span aria-hidden>★</span> El software Nº1 para estudios de Pilates</p>
          <h1 className="cmp1-h1">{name}: precios, funciones y la alternativa para tu estudio de Pilates</h1>
          <p className="cmp1-intro">{intro}</p>
          <div className="cmp1-ctas">
            <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--pri">Probar 7 días gratis →</Link>
            <Link href="/precios" className="cmp1-btn cmp1-btn--sec">Ver precios</Link>
          </div>
          <p className="cmp1-confianza">
            <a href={G2_URL} target="_blank" rel="noopener noreferrer"><span className="cmp1-estrellas" aria-hidden>★★★★★</span> {G2_NOTA} en G2</a>
            <span aria-hidden>·</span> Sin tarjeta <span aria-hidden>·</span> Sin permanencia
          </p>
        </div>
      </header>

      {/* El resumen: la respuesta directa primero (AEO) y las cuatro cifras
          que se comparan antes de cualquier otra cosa. `aria-label="En resumen"`
          es el mismo ancla que usan las guías de /recursos. */}
      <section className="cmp1-zona" aria-label="En resumen">
        <Reveal className="cmp1-resumen">
          <div className="cmp1-resumen-cab">
            <p className="lp-mono cmp1-etiqueta">En resumen</p>
            <h2 className="cmp1-resumen-h2">¿Merece la pena {name} para un estudio de Pilates?</h2>
            <p className="cmp1-resumen-resp">{resumen.respuesta}</p>
          </div>
          <dl className="cmp1-cifras">
            <div className="cmp1-cifras-cab" aria-hidden>
              <span />
              <span>{name}</span>
              <span className="cmp1-cifras-nuestro">Tentare</span>
            </div>
            {filasResumen.map((f) => (
              <div key={f.etiqueta} className="cmp1-cifra">
                <dt>{f.etiqueta}</dt>
                <dd><span className="cmp1-cifra-quien">{name}</span>{f.suyo}</dd>
                <dd className="cmp1-cifras-nuestro"><span className="cmp1-cifra-quien">Tentare</span>{f.nuestro}</dd>
              </div>
            ))}
          </dl>
          {revisadaTexto && <p className="lp-mono cmp1-revision">Datos de {name} revisados en su web pública el {revisadaTexto}</p>}
        </Reveal>
      </section>

      <section className="cmp1-zona">
        <div className="cmp1-porque">
          {POR_QUE.map((p, i) => (
            <Reveal key={p.titulo} delay={i * 60} className="cmp1-porque-card">
              <span className="cmp1-porque-num" aria-hidden>{i + 1}</span>
              <h2 className="cmp1-porque-titulo">{p.titulo}</h2>
              <p className="cmp1-porque-texto">{p.texto}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="cmp1-zona">
        <div className="cmp1-ancho">
          <h2 className="cmp1-h2">Tentare frente a {name}, punto por punto</h2>
          <Reveal className="cmp1-tabla-marco">
            <table className="cmp1-tabla">
              <thead>
                <tr>
                  <th scope="col">Para tu estudio</th>
                  <th scope="col" className="cmp1-th-nuestro">Tentare</th>
                  <th scope="col">{name}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.feature}>
                    <th scope="row">{r.feature}</th>
                    <td className="cmp1-td-nuestro" data-quien="Tentare"><Mark v={r.tentare[0]} label={r.tentare[1]} /></td>
                    <td data-quien={name}><Mark v={r.them[0]} label={r.them[1]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <p className="lp-mono cmp1-nota">{footnote}</p>
          <div className="cmp1-mitad">
            <p>¿Lo ves claro? Compruébalo con tu estudio: 7 días gratis, sin tarjeta.</p>
            <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--pri">Empezar gratis →</Link>
          </div>
        </div>
      </section>

      {analisis.length > 0 && (
        <section className="cmp1-zona">
          <article className="cmp1-analisis">
            {analisis.map((s) => (
              <section key={s.titulo}>
                <h2>{s.titulo}</h2>
                {s.cuerpo}
              </section>
            ))}
            <p className="cmp1-metodo">
              <strong>Cómo hacemos esta comparativa.</strong> La escribe el equipo de Tentare. De {name} solo afirmamos lo que
              consta en su web pública, con la fecha de la revisión; cuando un dato no aparece, lo decimos así, sin suponerlo.
              Si ves algo desactualizado, escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> y lo corregimos.
            </p>
          </article>
        </section>
      )}

      <section style={{ background: DARK, color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <Reveal style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <p className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', margin: '0 0 16px' }}>Nuestro veredicto</p>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(28px,4.2vw,46px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 18px', color: '#fff' }}>Tentare, el Nº1 para tu estudio de Pilates.</h2>
          <p style={{ fontSize: 'clamp(16px,1.4vw,18px)', lineHeight: 1.6, color: MUTED_DARK, margin: '0 0 28px' }}>{veredicto}</p>
          <Link href="/crear-estudio" className="cmp1-btn cmp1-btn--claro">Probar 7 días gratis →</Link>
        </Reveal>
      </section>

      {relacionadas.length > 0 && (
        <section style={{ padding: 'clamp(48px,6vw,72px) clamp(20px,4vw,44px) 0' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6B6B63', margin: '0 0 18px' }}>Sigue por aquí</h2>
            <div className="cmp1-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="cmp1-rel-card">
                  <span className="cmp1-rel-nombre">{r.etiqueta}</span>
                  <span className="cmp1-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {faq && faq.length > 0 && (
        <section style={{ padding: 'clamp(48px,6vw,72px) clamp(20px,4vw,44px) 0' }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            <h2 className="cmp1-h2" style={{ marginBottom: 12 }}>Lo que se pregunta sobre {name}</h2>
            <ArticleFaq items={faq} />
          </div>
        </section>
      )}

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Compruébalo con tu propio estudio." body={ctaBody} />
        </div>
      </section>

      <SiteFooter />

      <style>{`
        .cmp1-heroe { position: relative; padding: clamp(28px,4vw,40px) clamp(20px,4vw,44px) clamp(28px,4vw,40px); }
        .cmp1-heroe-in { max-width: 820px; margin: 0 auto; }
        .cmp1-miga { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 clamp(26px,4vw,40px);
          font-size: 11.5px; letter-spacing: .06em; color: #8A8A80; }
        .cmp1-miga a { color: #5A5A52; text-decoration: none; }
        .cmp1-miga a:hover { color: #1A1A1A; text-decoration: underline; text-underline-offset: 3px; }
        .cmp1-logos { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .cmp1-logo { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 13px 19px; display: flex;
          align-items: center; box-shadow: 0 14px 30px -18px rgba(26,26,26,.22); }
        .cmp1-vs { font-size: 13px; color: #A8A89F; }
        .cmp1-kicker { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 18px; padding: 7px 14px;
          border-radius: 999px; background: ${ACC}; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: .01em; }
        .cmp1-kicker span { color: #E3C66B; }
        .cmp1-h1 { font-weight: 800; font-size: clamp(32px,4.8vw,54px); line-height: 1.04; letter-spacing: -.034em;
          margin: 0 0 20px; text-wrap: balance; }
        .cmp1-intro { font-size: clamp(17px,1.5vw,19.5px); line-height: 1.58; color: ${MUTED}; max-width: 640px; margin: 0; }
        .cmp1-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin: 26px 0 0; }
        .cmp1-btn { display: inline-block; font-size: 16px; font-weight: 700; padding: 15px 28px; border-radius: 999px;
          text-decoration: none; transition: transform .18s ease, filter .18s ease; }
        .cmp1-btn:hover { transform: translateY(-2px); }
        .cmp1-btn--pri { background: ${ACC}; color: #fff; box-shadow: 0 14px 28px -12px rgba(52,56,37,.55); }
        .cmp1-btn--pri:hover { filter: brightness(1.12); }
        .cmp1-btn--sec { background: #fff; color: #1A1A1A; border: 1px solid #DAD9D0; }
        .cmp1-btn--claro { background: #fff; color: ${ACC}; }
        .cmp1-confianza { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 16px 0 0; font-size: 13.5px; color: ${MUTED}; }
        .cmp1-confianza a { color: #1A1A1A; font-weight: 700; text-decoration: none; }
        .cmp1-confianza a:hover { text-decoration: underline; text-underline-offset: 3px; }
        .cmp1-estrellas { color: #D9A520; letter-spacing: 1px; }

        .cmp1-zona { padding: 0 clamp(16px,4vw,44px) clamp(36px,5vw,60px); }
        .cmp1-ancho { max-width: 960px; margin: 0 auto; }
        .cmp1-h2 { font-weight: 800; font-size: clamp(24px,3vw,32px); line-height: 1.12; letter-spacing: -.024em; margin: 0 0 20px; }
        .cmp1-etiqueta { margin: 0 0 12px; font-size: 11.5px; letter-spacing: .16em; text-transform: uppercase; color: #6B6B63; }

        /* ── El resumen ───────────────────────────────────────────────── */
        .cmp1-resumen { max-width: 960px; margin: 0 auto; background: #fff; border: 1px solid #E4E4DC; border-radius: 26px;
          overflow: hidden; box-shadow: 0 40px 80px -56px rgba(26,26,26,.38); }
        .cmp1-resumen-cab { padding: clamp(24px,3.4vw,38px) clamp(22px,3.4vw,40px) clamp(20px,2.6vw,28px); }
        .cmp1-resumen-h2 { font-weight: 800; font-size: clamp(22px,2.6vw,28px); line-height: 1.15; letter-spacing: -.02em; margin: 0 0 12px; }
        .cmp1-resumen-resp { margin: 0; max-width: 70ch; font-size: 16.5px; line-height: 1.62; color: #2E2E29; }
        .cmp1-cifras { margin: 0; border-top: 1px solid #ECECE5; }
        .cmp1-cifras-cab, .cmp1-cifra { display: grid; grid-template-columns: 150px minmax(0,1fr) minmax(0,1fr); }
        .cmp1-cifras-cab span { padding: 12px clamp(14px,2vw,22px); font-size: 12px; font-weight: 700; color: #5A5A52; background: #F6F6F2; }
        .cmp1-cifras-cab .cmp1-cifras-nuestro { color: #fff; background: ${ACC}; }
        .cmp1-cifra { border-top: 1px solid #ECECE5; }
        .cmp1-cifra dt { padding: 15px clamp(14px,2vw,22px); font-size: 13px; font-weight: 700; color: #1A1A1A; }
        .cmp1-cifra dd { margin: 0; padding: 15px clamp(14px,2vw,22px); font-size: 14px; line-height: 1.45; color: #4A4A43; }
        .cmp1-cifra dd.cmp1-cifras-nuestro { background: #F6F7EF; color: #1A1A1A; font-weight: 600; }
        .cmp1-cifra-quien { display: none; }
        .cmp1-revision { margin: 0; padding: 14px clamp(22px,3.4vw,40px); font-size: 11.5px; color: #6B6B63; border-top: 1px solid #ECECE5; background: #FBFBF8; }
        @media (max-width: 680px) {
          .cmp1-cifras-cab { display: none; }
          .cmp1-cifra { grid-template-columns: 1fr 1fr; }
          .cmp1-cifra dt { grid-column: 1 / -1; padding-bottom: 4px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #6B6B63; }
          .cmp1-cifra dd { padding-top: 6px; font-size: 13.5px; }
          .cmp1-cifra-quien { display: block; margin-bottom: 3px; font-size: 11.5px; font-weight: 800; color: #1A1A1A; }
        }

        /* ── Por qué ─────────────────────────────────────────────────── */
        .cmp1-porque { max-width: 960px; margin: 0 auto; display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .cmp1-porque-card { background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 22px;
          box-shadow: 0 20px 40px -34px rgba(26,26,26,.35); }
        .cmp1-porque-num { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
          border-radius: 50%; background: ${ACC_SOFT}; color: ${ACC}; font-weight: 800; font-size: 14px; margin-bottom: 12px; }
        .cmp1-porque-titulo { font-size: 17px; font-weight: 800; letter-spacing: -.01em; line-height: 1.25; margin: 0 0 8px; color: #1A1A1A; }
        .cmp1-porque-texto { font-size: 14px; line-height: 1.55; color: ${MUTED}; margin: 0; }
        @media (max-width: 760px) { .cmp1-porque { grid-template-columns: 1fr; } }

        /* ── La tabla: en el móvil cada fila es una tarjeta, sin scroll lateral ── */
        .cmp1-tabla-marco { background: #fff; border: 1px solid #E7E7E0; border-radius: 22px; overflow: hidden;
          box-shadow: 0 30px 60px -44px rgba(26,26,26,.3); }
        .cmp1-tabla { width: 100%; border-collapse: separate; border-spacing: 0; }
        .cmp1-tabla thead th { text-align: left; padding: 16px 18px; font-size: 12.5px; font-weight: 700; color: #5A5A52;
          background: #F5F5F1; border-bottom: 1px solid #E7E7E0; }
        .cmp1-tabla thead th:first-child { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #6B6B63; width: 26%; }
        .cmp1-tabla thead .cmp1-th-nuestro { color: #fff; background: ${ACC}; border-bottom-color: ${ACC}; font-weight: 800; font-size: 13px; }
        .cmp1-tabla tbody th { text-align: left; padding: 15px 18px; font-size: 14px; font-weight: 600; vertical-align: top; }
        .cmp1-tabla td { padding: 15px 16px; font-size: 13px; line-height: 1.5; color: #5A5A52; vertical-align: top; }
        .cmp1-tabla .cmp1-td-nuestro { color: #1A1A1A; background: #F7F8F1; }
        .cmp1-tabla tbody tr + tr > * { border-top: 1px solid #EDEDE6; }
        @media (max-width: 680px) {
          .cmp1-tabla, .cmp1-tabla tbody, .cmp1-tabla tr, .cmp1-tabla th, .cmp1-tabla td { display: block; width: auto; }
          .cmp1-tabla thead { display: none; }
          .cmp1-tabla tbody tr { padding: 16px 18px; }
          .cmp1-tabla tbody tr + tr > * { border-top: 0; }
          .cmp1-tabla tbody tr + tr { border-top: 1px solid #EDEDE6; }
          .cmp1-tabla tbody th { padding: 0 0 10px; font-size: 15px; }
          .cmp1-tabla td { padding: 10px 12px; border-radius: 12px; background: #F6F6F2; }
          .cmp1-tabla .cmp1-td-nuestro { background: #EEF0E2; box-shadow: inset 3px 0 0 ${ACC}; }
          .cmp1-tabla td::before { content: attr(data-quien); display: block; margin-bottom: 2px; font-size: 11.5px; font-weight: 800; color: #1A1A1A; }
          .cmp1-tabla td + td { margin-top: 6px; }
        }
        .cmp1-nota { font-size: 11px; color: #6B6B63; margin: 16px 4px 0; line-height: 1.6; }
        .cmp1-mitad { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;
          margin: 28px 0 0; padding: 20px 24px; border-radius: 18px; background: ${ACC_SOFT}; border: 1px solid #E0E3D2; }
        .cmp1-mitad p { margin: 0; font-size: 16px; font-weight: 700; color: #1A1A1A; }

        /* ── Análisis: columna de lectura ────────────────────────────── */
        .cmp1-analisis { max-width: 700px; margin: 0 auto; }
        .cmp1-analisis > section { margin: 0 0 clamp(36px,5vw,52px); }
        .cmp1-analisis h2 { font-weight: 800; font-size: clamp(24px,3vw,31px); line-height: 1.14; letter-spacing: -.022em; margin: 0 0 14px; }
        .cmp1-analisis h3 { font-size: 18px; font-weight: 750; letter-spacing: -.01em; margin: 22px 0 6px; }
        .cmp1-analisis p, .cmp1-analisis li { font-size: 17px; line-height: 1.68; color: #2E2E29; }
        .cmp1-analisis p { margin: 0 0 14px; }
        .cmp1-analisis ul { margin: 0 0 14px; padding-left: 20px; }
        .cmp1-analisis li { margin: 0 0 6px; }
        .cmp1-analisis a { color: ${ACC}; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
        .cmp1-metodo { margin: 0; padding: 14px 0 0 16px; border-left: 2px solid #D5D7C6; font-size: 14.5px !important; line-height: 1.6 !important; color: #5A5A52 !important; }

        @media (prefers-reduced-motion: reduce) { .cmp1-btn { transition: none; } }
        .cmp1-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .cmp1-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .cmp1-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .cmp1-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
        .cmp1-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
        @media (max-width: 760px) { .cmp1-rel { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .cmp1-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
