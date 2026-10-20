import type { Metadata } from 'next';
import Link from 'next/link';
import { MUTED } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
import { Callout, Checklist, CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData, PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';
import { SE_LLEVA } from '@/lib/landing/migracion';

const PATH = '/soluciones/cambiar-de-software';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    siteName: 'Tentare',
    type: 'website',
    title: pagina.titulo,
    description: 'Se hace tú misma en el panel. Nada se importa sin que lo revises antes.',
    url: urlDe(PATH),
  },
};

// Los 6 tipos de dato que el importador real mueve viven en lib/landing/migracion.ts
// (SE_LLEVA): la home enseña la misma lista, y dos copias solo pueden desincronizarse.

const FAQ = [
  {
    q: '¿En qué formato tengo que exportar mis datos?',
    a: 'CSV — el importador detecta solas comas, punto y coma (el formato habitual de Excel en español) o tabuladores.',
  },
  {
    q: '¿Se pierden las tarjetas guardadas de mis alumnas?',
    a: 'Como en cualquier cambio de proveedor de pagos, las tarjetas guardadas no se migran automáticamente — ningún software puede leer el número de tarjeta que otro tiene tokenizado. Cada alumna tendrá que volver a introducir su tarjeta una vez, la primera vez que le cobres con Tentare.',
  },
  {
    q: '¿Qué pasa si algo se importa mal?',
    a: 'Nada se toca sin que lo revises primero: antes de ejecutar nada ves una muestra de lo que se va a crear, qué filas van en cuarentena (duplicadas o con error) y qué avisos hay. Y todo lote importado tiene un botón de deshacer.',
  },
  {
    q: '¿Tengo que dejar de usar mi software actual mientras migro?',
    a: 'No. Tu software actual sigue funcionando exactamente igual mientras preparas el cambio — no hay un corte ni una ventana de mantenimiento.',
  },
];

export default function CambiarDeSoftwarePage() {
  const relacionadas = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <FaqStructuredData items={FAQ} />
      <PageBreadcrumb path={PATH} name="Cambiarte de software" />
      <IslaWeb />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Cambiarte de software</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Cambiarte a Tentare, sin perder nada.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>Tu <strong style={{ color: '#1A1A1A' }}>estudio de Pilates</strong> se lleva sus clientas, sus bonos, su calendario y su historial. Lo haces tú misma en el panel.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(24px,4vw,40px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Checklist eyebrow="Qué te llevas contigo" items={SE_LLEVA} />
          </Reveal>
        </div>
      </section>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Tú misma, en el panel</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>Subes tus exports en CSV y el sistema te enseña el plan antes de tocar nada: una muestra de lo que va a crear, qué filas quedan en cuarentena y qué avisos hay. Solo cuando lo confirmas, se ejecuta — con acta y botón de deshacer.</p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Callout title="Lo que no se lleva solo" iconColor="#C79A2E" bg="#FBF6EA" border="#EEDFB8">
              Las tarjetas guardadas de tus alumnas no se migran automáticamente — ningún software puede leer un número de tarjeta que otro tiene tokenizado. Cada alumna la vuelve a introducir una vez, la primera vez que le cobres con Tentare. Es una limitación de cómo funciona la tokenización de pagos, no algo específico de Tentare.
            </Callout>
          </Reveal>
        </div>
      </section>

      <section style={{ background: '#0F0F0F', color: '#E8E8E4', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#A8B080', marginBottom: 16 }}>Preguntas frecuentes</Reveal>
          <ArticleFaq items={FAQ} />
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="¿Prefieres verlo antes de decidir?" body="Compara Tentare con tu software actual, punto por punto." href="/comparativa" cta="Ver la comparativa →" />
        </div>
      </section>

      {relacionadas.length > 0 && (
        <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#6B6B63', margin: '0 0 18px' }}>Sigue por aquí</h2>
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

      <PieWeb />

      <style>{`
        .sol-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .sol-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .sol-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .sol-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
        .sol-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
        @media (max-width: 760px) { .sol-rel { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .sol-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
