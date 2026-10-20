import Image from 'next/image';
import Link from 'next/link';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureStructuredData } from './FeatureStructuredData';
import { paginaDe, relacionadasDe } from '@/lib/seo/paginas';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { Escena } from '@/components/web/home/piezas';
// Las piezas del producto de la home toman sus colores de `--wh-*`, que cuelgan de
// `.wh`: la página va dentro de `.wh` (fase 2.4 de la web, 20-oct-2026).
import '@/components/web/home/home.css';

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
//
// Fase 2.4 (20-oct-2026): las capturas de public/producto eran del panel de
// agosto, el diseño anterior. Donde no hay captura nueva, la portada lleva una
// `pieza` del producto de la home (components/web/home/piezas.tsx): la pantalla
// real dibujada con datos de ejemplo, que lo dice a los lectores de pantalla.

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
  foto,
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
      <IslaWeb />
      <div className="wh">

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
          <nav aria-label="Migas de pan" className="ft-miga">
            <Link href="/">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/funcionalidades">Funcionalidades</Link>
            <span aria-hidden>/</span>
            <span className="ft-miga-aqui">{pagina?.etiqueta ?? ''}</span>
          </nav>

          <h1 className="ft-titular">
            <span className="ft-seccion">{busqueda}</span>{' '}
            {h1}
          </h1>
          <p className="ft-entrada">{intro}</p>

          <div className="ft-acciones">
            <Link href="/crear-estudio" className="ft-cta">{CTA_ALTA}</Link>
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
                <figcaption className="ft-pie">
                  <span className="ft-pie-punto" aria-hidden />
                  {captura.pie}
                </figcaption>
              </figure>
            ) : pieza ? (
              <div className={pieza.movil ? 'ft-pieza ft-pieza-movil' : 'ft-pieza'}>
                <Escena descripcion={pieza.descripcion}>{pieza.contenido}</Escena>
              </div>
            ) : (
              visual
            )}
          </div>
          {chips.length > 0 && (
            <p className="ft-chips">
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
            <h2 className="ft-rel-titulo">Sigue por aquí</h2>
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
      </div>

      <PieWeb />

      <style>{`
        /* ── Portada: foto a sangre ──────────────────────────────────────── */
        .ft-portada { position: relative; isolation: isolate; overflow: hidden;
          background: var(--w-noche);
          padding: clamp(28px,4vw,40px) clamp(20px,4vw,44px) clamp(150px,17vw,230px); }
        /* Sin foto, la banda es tinta plana. Nada de degradados radiales: el
           "blob" difuso en una esquina era parte del look que se quitó. */
        .ft-portada-foto { background: #0E0F0B; }
        .ft-portada > img { z-index: -2; }
        .ft-velo { position: absolute; inset: 0; z-index: -1;
          background: linear-gradient(180deg, rgba(14,15,11,.62) 0%, rgba(14,15,11,.5) 34%, rgba(14,15,11,.88) 100%); }
        .ft-velo-lado { position: absolute; inset: 0; z-index: -1;
          background: linear-gradient(96deg, rgba(14,15,11,.72) 0%, rgba(14,15,11,.34) 52%, transparent 78%); }
        .ft-portada-cuerpo { position: relative; max-width: 1120px; margin: 0 auto; color: var(--w-sobre-noche); }

        .ft-miga { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          font-size: var(--w-fs-mini); color: var(--w-sobre-noche-3);
          margin: 0 0 clamp(30px,5vw,52px); }
        .ft-miga a { color: rgba(255,255,255,.72); }
        .ft-miga a:hover { color: #fff; }
        .ft-miga-aqui { color: #fff; }

        .ft-seccion { display: block; margin: 0 0 16px; max-width: 64ch; font-size: 14px; font-weight: 600;
          line-height: 1.5; letter-spacing: normal; color: var(--w-sand); text-wrap: pretty; }
        /* Escala grande y una sola: el titular es lo único que compite con la
           foto. Todo lo demás de la portada va deliberadamente pequeño. */
        .ft-titular { margin: 0 0 18px; max-width: 16ch;
          font-weight: 600; font-size: clamp(38px,6vw,70px); line-height: 1.02;
          letter-spacing: var(--w-track-display); text-wrap: balance; }
        .ft-entrada { margin: 0 0 30px; max-width: 46ch;
          font-size: clamp(16.5px,1.5vw,19px); line-height: 1.55; color: var(--w-sobre-noche-2); }

        .ft-acciones { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .ft-cta { font-size: 15.5px; font-weight: 600; color: var(--w-olive); background: var(--w-sand);
          padding: 14px 26px; border-radius: 999px; transition: filter .2s, transform .2s; }
        .ft-cta:hover { background: var(--w-sand-claro); transform: translateY(-1px); }
        .ft-cta-2 { font-size: 15px; font-weight: 600; color: var(--w-sobre-noche); padding: 14px 10px; }
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
        .ft-montaje-marco { background: var(--w-papel); border: 1px solid rgba(255,255,255,.5); }
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
          padding: 13px clamp(14px,2vw,20px); font-size: var(--w-fs-mini); line-height: 1.45;
          color: var(--w-texto-2); background: var(--w-papel); border-top: 1px solid var(--w-linea); }
        .ft-pie-punto { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--w-olive); }
        .ft-chips { margin: 16px 0 0; text-align: center; font-size: var(--w-fs-mini);
          color: var(--w-texto-3); }
        .ft-chips-sep { color: var(--w-linea-fuerte); }
        /* Piezas de la home (fase 2.4): sobre arena clara, como en las pestañas de la home. */
        .ft-pieza { display: grid; place-items: center; min-height: 360px; background: var(--w-sand-claro);
          padding: clamp(28px,4vw,48px) clamp(16px,3vw,32px); }
        .ft-pieza .wh-escena { width: 100%; display: grid; place-items: center; }
        .ft-pieza .wh-escena-piezas { width: min(100%, 520px); }
        .ft-pieza-movil .wh-escena-piezas { width: auto; display: grid; place-items: center; }

        /* ── Cuerpo ───────────────────────────────────────────────────────── */
        .ft-cuerpo-zona { padding: clamp(46px,6vw,74px) clamp(20px,4vw,44px) clamp(20px,3vw,32px); }
        .feat-body { max-width: 820px; margin: 0 auto; }
        .feat-body > section { margin-bottom: clamp(44px,6vw,72px); }
        .feat-body h2 { font-weight: 600; font-size: clamp(25px,3.1vw,34px); line-height: 1.12;
          letter-spacing: var(--w-track-h2); color: var(--w-texto); margin: 0 0 14px; scroll-margin-top: 88px; text-wrap: balance; }
        .feat-body h3 { font-weight: 600; font-size: 19px; letter-spacing: var(--w-track-h3); color: var(--w-texto); margin: 26px 0 8px; }
        .feat-body p { font-size: 17px; line-height: 1.66; color: var(--w-texto); margin: 0 0 17px; }
        .feat-body p:last-child { margin-bottom: 0; }
        .feat-body strong { color: var(--w-texto); font-weight: 600; }
        .feat-body a { color: var(--w-olive); text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }

        /* ── Relacionadas ─────────────────────────────────────────────────── */
        .ft-rel-zona { padding: 0 clamp(20px,4vw,44px) clamp(56px,7vw,88px); }
        .ft-rel-titulo { font-size: 14px; font-weight: 600; color: var(--w-olive); margin: 0 0 16px; }
        .feat-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .feat-rel-card { display: block; background: var(--w-papel); border: 1px solid var(--w-linea);
          border-radius: var(--w-r-tarjeta); padding: 20px 22px; text-decoration: none; color: inherit;
          transition: transform .22s cubic-bezier(.2,.7,0,1), box-shadow .22s; }
        .feat-rel-card:hover { transform: translateY(-4px); box-shadow: var(--w-sombra-suave); }
        .feat-rel-nombre { display: block; font-size: 16px; font-weight: 600; color: var(--w-texto);
          letter-spacing: -.015em; line-height: 1.25; margin-bottom: 7px; }
        .feat-rel-resumen { display: block; font-size: 13.5px; line-height: 1.5; color: var(--w-texto-2); }

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
