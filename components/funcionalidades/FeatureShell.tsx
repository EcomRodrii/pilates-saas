import Image from 'next/image';
import Link from 'next/link';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureStructuredData } from './FeatureStructuredData';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';

// Armazón compartido de /funcionalidades/<slug>.
//
// ⚠️ La versión anterior era el problema, no la solución: catorce páginas con el
// MISMO encabezado —banda de degradado oliva, píldora de sección, titular, tres
// chips y un panel con un diagrama dibujado a mano— se leen como una plantilla
// rellenada. Y el diagrama era lo peor: un dibujo de cajas lo hace cualquiera,
// y se nota; enseñar el producto de verdad no.
//
// Ahora el encabezado son DOS cosas reales, montadas una sobre otra:
//
//   1. Una FOTO del mundo del cliente: una sala con reformers, no una
//      ilustración ni un degradado.
//   2. Una CAPTURA del panel de verdad (public/producto/, generada por
//      scripts/capturar-producto.mjs contra un build real), solapando la foto.
//
// Esa superposición —la herramienta encima de la sala— es lo único llamativo de
// la página. Todo lo de abajo se mantiene callado a propósito.
//
// `visual` sigue existiendo para lo que NO tiene pantalla que enseñar (la cadena
// de huellas de una factura, el reparto del margen). Cuando hay pantalla, se
// enseña la pantalla.

export interface FotoHero {
  src: string;
  alt: string;
  /** `object-position`. Las fotos verticales suelen querer 'center 30%'. */
  encuadre?: string;
}

export interface CapturaHero {
  src: string;
  alt: string;
  /** Qué mirar en la captura. Va debajo, en mono. Una frase. */
  pie: string;
  ancho: number;
  alto: number;
}

