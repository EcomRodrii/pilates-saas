import Image from 'next/image';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { PildoraBusqueda } from '@/components/recursos/PildoraBusqueda';
import { PLANES, PLAN_INFO, TRIAL_DIAS } from '@/lib/billing/entitlements';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de las páginas por tipo de estudio (/soluciones/*), 7-oct-2026.
//
// Antes cada solución era una columna de texto de 640 px con una lista y dos
// cajas: se leía como un artículo, no como la página de un producto (≈ 500
// palabras, sin una sola pantalla del producto). Estas piezas montan la página
// como la de un SaaS serio —portada con foto real, la respuesta directa arriba,
// filas con capturas reales del producto, una herramienta útil, planes y
// preguntas—, con la tipografía y la paleta de las demás páginas públicas.
//
// Reglas que no se rompen aquí:
//  · Solo capturas REALES de /public/producto y fotos con crédito (fotos.ts).
//  · Cada frase de producto está en el código o ya publicada en su página de
//    funcionalidad; lo que no hace, no se insinúa.
//  · Un solo h1 por página; el h2 de cada bloque dice de qué trata (lo leen
//    Google y los buscadores con IA).
// ─────────────────────────────────────────────────────────────────────────────

export function SolucionShell({ path, children }: { path: string; children: React.ReactNode }) {
  const pagina = paginaDe(path);
  const relacionadas = relacionadasDe(path);
  // Migas: Inicio › Soluciones › esta página (la visible y la del JSON-LD dicen lo mismo).
  const migasLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: urlDe('/') },
      { '@type': 'ListItem', position: 2, name: 'Soluciones', item: urlDe('/soluciones') },
      { '@type': 'ListItem', position: 3, name: pagina?.etiqueta ?? '', item: urlDe(path) },
    ],
  };
  return (
    <PageShell>
      <OrganizationStructuredData />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(migasLd).replace(/</g, '\\u003c') }} />
      <SiteNav backHref="/soluciones" backLabel="Soluciones" />
      {children}
      {relacionadas.length > 0 && (
        <section className="sol-banda">
          <div className="sol-ancho">
            <p className="lp-mono sol-eyebrow">Sigue por aquí</p>
            <div className="sol-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="sol-rel-card">
                  <span className="sol-rel-nombre">{r.etiqueta}</span>
                  <span className="sol-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <SiteFooter />
      <EstilosSolucion />
    </PageShell>
  );
}

/** Portada: texto a la izquierda, foto real con dos avisos de ejemplo a la derecha. */
export function HeroSolucion({
  miga,
  busqueda,
  titular,
  entrada,
  foto,
  avisos = [],
  pieFoto,
}: {
  miga: string;
  busqueda: string;
  titular: React.ReactNode;
  entrada: React.ReactNode;
  foto: { src: string; srcAvif?: string; alt: string; ancho: number; alto: number; encuadre?: string };
  /** Avisos de ejemplo encima de la foto (decorativos: se describen en `pieFoto`). */
  avisos?: { etiqueta: string; estado: string; texto: string }[];
  /** Descripción para lectores de pantalla de lo que muestran los avisos. */
  pieFoto: string;
}) {
  return (
    <header className="sol-heroe">
      <div className="sol-heroe-in">
        <div className="sol-heroe-texto">
          <nav aria-label="Ruta" className="lp-mono sol-miga">
            <Link href="/">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/soluciones">Soluciones</Link>
            <span aria-hidden>/</span>
            <span>{miga}</span>
          </nav>
          <h1 className="sol-h1">
            <PildoraBusqueda>{busqueda}</PildoraBusqueda>
            {titular}
          </h1>
          <p className="sol-entrada">{entrada}</p>
          <div className="sol-acciones">
            <Link href="/crear-estudio" className="sol-cta">Probar {TRIAL_DIAS} días gratis</Link>
            <Link href="/precios" className="sol-cta-2">Ver precios →</Link>
          </div>
          <p className="sol-confianza">
            <span><Check size={15} strokeWidth={2.6} aria-hidden /> Sin tarjeta</span>
            <span><Check size={15} strokeWidth={2.6} aria-hidden /> Sin permanencia</span>
            <span><Check size={15} strokeWidth={2.6} aria-hidden /> Desde {PLAN_INFO.BASE.precioMes} €/mes con IVA</span>
          </p>
        </div>
        <figure className="sol-heroe-escena">
          <div className="sol-heroe-foto">
            <picture>
              {foto.srcAvif && <source type="image/avif" srcSet={foto.srcAvif} />}
              <img src={foto.src} alt={foto.alt} width={foto.ancho} height={foto.alto} fetchPriority="high" decoding="async" style={{ objectPosition: foto.encuadre ?? 'center' }} />
            </picture>
          </div>
          {avisos.length > 0 && (
            <div className="sol-avisos" aria-hidden="true">
              {avisos.map((a, i) => (
                <div key={a.texto} className={`sol-aviso sol-aviso-${i + 1}`}>
                  <span className="sol-aviso-fila">
                    <span className="sol-aviso-etiqueta">{a.etiqueta}</span>
                    <span className="sol-aviso-estado">{a.estado}</span>
                  </span>
                  <span className="sol-aviso-texto">{a.texto}</span>
                </div>
              ))}
            </div>
          )}
          <figcaption className="sol-oculto">{pieFoto}</figcaption>
        </figure>
      </div>
    </header>
  );
}

/** La respuesta directa (AEO): la pregunta que se busca y su respuesta en un párrafo, arriba del todo. */
export function ResumenSolucion({ pregunta, children, datos }: { pregunta: string; children: React.ReactNode; datos?: { cifra: string; texto: string }[] }) {
  return (
    <section className="sol-zona" aria-label="En resumen">
      {/* Sin Reveal: es la respuesta directa, justo bajo la portada; no debe
          estar ni un instante invisible. */}
      <div className="sol-resumen">
        <p className="lp-mono sol-eyebrow">En resumen</p>
        <h2 className="sol-resumen-h2">{pregunta}</h2>
        <p className="sol-resumen-p">{children}</p>
        {datos && datos.length > 0 && (
          <dl className="sol-datos">
            {datos.map((d) => (
              <div key={d.texto}>
                <dt>{d.cifra}</dt>
                <dd>{d.texto}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

/** Tres situaciones del día a día que la página resuelve. */
export function Situaciones({ titulo, items }: { titulo: string; items: { hora: string; titulo: string; texto: React.ReactNode }[] }) {
  return (
    <section className="sol-zona">
      <div className="sol-ancho">
        <h2 className="sol-h2">{titulo}</h2>
        <div className="sol-situaciones">
          {items.map((it, i) => (
            <Reveal key={it.titulo} delay={i * 60} className="sol-situacion">
              <p className="lp-mono sol-situacion-hora">{it.hora}</p>
              <h3>{it.titulo}</h3>
              <p>{it.texto}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Una fila de producto: texto y una captura real, alternando lados. */
export function FilaProducto({
  eyebrow,
  titulo,
  children,
  puntos = [],
  enlace,
  captura,
  invertida = false,
}: {
  eyebrow: string;
  titulo: string;
  children: React.ReactNode;
  puntos?: React.ReactNode[];
  enlace?: { href: string; texto: string };
  captura: { src: string; alt: string; ancho: number; alto: number; movil?: boolean; foto?: boolean; pie?: string };
  invertida?: boolean;
}) {
  return (
    <section className="sol-zona">
      <div className={`sol-fila${invertida ? ' sol-fila-inv' : ''}`}>
        <div className="sol-fila-texto">
          <p className="lp-mono sol-eyebrow">{eyebrow}</p>
          <h2 className="sol-h2">{titulo}</h2>
          <div className="sol-prosa">{children}</div>
          {puntos.length > 0 && (
            <ul className="sol-puntos">
              {puntos.map((p, i) => (
                <li key={i}><Check size={16} strokeWidth={2.6} aria-hidden />{p}</li>
              ))}
            </ul>
          )}
          {enlace && <Link href={enlace.href} className="sol-enlace lp-flecha">{enlace.texto} <span aria-hidden>→</span></Link>}
        </div>
        <Reveal className={captura.movil ? 'sol-captura sol-captura-movil' : captura.foto ? 'sol-captura sol-captura-foto' : 'sol-captura'}>
          <figure>
            <Image src={captura.src} alt={captura.alt} width={captura.ancho} height={captura.alto} sizes={captura.movil || captura.foto ? '(max-width: 900px) 70vw, 340px' : '(max-width: 900px) 94vw, 620px'} />
            {captura.pie && <figcaption className="lp-mono">{captura.pie}</figcaption>}
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

/** Banda oscura con una herramienta (la calculadora) o un bloque destacado. */
export function BandaOscura({ eyebrow, titulo, children, lado }: { eyebrow: string; titulo: string; children: React.ReactNode; lado: React.ReactNode }) {
  return (
    <section className="sol-oscura">
      <div className="sol-oscura-in">
        <div className="sol-oscura-texto">
          <p className="lp-mono sol-eyebrow sol-eyebrow-claro">{eyebrow}</p>
          <h2 className="sol-h2 sol-h2-claro">{titulo}</h2>
          <div className="sol-prosa sol-prosa-clara">{children}</div>
        </div>
        <div>{lado}</div>
      </div>
    </section>
  );
}

/** Tabla sencilla que en el móvil pasa a tarjetas (sin scroll lateral). */
export function TablaSolucion({ titulo, intro, cabeceras, filas }: { titulo: string; intro?: React.ReactNode; cabeceras: [string, string, string]; filas: [string, string, string][] }) {
  return (
    <section className="sol-zona">
      <div className="sol-ancho sol-ancho-estrecho">
        <h2 className="sol-h2">{titulo}</h2>
        {intro && <div className="sol-prosa">{intro}</div>}
        <table className="sol-tabla">
          <thead><tr>{cabeceras.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f[0]}>
                <th scope="row">{f[0]}</th>
                <td data-col={cabeceras[1]}>{f[1]}</td>
                <td data-col={cabeceras[2]}>{f[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Los tres planes, con el precio de lib/billing (nunca escrito a mano). */
export function PlanesSolucion({ titulo, nota }: { titulo: string; nota?: string }) {
  return (
    <section className="sol-zona">
      <div className="sol-ancho">
        <h2 className="sol-h2">{titulo}</h2>
        <div className="sol-planes">
          {PLANES.map((p) => (
            <div key={p} className={p === 'BASE' ? 'sol-plan sol-plan-destacado' : 'sol-plan'}>
              <p className="sol-plan-nombre">{PLAN_INFO[p].nombre}</p>
              <p className="sol-plan-precio">{PLAN_INFO[p].precioMes} €<span>/mes con IVA</span></p>
              <p className="sol-plan-resumen">{PLAN_INFO[p].resumen}</p>
            </div>
          ))}
        </div>
        <p className="sol-planes-nota">{nota ?? `Sin permanencia y sin comisión de Tentare sobre tus cobros. ${TRIAL_DIAS} días de prueba sin tarjeta.`} <Link href="/precios">Qué incluye cada plan →</Link></p>
      </div>
    </section>
  );
}

export function FaqSolucion({ titulo, items }: { titulo: string; items: { q: string; a: string }[] }) {
  return (
    <section className="sol-zona">
      <FaqStructuredData items={items} />
      <div className="sol-ancho sol-ancho-estrecho">
        <h2 className="sol-h2">{titulo}</h2>
        <ArticleFaq items={items} />
      </div>
    </section>
  );
}

export function CierreSolucion({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="sol-zona">
      <Reveal className="sol-cierre">
        <h2>{titulo}</h2>
        <p>{texto}</p>
        <div className="sol-acciones sol-acciones-centro">
          <Link href="/crear-estudio" className="sol-cta sol-cta-claro">Probar {TRIAL_DIAS} días gratis</Link>
          <Link href="/soluciones/cambiar-de-software" className="sol-cta-2 sol-cta-2-claro">Vengo de otro programa →</Link>
        </div>
      </Reveal>
    </section>
  );
}

function EstilosSolucion() {
  return (
    <style>{`
      .sol-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .sol-ancho { max-width: 1120px; margin: 0 auto; }
      .sol-ancho-estrecho { max-width: 820px; }
      .sol-zona { padding: 0 clamp(18px,4vw,44px) clamp(56px,7vw,96px); }
      .sol-banda { padding: 0 clamp(18px,4vw,44px) clamp(56px,7vw,88px); }
      .sol-eyebrow { margin: 0 0 12px; font-size: 11.5px; letter-spacing: .16em; text-transform: uppercase; color: #6B6B63; }
      .sol-eyebrow-claro { color: #A8B080; }
      .sol-h2 { margin: 0 0 16px; font-weight: 800; font-size: clamp(27px,3.4vw,40px); line-height: 1.08; letter-spacing: -.03em; text-wrap: balance; }
      .sol-h2-claro { color: #fff; }
      .sol-prosa p { margin: 0 0 14px; font-size: 17px; line-height: 1.65; color: #34342E; }
      .sol-prosa a { color: ${ACC}; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
      .sol-prosa-clara p { color: #C9C9C1; }
      .sol-prosa-clara a { color: #fff; }

      /* ── Portada ─────────────────────────────────────────────────── */
      .sol-heroe { padding: clamp(24px,3vw,36px) clamp(18px,4vw,44px) clamp(56px,7vw,96px); }
      .sol-heroe-in { max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,1.05fr) minmax(0,1fr);
        gap: clamp(32px,5vw,72px); align-items: center; }
      .sol-miga { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 clamp(24px,3vw,36px); font-size: 11.5px; letter-spacing: .06em; color: #8A8A80; }
      .sol-miga a { color: #5A5A52; text-decoration: none; }
      .sol-miga a:hover { color: #1A1A1A; text-decoration: underline; text-underline-offset: 3px; }
      .sol-h1 { margin: 0 0 20px; font-weight: 800; font-size: clamp(40px,5.6vw,68px); line-height: .98; letter-spacing: -.042em; text-wrap: balance; }
      .sol-entrada { margin: 0 0 28px; max-width: 52ch; font-size: clamp(17px,1.5vw,19.5px); line-height: 1.58; color: ${MUTED}; }
      .sol-acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
      .sol-acciones-centro { justify-content: center; }
      .sol-cta { display: inline-block; font-size: 16px; font-weight: 700; color: #fff; background: ${ACC}; padding: 15px 28px;
        border-radius: 999px; text-decoration: none; box-shadow: 0 16px 30px -14px rgba(52,56,37,.6);
        transition: transform var(--motion-normal) var(--motion-ease), filter var(--motion-normal) var(--motion-ease); }
      .sol-cta:hover { transform: translateY(-2px); filter: brightness(1.12); }
      .sol-cta-claro { background: #EEEEE8; color: #1A1A1A; box-shadow: none; }
      .sol-cta-2 { font-size: 15.5px; font-weight: 700; color: #1A1A1A; padding: 14px 10px; text-decoration: none; }
      .sol-cta-2:hover { text-decoration: underline; text-underline-offset: 3px; }
      .sol-cta-2-claro { color: #EEEEE8; }
      .sol-confianza { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 22px 0 0; font-size: 13.5px; color: #5A5A52; }
      .sol-confianza span { display: inline-flex; align-items: center; gap: 6px; }
      .sol-confianza svg { color: #3F8A6C; }
      .sol-heroe-escena { position: relative; margin: 0; }
      .sol-heroe-foto { border-radius: 28px; overflow: hidden; aspect-ratio: 4 / 5; background: #DCDBD2;
        box-shadow: 0 50px 90px -50px rgba(26,26,26,.55); }
      .sol-heroe-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .sol-avisos { position: absolute; inset: 0; pointer-events: none; }
      .sol-aviso { position: absolute; display: grid; gap: 3px; width: min(260px, 72%); padding: 12px 14px; border-radius: 16px;
        background: rgba(255,255,255,.9); -webkit-backdrop-filter: blur(16px) saturate(1.5); backdrop-filter: blur(16px) saturate(1.5);
        border: 1px solid rgba(255,255,255,.8); box-shadow: 0 24px 50px -24px rgba(26,26,26,.45); }
      .sol-aviso-1 { top: 9%; left: -9%; }
      .sol-aviso-2 { bottom: 10%; right: -7%; }
      .sol-aviso-fila { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .sol-aviso-etiqueta { font-size: 11px; font-weight: 700; letter-spacing: .02em; color: #6B6B63; }
      .sol-aviso-estado { font-size: 10.5px; font-weight: 800; color: #2F6E55; background: #E3F0E9; padding: 2px 8px; border-radius: 999px; }
      .sol-aviso-texto { font-size: 13.5px; font-weight: 700; line-height: 1.35; color: #1A1A1A; }
      @media (max-width: 900px) {
        .sol-heroe-in { grid-template-columns: minmax(0,1fr); }
        .sol-heroe-foto { aspect-ratio: 5 / 4; }
        .sol-aviso-1 { left: 12px; top: 12px; }
        .sol-aviso-2 { right: 12px; bottom: 12px; }
      }
      @media (max-width: 520px) { .sol-aviso-1 { display: none; } .sol-aviso { width: min(250px, 80%); } }

      /* ── En resumen ──────────────────────────────────────────────── */
      .sol-resumen { max-width: 1120px; margin: 0 auto; background: #fff; border: 1px solid #E4E4DC; border-radius: 26px;
        padding: clamp(26px,4vw,48px); box-shadow: 0 40px 80px -60px rgba(26,26,26,.4); }
      .sol-resumen-h2 { margin: 0 0 12px; font-weight: 800; font-size: clamp(23px,2.8vw,32px); line-height: 1.12; letter-spacing: -.024em; max-width: 30ch; }
      .sol-resumen-p { margin: 0; max-width: 72ch; font-size: 17.5px; line-height: 1.65; color: #2E2E29; }
      .sol-datos { margin: clamp(22px,3vw,30px) 0 0; display: grid; grid-template-columns: repeat(auto-fit,minmax(200px,1fr)); gap: 14px; }
      .sol-datos > div { padding: 16px 18px; border-radius: 16px; background: #F5F6EE; }
      .sol-datos dt { font-size: clamp(22px,2.4vw,28px); font-weight: 800; letter-spacing: -.02em; color: #1A1A1A; }
      .sol-datos dd { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: #5A5A52; }

      /* ── Situaciones ─────────────────────────────────────────────── */
      .sol-situaciones { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; margin-top: 8px; }
      .sol-situacion { background: #fff; border: 1px solid #E7E7E0; border-radius: 20px; padding: 24px; }
      .sol-situacion-hora { margin: 0 0 14px; font-size: 12px; color: #8A6D2C; letter-spacing: .08em; }
      .sol-situacion h3 { margin: 0 0 8px; font-size: 18.5px; font-weight: 800; letter-spacing: -.012em; line-height: 1.25; }
      .sol-situacion p { margin: 0; font-size: 15px; line-height: 1.55; color: ${MUTED}; }
      @media (max-width: 860px) { .sol-situaciones { grid-template-columns: minmax(0,1fr); } }

      /* ── Filas de producto ───────────────────────────────────────── */
      .sol-fila { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr);
        gap: clamp(32px,5vw,72px); align-items: center; }
      .sol-fila-inv .sol-fila-texto { order: 2; }
      .sol-puntos { list-style: none; margin: 6px 0 18px; padding: 0; display: grid; gap: 10px; }
      .sol-puntos li { display: flex; gap: 10px; align-items: flex-start; font-size: 15.5px; line-height: 1.5; color: #2E2E29; }
      .sol-puntos svg { flex-shrink: 0; margin-top: 3px; color: #3F8A6C; }
      .sol-enlace { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; color: ${ACC}; text-decoration: none; }
      .sol-enlace:hover { text-decoration: underline; text-underline-offset: 3px; }
      .sol-captura figure { margin: 0; }
      .sol-captura img { display: block; width: 100%; height: auto; border-radius: 18px; border: 1px solid #DEDED6; background: #fff;
        box-shadow: 0 44px 80px -48px rgba(26,26,26,.5); }
      .sol-captura figcaption { margin: 12px 4px 0; font-size: 11.5px; letter-spacing: .03em; color: #6B6B63; }
      .sol-captura-movil { display: flex; justify-content: center; }
      .sol-captura-movil figure { width: min(340px, 78%); }
      .sol-captura-movil img { border-radius: 32px; border: 8px solid #141414; }
      .sol-captura-foto { display: flex; justify-content: center; }
      .sol-captura-foto figure { width: min(330px, 78%); }
      .sol-captura-foto img { border: 0; border-radius: 26px; }
      @media (max-width: 900px) {
        .sol-fila { grid-template-columns: minmax(0,1fr); }
        .sol-fila-inv .sol-fila-texto { order: 0; }
      }

      /* ── Banda oscura ────────────────────────────────────────────── */
      .sol-oscura { background: #0F0F0F; padding: clamp(64px,8vw,110px) clamp(18px,4vw,44px); margin-bottom: clamp(56px,7vw,96px); }
      .sol-oscura-in { max-width: 1120px; margin: 0 auto; display: grid; grid-template-columns: minmax(0,.85fr) minmax(0,1.15fr);
        gap: clamp(32px,5vw,64px); align-items: center; }
      @media (max-width: 900px) { .sol-oscura-in { grid-template-columns: minmax(0,1fr); } }

      /* ── Calculadora (CalculadoraPlazasVacias) ───────────────────── */
      .sol-calc { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,.9fr); border-radius: 24px; overflow: hidden;
        background: #fff; box-shadow: 0 40px 80px -40px rgba(0,0,0,.6); }
      .sol-calc-campos { padding: clamp(20px,3vw,28px); display: grid; gap: 14px; }
      .sol-calc-titulo { margin: 0 0 2px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #6B6B63; }
      .sol-calc-titulo-claro { color: #C9CDB3; }
      .sol-calc-campo { display: block; }
      .sol-calc-etiqueta { display: block; font-size: 14px; font-weight: 700; color: #1A1A1A; }
      .sol-calc-ayuda { display: block; margin: 1px 0 6px; font-size: 12px; color: #6B6B63; }
      .sol-calc-campo input { width: 100%; font-size: 16px; padding: 10px 12px; border-radius: 12px; border: 1px solid #D6D6CE; background: #FAFAF7; color: #1A1A1A; }
      .sol-calc-campo input:focus-visible { outline: 2px solid ${ACC}; outline-offset: 1px; }
      .sol-calc-resultado { background: ${ACC}; color: #fff; padding: clamp(20px,3vw,28px); display: flex; flex-direction: column; justify-content: center; }
      .sol-calc-cifra { margin: 6px 0 6px; font-size: clamp(36px,4.6vw,52px); font-weight: 800; letter-spacing: -.035em; line-height: 1; }
      .sol-calc-cifra span { font-size: 16px; font-weight: 600; letter-spacing: 0; color: #DDE0CB; }
      .sol-calc-sub { margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #E6E8D8; }
      .sol-calc-nota { margin: 0; font-size: 12px; line-height: 1.5; color: #C9CDB3; }
      @media (max-width: 640px) { .sol-calc { grid-template-columns: minmax(0,1fr); } }

      /* ── Tabla ───────────────────────────────────────────────────── */
      .sol-tabla { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 10px; background: #fff;
        border: 1px solid #E7E7E0; border-radius: 20px; overflow: hidden; }
      .sol-tabla thead th { text-align: left; padding: 14px 18px; font-size: 12.5px; font-weight: 700; color: #5A5A52; background: #F5F5F1; }
      .sol-tabla tbody th { text-align: left; padding: 15px 18px; font-size: 14.5px; font-weight: 700; vertical-align: top; }
      .sol-tabla td { padding: 15px 18px; font-size: 14.5px; line-height: 1.5; color: #3A3A34; vertical-align: top; }
      .sol-tabla tbody tr > * { border-top: 1px solid #EDEDE6; }
      @media (max-width: 640px) {
        .sol-tabla, .sol-tabla tbody, .sol-tabla tr, .sol-tabla th, .sol-tabla td { display: block; }
        .sol-tabla thead { display: none; }
        .sol-tabla tbody tr { padding: 14px 16px; border-top: 1px solid #EDEDE6; }
        .sol-tabla tbody tr:first-child { border-top: 0; }
        .sol-tabla tbody tr > * { border-top: 0; padding: 4px 0; }
        .sol-tabla td::before { content: attr(data-col) ': '; font-weight: 700; color: #1A1A1A; }
      }

      /* ── Planes ──────────────────────────────────────────────────── */
      .sol-planes { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; margin-top: 8px; }
      .sol-plan { background: #fff; border: 1px solid #E7E7E0; border-radius: 22px; padding: 24px; }
      .sol-plan-destacado { border-color: ${ACC}; box-shadow: 0 0 0 1px ${ACC}, 0 30px 60px -40px rgba(52,56,37,.5); }
      .sol-plan-nombre { margin: 0 0 8px; font-size: 15px; font-weight: 800; color: #1A1A1A; }
      .sol-plan-precio { margin: 0 0 10px; font-size: 38px; font-weight: 800; letter-spacing: -.03em; color: #1A1A1A; }
      .sol-plan-precio span { font-size: 14px; font-weight: 600; letter-spacing: 0; color: #6B6B63; margin-left: 4px; }
      .sol-plan-resumen { margin: 0; font-size: 14.5px; line-height: 1.5; color: ${MUTED}; }
      .sol-planes-nota { margin: 18px 0 0; font-size: 14.5px; color: #5A5A52; }
      .sol-planes-nota a { color: ${ACC}; font-weight: 700; }
      @media (max-width: 860px) { .sol-planes { grid-template-columns: minmax(0,1fr); } }

      /* ── Cierre ──────────────────────────────────────────────────── */
      .sol-cierre { max-width: 1120px; margin: 0 auto; text-align: center; background: ${ACC}; color: #fff; border-radius: 30px;
        padding: clamp(44px,6vw,80px) clamp(22px,4vw,56px); }
      .sol-cierre h2 { margin: 0 auto 14px; max-width: 22ch; font-weight: 800; font-size: clamp(30px,4vw,48px); line-height: 1.04; letter-spacing: -.035em; }
      .sol-cierre p { margin: 0 auto 28px; max-width: 54ch; font-size: 17px; line-height: 1.6; color: #DDE0CB; }

      /* ── Relacionadas ────────────────────────────────────────────── */
      .sol-rel { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 16px; }
      .sol-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 20px; text-decoration: none;
        transition: transform var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal) var(--motion-ease); }
      .sol-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
      .sol-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
      .sol-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
      @media (prefers-reduced-motion: reduce) { .sol-cta, .sol-rel-card { transition: none; } }
    `}</style>
  );
}
