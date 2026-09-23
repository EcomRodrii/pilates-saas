import type { Metadata } from 'next';
import Link from 'next/link';
import { MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { ID_ORGANIZACION, ID_FUNDADOR, OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { LEGAL } from '@/lib/legal-info';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

// «Sobre Tentare» (fase 5b del rediseño, 23-sep): la página de entidad. Es lo
// primero que un buscador —y una persona— busca para saber quién hay detrás y si
// es de fiar, y Tentare no tenía ninguna: el autor de las guías enlazaba al aviso
// legal. Es deliberadamente CORTA y solo dice lo que es verificable en el propio
// sitio (titular y domicilio del aviso legal, contacto, precio público, sin
// permanencia). Nada de trayectoria, cifras ni clientes: si el fundador quiere
// contar su historia, es él quien la escribe (el copy público se propone, no se
// inventa — regla de #2263).

const PATH = '/sobre-tentare';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const PRINCIPIOS = [
  { titulo: 'Precio público', texto: 'Los planes cuestan lo que dice /precios, IVA incluido. No hay que pedir presupuesto ni pasar por una demo para saberlo.' },
  { titulo: 'Sin permanencia', texto: 'Se paga mes a mes. Si te vas, exportas tus alumnas, reservas, suscripciones, recibos y pagos.' },
  { titulo: 'Una persona al otro lado', texto: 'El soporte es por WhatsApp o por email, en español, con alguien que sabe cómo funciona un estudio.' },
  { titulo: 'Lo que se dice, se cumple', texto: 'Cuando una función está en desarrollo lo escribimos así (por ejemplo, el envío automático de facturas a la AEAT), y cuando algo no lo hacemos, también.' },
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
      },
    ],
  };

  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Sobre Tentare" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header style={{ padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(28px,4vw,40px)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,56px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Sobre Tentare.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 640, margin: 0 }}>
            Tentare es un software de gestión para estudios de Pilates y Yoga en España: reservas, cobros, bonos y sustituciones de instructoras, en un solo panel y con una app con la marca de cada estudio para sus alumnas.
          </p>
        </div>
      </header>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Quién está detrás</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>
              Tentare la fundó y la mantiene <strong>{LEGAL.titular}</strong>, desde {LEGAL.domicilio}. Los datos del titular, tal como exige la ley, están en el{' '}
              <Link href="/legal" style={{ color: '#343825', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>aviso legal</Link>.
            </p>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>Cómo trabajamos</h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 14 }}>
              {PRINCIPIOS.map((p) => (
                <li key={p.titulo}>
                  <strong style={{ display: 'block', fontSize: 15, marginBottom: 2 }}>{p.titulo}</strong>
                  <span style={{ fontSize: 14.5, lineHeight: 1.55, color: '#3A3A34' }}>{p.texto}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Contacto</h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>
              Escríbenos a <a href={`mailto:${LEGAL.email}`} style={{ color: '#343825', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>{LEGAL.email}</a> o por WhatsApp desde el botón de la web. Si eres una instructora, mira{' '}
              <Link href="/network" style={{ color: '#343825', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>Tentare Network</Link>.
            </p>
          </div>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(64px,8vw,110px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Pruébalo con tu estudio de verdad." body="7 días gratis, sin tarjeta y sin permanencia." cta="Probar 7 días gratis" />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/seguridad', label: 'Seguridad' }, { href: '/legal', label: 'Aviso legal' }]} />
    </PageShell>
  );
}
