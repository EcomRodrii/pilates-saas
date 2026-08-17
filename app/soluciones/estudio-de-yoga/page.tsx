import type { Metadata } from 'next';
import Link from 'next/link';
import { MUTED } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { Callout, Checklist, CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/soluciones/estudio-de-yoga';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: pagina.titulo,
    description: 'Reservas, bonos, cobros y sustituciones — el mismo motor que ya usan estudios de Pilates, sin cambiar de vocabulario ni de forma de dar clase.',
    url: urlDe(PATH),
  },
};

// Lo que ya funciona hoy, en vocabulario de yoga — nada de esto es
// específico de yoga en el código: es el mismo motor genérico (`tipos_clase`,
// reservas, bonos, cobros) que ya usan los estudios de Pilates. Verificado
// antes de escribir esto: components/configuracion/tab-clases.tsx permite
// renombrar cualquier tipo de clase (el ejemplo del propio código es
// justamente pasar de "Clase abierta" a "Yoga").
const SE_LLEVA = [
  'Series y talleres con su propio horario y aforo de sala',
  'Bonos de sesiones y cuotas mensuales, a la vez si hace falta',
  'Reservas online 24/7, con lista de espera automática',
  'Cobro recurrente con reintentos si una cuota falla',
  'Ficha de cada alumna: asistencia, bonos e historial',
  'Facturación con Veri*factu, sin pasarte una tarde al mes',
];

const FAQ = [
  {
    q: '¿Tentare está pensado para yoga o para pilates?',
    a: 'Nació para estudios de Pilates — sigue siendo su foco principal. Pero el motor de reservas, bonos, cobros y sustituciones no tiene nada de pilates-específico por dentro: un tipo de clase es un nombre que tú pones, y funciona igual para una serie de Hatha que para una clase de reformer.',
  },
  {
    q: '¿Puedo tener talleres puntuales y clases semanales a la vez?',
    a: 'Sí. Un taller de fin de semana y una serie fija de martes y jueves son dos tipos de clase distintos, cada uno con su propio aforo, precio y reglas de reserva — no hay que forzar todo al mismo molde.',
  },
  {
    q: '¿Cómo funcionan las sustituciones si una profesora no puede dar su clase?',
    a: 'El mismo motor que ya usan los estudios de Pilates: busca quién puede cubrir esa clase, contacta y avisa a las alumnas si hace falta. Yoga ya es una especialidad propia dentro de Tentare Network, el marketplace de instructoras — no es una adaptación futura, ya está.',
  },
  {
    q: '¿Hay algo de Tentare pensado específicamente para yoga que no exista para pilates?',
    a: 'No, hoy no. Es la misma plataforma, sin funciones exclusivas para ninguna de las dos disciplinas. Si eso cambia, esta página se actualiza para reflejarlo — no antes.',
  },
];

export default function EstudioDeYogaPage() {
  const relacionadas = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Estudio de Yoga" />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Para estudios de Yoga</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Tentare, para estudios de Yoga también.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>Nació para estudios de <strong style={{ color: '#1A1A1A' }}>Pilates</strong>, y sigue siendo su foco. Pero el motor de reservas, bonos, cobros y sustituciones no distingue disciplinas — funciona igual para una serie de yoga que para una clase de reformer.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(24px,4vw,40px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Checklist eyebrow="Lo que ya cubre, sin adaptar nada" items={SE_LLEVA} />
          </Reveal>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Sustituciones, también aquí</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>Cuando una profesora avisa de que no puede dar su clase, el mismo motor busca quién puede cubrirla y avisa a las alumnas si hace falta. Yoga ya es una especialidad propia en <strong>Tentare Network</strong> —el marketplace de instructoras de Tentare— junto a reformer, mat y HIIT: no es una promesa a futuro, ya está construido así.</p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Callout title="Con honestidad: qué no es (todavía)" iconColor="#C79A2E" bg="#FBF6EA" border="#EEDFB8">
              No hay ninguna función pensada solo para yoga — sin seguimiento de certificaciones (RYT o similares), sin vocabulario de posturas o secuencias integrado. Es la misma plataforma que un estudio de Pilates, sin una capa extra todavía. Si alguna vez la hay, esta página se actualiza para contarlo — no antes.
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
          <CtaBlock title="Pruébalo con tu propio estudio." body="Sin permanencia. Migramos tus datos por ti." />
        </div>
      </section>

      {relacionadas.length > 0 && (
        <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8E8E86', margin: '0 0 18px' }}>Sigue por aquí</h2>
            <div className="yog-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="yog-rel-card">
                  <span className="yog-rel-nombre">{r.etiqueta}</span>
                  <span className="yog-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }]} />

      <style>{`
        .yog-rel { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
        .yog-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px; text-decoration: none; transition: transform .18s ease, box-shadow .18s ease; }
        .yog-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .yog-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
        .yog-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
        @media (max-width: 760px) { .yog-rel { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .yog-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