export function FeatureShell({
  path,
  eyebrow,
  h1,
  intro,
  chips,
  foto,
  captura,
  visual,
  children,
}: {
  /** Path en lib/seo/paginas.ts. De ahí salen miga de pan, JSON-LD y relacionadas. */
  path: string;
  eyebrow: string;
  h1: React.ReactNode;
  intro: React.ReactNode;
  /** 2-4 etiquetas cortas con lo concreto que hace. Nada de adjetivos. */
  chips: string[];
  /**
   * Foto del mundo del cliente. **Opcional a propósito**: hoy el repo tiene UNA
   * sola foto de un estudio de Pilates de verdad (`disciplinas/pilates.jpg`) —
   * las demás de esa carpeta son gimnasios de pesas, stock para la tira de
   * disciplinas de la home. Repetir la misma foto en quince páginas se lee
   * igual de plantillero que no tener ninguna, así que la foto se reserva para
   * las páginas donde el momento es humano y el resto abre sobre tinta plana,
   * dejando que la estrella sea la captura del producto.
   */
  foto?: FotoHero;
  /** La pantalla real. Preferible a `visual` siempre que exista una. */
  captura?: CapturaHero;
  /** Solo para lo que no tiene pantalla: un flujo, una cadena, un cálculo. */
  visual?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pagina = paginaDe(path);
  const relacionadas = relacionadasDe(path);
  const hayMontaje = Boolean(captura || visual);

  return (
    <PageShell>
      <OrganizationStructuredData />
      <FeatureStructuredData path={path} />
      <SiteNav backHref="/funcionalidades" backLabel="Funcionalidades" />

      <header className={foto ? 'ft-portada ft-portada-foto' : 'ft-portada'}>
        {foto && (
          <>
            <Image
              src={foto.src}
              alt={foto.alt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover', objectPosition: foto.encuadre ?? 'center 35%' }}
            />
            {/* Dos velos: uno vertical que hunde la parte baja para que la
                captura se despegue del fondo, y otro lateral para que el texto
                se lea sin depender de que esa esquina de la foto salga oscura. */}
            <div className="ft-velo" aria-hidden />
            <div className="ft-velo-lado" aria-hidden />
          </>
        )}

        <div className="ft-portada-cuerpo">
          {/* Miga de pan visible, no solo en JSON-LD: es navegación real. */}
          <nav aria-label="Ruta" className="lp-mono ft-miga">
            <Link href="/">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/funcionalidades">Funcionalidades</Link>
            <span aria-hidden>/</span>
            <span className="ft-miga-aqui">{pagina?.etiqueta ?? ''}</span>
          </nav>

          <p className="lp-mono ft-seccion">{eyebrow}</p>
          <h1 className="ft-titular">{h1}</h1>
          <p className="ft-entrada">{intro}</p>

          <div className="ft-acciones">
            <Link href="/crear-estudio" className="ft-cta">Crear mi estudio</Link>
            <Link href="/precios" className="ft-cta-2">Ver precios →</Link>
          </div>
        </div>
      </header>

      {hayMontaje && (
        <div className="ft-montaje">
          <div className={captura ? 'ft-montaje-caja ft-montaje-marco' : 'ft-montaje-caja'}>
            {captura ? (
              <figure className="ft-captura">
                <Image
                  src={captura.src}
                  alt={captura.alt}
                  width={captura.ancho}
                  height={captura.alto}
                  sizes="(max-width: 1180px) 94vw, 1080px"
                  priority
                />
                <figcaption className="lp-mono ft-pie">
                  <span className="ft-pie-punto" aria-hidden />
                  {captura.pie}
                </figcaption>
              </figure>
            ) : (
              visual
            )}
          </div>
          {chips.length > 0 && (
            <p className="lp-mono ft-chips">
              {chips.map((c, i) => (
                <span key={c}>
                  {i > 0 && <span className="ft-chips-sep" aria-hidden> · </span>}
                  {c}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <div className="ft-cuerpo-zona">
        <article className="feat-body">{children}</article>
      </div>

      {relacionadas.length > 0 && (
        <section className="ft-rel-zona">
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono ft-rel-titulo">Sigue por aquí</h2>
            <div className="feat-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="feat-rel-card">
                  <span className="feat-rel-nombre">{r.etiqueta}</span>
                  <span className="feat-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        /* ── Portada: foto a sangre ──────────────────────────────────────── */
        .ft-portada { position: relative; isolation: isolate; overflow: hidden;
          background: #1C1F14;
          padding: clamp(28px,4vw,40px) clamp(20px,4vw,44px) clamp(150px,17vw,230px); }
        /* Sin foto, la banda es tinta plana. Nada de degradados radiales: el
           "blob" difuso en una esquina era parte del look que se quitó. */
        .ft-portada-foto { background: #0E0F0B; }
        .ft-portada > img { z-index: -2; }
        .ft-velo { position: absolute; inset: 0; z-index: -1;
          background: linear-gradient(180deg, rgba(14,15,11,.62) 0%, rgba(14,15,11,.5) 34%, rgba(14,15,11,.88) 100%); }
        .ft-velo-lado { position: absolute; inset: 0; z-index: -1;
          background: linear-gradient(96deg, rgba(14,15,11,.72) 0%, rgba(14,15,11,.34) 52%, transparent 78%); }
        .ft-portada-cuerpo { position: relative; max-width: 1120px; margin: 0 auto; color: #fff; }

        .ft-miga { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          font-size: 11.5px; letter-spacing: .06em; color: rgba(255,255,255,.55);
          margin: 0 0 clamp(30px,5vw,52px); }
        .ft-miga a { color: rgba(255,255,255,.72); }
        .ft-miga a:hover { color: #fff; }
        .ft-miga-aqui { color: #fff; }

        .ft-seccion { margin: 0 0 14px; font-size: 11px; letter-spacing: .2em;
          text-transform: uppercase; color: #D9C29E; }
        /* Escala grande y una sola: el titular es lo único que compite con la
           foto. Todo lo demás de la portada va deliberadamente pequeño. */
        .ft-titular { margin: 0 0 18px; max-width: 16ch;
          font-weight: 800; font-size: clamp(38px,6.2vw,74px); line-height: .98;
          letter-spacing: -.042em; text-wrap: balance; }
        .ft-entrada { margin: 0 0 30px; max-width: 46ch;
          font-size: clamp(16.5px,1.5vw,19px); line-height: 1.55; color: rgba(255,255,255,.8); }

        .ft-acciones { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .ft-cta { font-size: 15.5px; font-weight: 700; color: ${ACC}; background: #D9C29E;
          padding: 14px 26px; border-radius: 999px; transition: filter .2s, transform .2s; }
        .ft-cta:hover { filter: brightness(1.07); transform: translateY(-1px); }
        .ft-cta-2 { font-size: 15px; font-weight: 600; color: rgba(255,255,255,.86); padding: 14px 10px; }
        .ft-cta-2:hover { color: #fff; }

        /* ── El montaje: la captura sube y se come el borde de la foto ───── */
        .ft-montaje { position: relative; z-index: 2;
          margin: clamp(-200px,-15vw,-130px) auto 0; padding: 0 clamp(16px,4vw,44px);
          max-width: 1180px; }
        /* La sombra la lleva SIEMPRE el montaje (es lo que lo despega de la
           banda). El marco blanco solo cuando hay captura: un panel oscuro trae
           su propio fondo, y forzarle blanco le borraba el texto —pasó. */
        .ft-montaje-caja { border-radius: clamp(12px,1.6vw,20px); overflow: hidden;
          box-shadow: 0 50px 90px -40px rgba(12,13,9,.6), 0 8px 24px -12px rgba(12,13,9,.3); }
        .ft-montaje-marco { background: #fff; border: 1px solid rgba(255,255,255,.5); }
        .ft-captura { margin: 0; display: block; }
        .ft-captura img { display: block; width: 100%; height: auto; }
        /* En móvil, la captura entera es una mancha: un panel de escritorio de
           1440 px reducido a 350 no se lee. Se recorta a la zona útil —fuera el
           menú lateral— y se enseña a una escala en la que las cifras y los
           bloques de clase SÍ se distinguen. Prefiero enseñar un trozo legible
           que la pantalla completa ilegible. */
        @media (max-width: 720px) {
          .ft-captura img { aspect-ratio: 4 / 3.4; object-fit: cover;
            object-position: 26% 0; }
        }
        .ft-pie { display: flex; align-items: center; gap: 9px;
          padding: 13px clamp(14px,2vw,20px); font-size: 12px; line-height: 1.45;
          color: #5A5A52; background: #FAFAF6; border-top: 1px solid #EDEDE5; }
        .ft-pie-punto { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #5A6142; }
        .ft-chips { margin: 16px 0 0; text-align: center; font-size: 11.5px;
          letter-spacing: .04em; color: #8E8E86; }
        .ft-chips-sep { color: #C9C9C0; }

        /* ── Cuerpo ───────────────────────────────────────────────────────── */
        .ft-cuerpo-zona { padding: clamp(46px,6vw,74px) clamp(20px,4vw,44px) clamp(20px,3vw,32px); }
        .feat-body { max-width: 820px; margin: 0 auto; }
        .feat-body > section { margin-bottom: clamp(44px,6vw,72px); }
        .feat-body h2 { font-weight: 800; font-size: clamp(25px,3.1vw,34px); line-height: 1.1;
          letter-spacing: -.032em; margin: 0 0 14px; scroll-margin-top: 88px; text-wrap: balance; }
        .feat-body h3 { font-weight: 700; font-size: 18.5px; letter-spacing: -.012em; margin: 26px 0 8px; }
        .feat-body p { font-size: 17px; line-height: 1.66; color: #3A3A34; margin: 0 0 17px; }
        .feat-body p:last-child { margin-bottom: 0; }
        .feat-body strong { color: #1A1A1A; font-weight: 700; }
        .feat-body a { color: ${ACC}; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }

        /* ── Relacionadas ─────────────────────────────────────────────────── */
        .ft-rel-zona { padding: 0 clamp(20px,4vw,44px) clamp(56px,7vw,88px); }
        .ft-rel-titulo { font-size: 11px; font-weight: 500; letter-spacing: .14em;
          text-transform: uppercase; color: #A8A89F; margin: 0 0 16px; }
        .feat-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feat-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px 22px; text-decoration: none; color: inherit;
          transition: transform .22s cubic-bezier(.2,.7,0,1), box-shadow .22s; }
        .feat-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .feat-rel-nombre { display: block; font-size: 16px; font-weight: 700;
          letter-spacing: -.015em; line-height: 1.25; margin-bottom: 7px; }
        .feat-rel-resumen { display: block; font-size: 13.5px; line-height: 1.5; color: ${MUTED}; }

        @media (max-width: 940px) {
          .ft-portada { padding-bottom: clamp(110px,26vw,170px); }
          .feat-rel { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .ft-montaje { margin-top: clamp(-120px,-24vw,-90px); }
          .ft-velo-lado { background: linear-gradient(180deg, rgba(14,15,11,.4), transparent 60%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ft-cta, .feat-rel-card { transition: none; }
        }
      `}</style>
    </PageShell>
  );
}
