import Image from 'next/image';
import Link from 'next/link';
import { PageShell } from '@/components/recursos/PageShell';
import { Boton, HubShell } from '@/components/web/hub/Hub';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureStructuredData } from './FeatureStructuredData';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { Escena } from '@/components/web/home/piezas';
// Las piezas del producto de la home toman sus colores de `--wh-*` (hub.css les pone la paleta menta
// bajo `.hx.wh`): la página va dentro de `HubShell piezas`.
import '@/components/web/home/home.css';

// Armazón compartido de /funcionalidades/<slug>.
//
// 16-nov-2026: al idioma de la home nueva, el mismo que los índices (components/web/hub/Hub.tsx): la cabecera de cristal de la home,
// una portada clara y centrada (miga, búsqueda, titular, entrada y dos botones) y, debajo, el MONTAJE del producto sobre una escena
// menta: la captura real del panel, una `pieza` dibujada con datos de ejemplo o un `visual` propio de la página.
//
// ⚠️ Antes la portada era una banda oscura con una foto (siempre la MISMA, /disciplinas/pilates.jpg, en tres páginas) y la captura
// solapándola. Esa foto ya no se pinta: tres páginas con la misma foto a sangre se leían como plantilla (lo decía este mismo comentario
// al reservarla «a las páginas donde el momento es humano»), y la portada clara no la necesita. La prop `foto` sigue aceptándose para
// no tocar los callers, y no se usa.
//
// `visual` sigue existiendo para lo que NO tiene pantalla que enseñar (la cadena de huellas de una factura, el reparto del margen).
// Cuando hay pantalla, se enseña la pantalla.

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
  busqueda,
  h1,
  intro,
  chips,
  captura,
  pieza,
  visual,
  children,
}: {
  /** Path en lib/seo/paginas.ts. De ahí salen miga de pan, JSON-LD y relacionadas. */
  path: string;
  /**
   * La búsqueda que responde la página, en palabras de quien la escribe
   * («Software de reservas para estudios de Pilates»). Va DENTRO del h1, con
   * la letra pequeña del antetítulo: el titular grande es una frase con gancho
   * («Reservan solas, a las siete de la mañana») y, sin esta línea, ningún h1
   * de las funcionalidades decía de qué trataba la página (rastreo del
   * 7-oct-2026). Mismo patrón que el h1 de la home.
   */
  busqueda: string;
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
  /** Una pieza de la home (piezas.tsx) con su descripción, cuando no hay captura nueva. */
  pieza?: { descripcion: string; contenido: React.ReactNode; movil?: boolean };
  /** Solo para lo que no tiene pantalla: un flujo, una cadena, un cálculo. */
  visual?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pagina = paginaDe(path);
  const relacionadas = relacionadasDe(path);
  const hayMontaje = Boolean(captura || pieza || visual);

  return (
    <PageShell>
      <OrganizationStructuredData />
      <FeatureStructuredData path={path} />
      <HubShell fija="producto" piezas>
        <header className="hx-hero hx-hero--hija">
          <div className="hx-hero-in">
            {/* Miga de pan visible, no solo en JSON-LD: es navegación real. */}
            <nav aria-label="Migas de pan" className="hx-miga">
              <Link href="/">Inicio</Link>
              <span aria-hidden>/</span>
              <Link href="/funcionalidades">Funcionalidades</Link>
              <span aria-hidden>/</span>
              <span className="hx-miga-aqui">{pagina?.etiqueta ?? ''}</span>
            </nav>

            <h1 className="hx-h1">
              <span className="hx-h1-cat">{busqueda}</span>{' '}
              <span className="hx-h1-promesa">{h1}</span>
            </h1>
            <p className="hx-lead">{intro}</p>

            <div className="hx-acciones">
              <Boton href="/crear-estudio">{CTA_ALTA}</Boton>
              <Link href="/precios" className="hx-boton-linea">Ver precios</Link>
            </div>
          </div>
        </header>

        {hayMontaje && (
          <div className="hx-montaje">
            {captura ? (
              <div className="hx-montaje-caja hx-montaje-caja--captura">
                <figure style={{ margin: 0 }}>
                  <Image
                    src={captura.src}
                    alt={captura.alt}
                    width={captura.ancho}
                    height={captura.alto}
                    sizes="(max-width: 1180px) 94vw, 1080px"
                    priority
                  />
                  <figcaption className="hx-pie-captura">
                    <span className="hx-pie-punto" aria-hidden />
                    {captura.pie}
                  </figcaption>
                </figure>
              </div>
            ) : pieza ? (
              <div className={pieza.movil ? 'hx-montaje-caja hx-montaje-caja--escena hx-montaje-caja--movil' : 'hx-montaje-caja hx-montaje-caja--escena'}>
                <Escena descripcion={pieza.descripcion}>{pieza.contenido}</Escena>
              </div>
            ) : (
              <div className="hx-montaje-caja hx-montaje-caja--visual">{visual}</div>
            )}
            {chips.length > 0 && (
              <p className="hx-chips-linea">
                {chips.map((c, i) => (
                  <span key={c}>
                    {i > 0 && <span aria-hidden> · </span>}
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
            <div className="hx-rel">
              <h2 className="hx-rel-titulo">Sigue por aquí</h2>
              <div className="hx-rel-rejilla">
                {relacionadas.map((r) => (
                  <Link key={r.path} href={r.path} className="hx-rel-card">
                    <b>{r.etiqueta}</b>
                    <span>{r.resumen ?? r.descripcion}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}
      </HubShell>

      <style>{`
        /* ── Cuerpo ───────────────────────────────────────────────────────── */
        .feat-body { max-width: 820px; margin: 0 auto; }
        .feat-body > section { margin-bottom: clamp(44px,6vw,72px); }
        .feat-body h2 { font-size: clamp(25px,3.1vw,34px); line-height: 1.12;
          letter-spacing: var(--w-track-h2); color: var(--w-texto); margin: 0 0 14px; scroll-margin-top: 88px; text-wrap: balance; }
        .feat-body h3 { font-size: 19px; letter-spacing: var(--w-track-h3); color: var(--w-texto); margin: 26px 0 8px; }
        .feat-body p { font-size: 17px; line-height: 1.66; color: var(--w-texto); margin: 0 0 17px; }
        .feat-body p:last-child { margin-bottom: 0; }
        .feat-body strong { color: var(--w-texto); font-weight: 600; }
        .feat-body a { color: var(--w-olive); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
      `}</style>
    </PageShell>
  );
}
