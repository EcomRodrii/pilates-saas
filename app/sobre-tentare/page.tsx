import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { ID_ORGANIZACION, ID_FUNDADOR, OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { LEGAL } from '@/lib/legal-info';
import { G2_URL } from '@/lib/seo/g2';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// «Sobre Tentare» (fase 5b del rediseño, 23-sep): la página de entidad. Es lo
// primero que un buscador —y una persona— busca para saber quién hay detrás y si
// es de fiar. Solo dice lo que es verificable en el propio sitio (titular y
// domicilio del aviso legal, contacto, precio público, sin permanencia). Nada de
// trayectoria, cifras ni clientes: si el fundador quiere contar su historia, es
// él quien la escribe (el copy público se propone, no se inventa — #2263).
//
// 7-oct-2026: gana «Cómo escribimos las guías y las comparativas» (#como-
// escribimos) y los datos propios que publicamos. Es el método que ya cumplen
// los artículos (lib/recursos/articulos/validar.ts: fuente y fecha en cada cifra
// de fuera, nada sin comprobar) y las comparativas («no consta», fecha de
// revisión): contado, para que la autoría de las guías —que enlaza aquí— tenga
// detrás un método y no solo un nombre.

const PATH = '/sobre-tentare';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const PRINCIPIOS = [
  { titulo: 'Precio público', texto: 'Los planes cuestan lo que dice la página de precios, IVA incluido. No hay que pedir presupuesto ni pasar por una demo para saberlo.' },
  { titulo: 'Sin permanencia', texto: 'Se paga mes a mes. Si te vas, exportas tus alumnas, reservas, suscripciones, recibos y pagos.' },
  { titulo: 'Una persona al otro lado', texto: 'El soporte es por WhatsApp o por email, en español, con alguien que sabe cómo funciona un estudio.' },
  { titulo: 'Lo que se dice, se cumple', texto: 'Cuando una función está en desarrollo lo escribimos así (por ejemplo, el envío automático de facturas a la AEAT), y cuando algo no lo hacemos, también.' },
];

const METODO = [
  'En las guías que terminan con una lista de «Fuentes», cada cifra que no es nuestra lleva su enlace y la fecha en que la consultamos.',
  'Si no hemos podido comprobar un dato, no lo escribimos.',
  'De otros programas solo contamos lo que consta en su web pública, con la fecha de la revisión. Si un dato no aparece, lo decimos así: «no consta».',
  'Los precios de los estudios salen de las tarifas que publican en su web: 32 estudios de 8 ciudades, revisados el 25 de septiembre de 2026.',
  'Cada guía dice cuándo se revisó por última vez.',
  'Somos parte interesada: Tentare es un software para estudios. Cuando una guía o una comparativa habla de Tentare, lo dice.',
  'Antes de publicarse, esas guías pasan una comprobación automática: que cada tabla de cifras diga de dónde salen, que cada fuente lleve su fecha, que sus enlaces existan y que no usen ninguna de las frases sobre Tentare que tenemos marcadas como no ciertas.',
];

const DATOS_PROPIOS = [
  { href: '/recursos/precio-clase-de-pilates', titulo: 'Precio de una clase de pilates', texto: 'Lo que cobran 32 estudios de 8 ciudades por reformer, suelo y privada.' },
  { href: '/recursos/bonos-de-pilates', titulo: 'Bonos de pilates', texto: 'Tamaños, descuentos y caducidades reales, con una calculadora de precios.' },
  { href: '/recursos/rentabilidad-estudio-de-pilates', titulo: 'Rentabilidad de un estudio', texto: 'La cuenta completa y una calculadora del punto de equilibrio.' },
  { href: '/recursos/precios-reformer-mat', titulo: 'Reformer vs. mat', texto: 'Coste por plaza y cuánto factura un reformer según la ocupación.' },
  { href: '/soluciones/estudio-de-pilates-reformer', titulo: 'Calculadora de plazas vacías', texto: 'Lo que cuestan al mes las plazas de reformer que no se reservan.' },
  { href: '/comparativa', titulo: 'Comparativa de 13 programas', texto: 'Precio, permanencia y funciones, con lo que consta en la web de cada uno.' },
];

export default function SobreTentarePage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${urlDe(PATH)}#pagina`,
        url: urlDe(PATH),
        name: pagina.titulo,
        inLanguage: 'es-ES',
        isPartOf: { '@id': `${LEGAL.url}/#web` },
        about: { '@id': ID_ORGANIZACION },
        dateModified: pagina.actualizado,
      },
      {
        '@type': 'Person',
        '@id': ID_FUNDADOR,
        name: 'Marcos Roca',
        jobTitle: 'Fundador de Tentare',
        url: urlDe(PATH),
        worksFor: { '@id': ID_ORGANIZACION },
        knowsAbout: ['Software de gestión para estudios de Pilates y yoga', 'Gestión de estudios de Pilates', 'Precios y bonos de clases de Pilates en España'],
      },
    ],
  };

  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Sobre Tentare" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header className="st-cab">
        <div className="st-ancho">
          <h1 className="st-h1">Sobre Tentare.</h1>
          <p className="st-entrada">
            Tentare es un software de gestión para estudios de Pilates y yoga en España: reservas, cobros, bonos y sustituciones de instructoras, en un solo panel y con una app con la marca de cada estudio para sus alumnas.
          </p>
        </div>
      </header>

      <div className="st-ancho st-cuerpo">
        <section id="quien" className="st-bloque">
          <h2>Quién está detrás</h2>
          <p>
            Tentare la fundó y la mantiene <strong>{LEGAL.titular}</strong>, desde {LEGAL.domicilio}. Es también quien firma las guías de{' '}
            <Link href="/recursos">recursos</Link>. Los datos del titular, tal como exige la ley, están en el <Link href="/legal">aviso legal</Link>.
          </p>
          <p className="st-enlaces">
            <a href="https://www.linkedin.com/company/tentare/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
            <span aria-hidden> · </span>
            <a href="https://www.instagram.com/tentareapp/" target="_blank" rel="noopener noreferrer">Instagram</a>
            <span aria-hidden> · </span>
            <a href={G2_URL} target="_blank" rel="noopener noreferrer">Reseñas en G2</a>
          </p>
        </section>

        <section className="st-bloque">
          <h2>Cómo trabajamos</h2>
          <ul className="st-principios">
            {PRINCIPIOS.map((p) => (
              <li key={p.titulo}>
                <strong>{p.titulo}</strong>
                <span>{p.texto}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="como-escribimos" className="st-bloque">
          <h2>Cómo escribimos las guías y las comparativas</h2>
          <p>Las guías de recursos y las comparativas siguen las mismas reglas:</p>
          <ol className="st-metodo">
            {METODO.map((m) => <li key={m}>{m}</li>)}
          </ol>
          <p>
            Si ves un dato desactualizado o un error, escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> y lo corregimos.
          </p>
        </section>

        <section className="st-bloque">
          <h2>Datos y herramientas que publicamos</h2>
          <div className="st-datos">
            {DATOS_PROPIOS.map((d) => (
              <Link key={d.href} href={d.href} className="st-dato">
                <span className="st-dato-tit">{d.titulo}</span>
                <span className="st-dato-txt">{d.texto}</span>
                <span className="st-dato-ir" aria-hidden><ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="st-bloque">
          <h2>Contacto</h2>
          <p>
            Escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> o por WhatsApp desde el botón de la web. Para la seguridad de tus datos, mira{' '}
            <Link href="/seguridad">cómo los protegemos</Link>.
          </p>
        </section>
      </div>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(64px,8vw,110px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Pruébalo con tu estudio de verdad." body="7 días gratis, sin tarjeta y sin permanencia." cta="Probar 7 días gratis" />
        </div>
      </section>

      <SiteFooter />

      <style>{`
        .st-ancho { max-width: 760px; margin: 0 auto; padding: 0 clamp(20px,4vw,44px); }
        .st-cab { padding: clamp(48px,7vw,88px) 0 clamp(28px,4vw,40px); }
        .st-h1 { font-weight: 800; font-size: clamp(36px,5.4vw,60px); line-height: 1.02; letter-spacing: -.035em; margin: 0 0 20px; }
        .st-entrada { font-size: clamp(17px,1.5vw,20px); line-height: 1.55; color: ${MUTED}; margin: 0; }
        .st-cuerpo { padding-bottom: clamp(48px,6vw,72px); }
        .st-bloque { padding: clamp(26px,3.4vw,36px) 0; border-top: 1px solid #DEDED6; scroll-margin-top: 90px; }
        .st-bloque h2 { margin: 0 0 14px; font-size: clamp(22px,2.6vw,28px); font-weight: 800; letter-spacing: -.022em; line-height: 1.15; }
        .st-bloque p { margin: 0 0 12px; font-size: 16.5px; line-height: 1.65; color: #34342E; }
        .st-bloque a { color: ${ACC}; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
        .st-enlaces { font-size: 15px !important; }
        .st-principios { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
        .st-principios li { background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 18px 20px; }
        .st-principios strong { display: block; margin-bottom: 4px; font-size: 15.5px; }
        .st-principios span { font-size: 14.5px; line-height: 1.55; color: #4A4A43; }
        .st-metodo { margin: 0 0 14px; padding-left: 22px; display: grid; gap: 8px; }
        .st-metodo li { font-size: 16px; line-height: 1.6; color: #34342E; }
        .st-datos { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
        .st-dato { position: relative; display: block; background: #fff; border: 1px solid #E7E7E0; border-radius: 16px; padding: 16px 40px 16px 18px;
          text-decoration: none !important; transition: border-color var(--motion-normal) var(--motion-ease); }
        .st-dato:hover { border-color: #C9CBB8; }
        .st-dato-tit { display: block; font-size: 15.5px; font-weight: 800; color: #1A1A1A; margin-bottom: 4px; }
        .st-dato-txt { display: block; font-size: 13.5px; line-height: 1.5; font-weight: 400; color: #5A5A52; }
        .st-dato-ir { position: absolute; right: 16px; top: 18px; color: ${ACC}; }
        @media (max-width: 640px) { .st-principios, .st-datos { grid-template-columns: minmax(0,1fr); } }
      `}</style>
    </PageShell>
  );
}
