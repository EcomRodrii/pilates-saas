import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { funcionalidades, paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH), images: [{ url: '/funcionalidades/opengraph-image' }] },
};

// Agrupación editorial del hub. Los `path` salen del registro, así que una
// página nueva no puede quedarse fuera sin que el test de cobertura lo cante —
// pero SÍ hay que meterla en uno de estos bloques a mano, que es la decisión
// que no se puede automatizar: dónde encaja conceptualmente.
const BLOQUES: { titulo: string; lead: string; paths: string[] }[] = [
  {
    titulo: 'Que las clases se llenen',
    lead: 'Lo que tus alumnas tocan, y las reglas con las que lo tocan.',
    paths: ['/funcionalidades/reservas-online', '/funcionalidades/lista-de-espera', '/funcionalidades/calendario-y-salas', '/funcionalidades/cancelaciones-y-politicas', '/funcionalidades/control-de-asistencia'],
  },
  {
    titulo: 'Que el equipo funcione sin ti',
    lead: 'Quién puede dar qué, y qué pasa el día que alguien no puede.',
    paths: ['/funcionalidades/gestion-de-instructoras', '/funcionalidades/sustituciones'],
  },
  {
    titulo: 'Que el dinero entre y cuadre',
    lead: 'Lo que vendes, cómo se cobra y cómo se justifica ante Hacienda.',
    paths: ['/funcionalidades/bonos-y-membresias', '/funcionalidades/cobros-recurrentes', '/funcionalidades/facturacion'],
  },
  {
    titulo: 'Que nadie se te escape',
    lead: 'Lo que sabes de cada alumna, lo que ella ve, y lo que el sistema hace con ambas cosas.',
    paths: ['/funcionalidades/ficha-de-clienta', '/funcionalidades/app-para-alumnas', '/funcionalidades/automatizaciones-y-avisos'],
  },
  {
    titulo: 'Que las decisiones no sean a ojo',
    lead: 'Los números con los que se decide qué franja mover y qué precio tocar.',
    paths: ['/funcionalidades/informes-y-rentabilidad', '/funcionalidades/multi-centro'],
  },
];

// Salvaguarda de coherencia: si algún día una funcionalidad del registro no
// estuviera en ningún bloque, se pinta igualmente al final en vez de
// desaparecer del hub sin avisar (una página huérfana no se ve, y por eso es el
// fallo más fácil de no detectar).
const enBloques = new Set(BLOQUES.flatMap((b) => b.paths));
const SUELTAS = funcionalidades().filter((f) => !enBloques.has(f.path));

export default function FuncionalidadesPage() {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Funcionalidades" />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(44px,6.5vw,84px) clamp(20px,4vw,44px) clamp(28px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Funcionalidades</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Todo lo que hace Tentare,<br />sin adjetivos.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 600, margin: 0 }}>
            {/* El número sale del registro. Escrito a mano decía «diez» y se
                quedó desfasado en cuanto entraron dos páginas más. */}
            {funcionalidades().length} áreas, explicadas por lo que resuelven en un estudio de Pilates de verdad — con sus
            reglas, sus umbrales y también sus límites.
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        {BLOQUES.map((bloque) => (
          <section key={bloque.titulo} style={{ marginBottom: 'clamp(38px,5vw,58px)' }}>
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ fontWeight: 800, fontSize: 'clamp(21px,2.4vw,27px)', letterSpacing: '-.028em', lineHeight: 1.15, margin: '0 0 6px' }}>{bloque.titulo}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.5, color: MUTED, margin: 0 }}>{bloque.lead}</p>
            </div>
            <div className="fun-grid">
              {bloque.paths.map((p) => {
                const f = paginaDe(p);
                if (!f) return null;
                return (
                  <Link key={p} href={p} className="fun-card" style={{ display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 18, padding: '22px 23px', textDecoration: 'none', color: 'inherit' }}>
                    <h3 style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.2, margin: '0 0 8px' }}>{f.etiqueta}</h3>
                    <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: '0 0 16px', flex: 1 }}>{f.resumen}</p>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: ACC }}>
                      Ver cómo funciona
                      <ArrowRight size={15} />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {SUELTAS.length > 0 && (
          <section style={{ marginBottom: 'clamp(38px,5vw,58px)' }}>
            <h2 style={{ fontWeight: 800, fontSize: 'clamp(21px,2.4vw,27px)', letterSpacing: '-.028em', margin: '0 0 18px' }}>Más funcionalidades</h2>
            <div className="fun-grid">
              {SUELTAS.map((f) => (
                <Link key={f.path} href={f.path} className="fun-card" style={{ display: 'block', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 18, padding: '22px 23px', textDecoration: 'none', color: 'inherit' }}>
                  <h3 style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 8px' }}>{f.etiqueta}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: 0 }}>{f.resumen}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 24, padding: 'clamp(28px,4.5vw,48px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: '-34%', right: '-6%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,97,66,.32), transparent 64%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', display: 'flex', gap: 'clamp(20px,4vw,48px)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ maxWidth: 470 }}>
              <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,32px)', lineHeight: 1.12, letterSpacing: '-.03em', margin: '0 0 11px', color: '#fff' }}>Y lo que todavía no hacemos</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.58, color: '#A6A69E', margin: 0 }}>
                No hay app nativa en las tiendas —tus alumnas usan un portal web instalable—, ni herramienta de campañas de
                email marketing, ni pantalla de kiosko para fichar en tablet. Está en la{' '}
                <Link href="/comparativa" style={{ color: '#D9C29E' }}>comparativa</Link>, sin rodeos.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/precios" className="hover:brightness-110" style={{ fontSize: 15.5, fontWeight: 700, color: '#343825', background: '#D9C29E', padding: '14px 26px', borderRadius: 999 }}>Ver precios</Link>
              <Link href="/crear-estudio" style={{ fontSize: 15.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', padding: '14px 26px', borderRadius: 999 }}>Crear mi estudio</Link>
            </div>
          </div>
        </section>
      </div>

      <SiteFooter links={[{ href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/recursos', label: 'Recursos' }, { href: '/glosario', label: 'Glosario' }]} />

      <style>{`
        .fun-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
        .fun-card { transition: transform .26s cubic-bezier(.2,.7,0,1), box-shadow .26s; }
        .fun-card:hover { transform: translateY(-5px); box-shadow: 0 36px 66px -38px rgba(26,26,26,.32); }
        @media (max-width: 900px) { .fun-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px) { .fun-grid { grid-template-columns: 1fr; } }
      `}</style>
    </PageShell>
  );
}
