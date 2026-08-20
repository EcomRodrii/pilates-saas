import type { Metadata } from 'next';
import Link from 'next/link';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { FeatureFaq } from '@/components/funcionalidades/bloques';
import { ComparativaPlanes } from '@/components/planes/comparativa-planes';
import { PLANES, PLAN_ENTITLEMENTS, PLAN_INFO, TRIAL_DIAS, type Plan } from '@/lib/billing/entitlements';
import { funcionalidades, paginaDe, urlDe, BASE_URL } from '@/lib/seo/paginas';
import { LEGAL } from '@/lib/legal-info';

const PATH = '/precios';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

// Precios, topes y features salen de lib/billing/entitlements.ts — la MISMA
// fuente que gobierna lo que el producto deja hacer de verdad. Escribirlos a
// mano aquí sería la vía rápida a una página de precios que promete un límite
// distinto del que aplica el servidor.
const RESUMEN: Record<Plan, { gancho: string; para: string; cta: string }> = {
  BASE: { gancho: 'Para empezar', para: 'Un estudio con una sala y una o dos instructoras.', cta: 'Empezar gratis' },
  ESTUDIO: { gancho: 'El más elegido', para: 'Un estudio en marcha, con equipo y horario completo.', cta: 'Empezar gratis' },
  CADENA: { gancho: 'Varias sedes', para: 'Dos o más centros bajo la misma marca.', cta: 'Hablar con nosotros' },
};

function tope(plan: Plan): string {
  const max = PLAN_ENTITLEMENTS[plan].maxSocios;
  return max === Infinity ? 'Sin límite de alumnas' : `Hasta ${max} alumnas activas`;
}

// La comparativa por categorías vive en lib/billing/catalogo-planes.ts y la
// pinta <ComparativaPlanes>. Esta página tenía su propia lista de 11 filas
// escrita a mano, y /suscripcion otra distinta de 4 bullets por plan: dos
// promesas del mismo producto que ya habían empezado a separarse. El
// comentario que había aquí excluía `marketing`, `ia` y `gamificacion` por
// estar desactivadas — dejó de ser cierto el 2026-08-13, cuando
// MARKETING_MODULE_ENABLED volvió a true, y nadie lo revisó.

const FAQ = [
  {
    q: `¿La prueba de ${TRIAL_DIAS} días pide tarjeta?`,
    a: `No. Creas tu estudio y entras: ${TRIAL_DIAS} días con todo abierto sin darnos ningún dato de pago. Al terminar no se te cobra nada — si no eliges plan, la prueba simplemente se acaba y tus datos siguen ahí intactos, sin borrar nada.`,
  },
  {
    q: `¿Qué pasa exactamente cuando terminan los ${TRIAL_DIAS} días?`,
    a: 'Que dejas de poder entrar al panel hasta que elijas un plan. No se borra nada: tus alumnas, tus clases, tus bonos y tus facturas siguen donde estaban, y en cuanto contrates vuelves a encontrarlo todo tal cual lo dejaste. Tus alumnas tampoco pierden su historial.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'No. Se paga mes a mes y se cancela cuando quieras. Tus datos son tuyos: puedes exportar alumnas, historial y facturas en cualquier momento, también al irte.',
  },
  {
    q: '¿Os lleváis una comisión de lo que cobro a mis alumnas?',
    a: 'No. Tentare no añade ninguna comisión sobre tus cobros ni tiene un marketplace donde competir por tus clientas. Lo que sí pagas es la comisión de Stripe por procesar cada pago, que es de Stripe y la ves en su propio panel.',
  },
  {
    q: '¿Qué pasa si supero las 150 alumnas del plan Base?',
    a: 'El tope se aplica sobre alumnas activas: al llegar al límite no puedes dar de alta a más hasta que pases al plan Estudio. No se corta nada de lo que ya tienes ni se borra a nadie.',
  },
  {
    q: '¿Y si un mes falla el cobro de mi suscripción?',
    a: 'No se corta el servicio a la primera. Mientras el pago está en reintento el estudio sigue funcionando, para que un problema puntual de tarjeta no deje a tus alumnas sin poder reservar.',
  },
  {
    q: '¿La migración desde otra plataforma cuesta aparte?',
    a: 'No se cobra aparte. Traes tus datos con los asistentes de importación y te acompañamos en la puesta en marcha; tu sistema actual puede seguir funcionando mientras tanto.',
  },
  {
    q: '¿Puedo cambiar de plan más adelante?',
    a: 'Sí, en los dos sentidos. Si bajas de plan, las funciones exclusivas del plan superior dejan de estar disponibles — por ejemplo, las sustituciones autónomas vuelven a modo asistido en lugar de seguir operando solas.',
  },
];

export default function PreciosPage() {
  // SoftwareApplication + Offer viven aquí y en la home, y en ningún otro sitio:
  // es una sola entidad, y repetirla en cada página de funcionalidad la
  // convertiría en once declaraciones del mismo producto.
  const ofertaLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: LEGAL.marca,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, iOS, Android',
    url: BASE_URL,
    description: pagina.descripcion,
    offers: PLANES.map((p) => ({
      '@type': 'Offer',
      name: PLAN_INFO[p].nombre,
      price: PLAN_INFO[p].precioMes,
      priceCurrency: 'EUR',
      url: urlDe(PATH),
      description: PLAN_INFO[p].resumen,
    })),
  };

  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Precios" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ofertaLd).replace(/</g, '\\u003c') }} />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(44px,6.5vw,84px) clamp(20px,4vw,44px) clamp(26px,3.5vw,38px)', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: -150, left: '50%', transform: 'translateX(-50%)', width: 620, height: 620, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,97,66,.14), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Precios</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 18px' }}>Precio público.<br />Sin permanencia.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, margin: '0 auto', maxWidth: 560 }}>
            Tres planes, publicados. Sin «solicita una demo para saber el precio», sin comisión sobre tus cobros y sin
            contrato anual.
          </p>
          <p className="lp-mono" style={{ display: 'inline-block', marginTop: 20, padding: '8px 16px', borderRadius: 999, background: ACC, color: '#D9C29E', fontSize: 13, fontWeight: 700 }}>
            {TRIAL_DIAS} días gratis · Sin tarjeta de crédito
          </p>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 clamp(20px,4vw,44px) clamp(52px,7vw,84px)' }}>
        <div className="pre-grid">
          {PLANES.map((p) => {
            const destacado = p === 'ESTUDIO';
            return (
              <div
                key={p}
                style={{
                  background: destacado ? '#0F0F0F' : '#fff',
                  color: destacado ? '#E8E8E4' : undefined,
                  border: destacado ? 'none' : '1px solid #E7E7E0',
                  borderRadius: 24, padding: 'clamp(26px,3vw,34px)', position: 'relative',
                  boxShadow: destacado ? '0 34px 66px -26px rgba(26,26,26,.45)' : undefined,
                }}
              >
                {destacado && (
                  <div className="lp-mono" style={{ position: 'absolute', top: -12, left: 32, background: ACC, color: '#D9C29E', fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '6px 13px', borderRadius: 999 }}>MÁS ELEGIDO</div>
                )}
                <div className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.1em', textTransform: 'uppercase', color: destacado ? '#A8B080' : '#8E8E86', marginBottom: 12 }}>{PLAN_INFO[p].nombre}</div>
                <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.035em', color: destacado ? '#fff' : undefined, lineHeight: 1 }}>
                  {PLAN_INFO[p].precioMes}€<span style={{ fontSize: 15, fontWeight: 500, color: '#8E8E86' }}>/mes</span>
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: destacado ? '#A6A69E' : MUTED, margin: '10px 0 6px' }}>{RESUMEN[p].para}</p>
                <p className="lp-mono" style={{ fontSize: 11.5, color: destacado ? '#D9C29E' : '#5A6142', margin: '0 0 20px' }}>{tope(p)}</p>
                <Link
                  href={p === 'CADENA' ? 'mailto:hola@tentare.app?subject=Plan%20Cadena' : '/crear-estudio'}
                  className="block hover:brightness-110 transition-all"
                  style={{ textAlign: 'center', display: 'block', background: destacado ? '#D9C29E' : '#F3F3EF', color: destacado ? '#343825' : '#1A1A1A', fontWeight: 700, fontSize: 15, padding: 14, borderRadius: 14, textDecoration: 'none' }}
                >
                  {RESUMEN[p].cta}
                </Link>
              </div>
            );
          })}
        </div>

        <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,32px)', letterSpacing: '-.03em', margin: '0 0 8px' }}>Qué incluye cada plan</h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 0 22px' }}>
            Lo esencial —reservas, cobros, facturación y fichas— está en los tres. Lo que cambia es el tamaño y cuánto
            trabaja el sistema por su cuenta.
          </p>
          <ComparativaPlanes todoAbierto destacado="ESTUDIO" />
          <p className="lp-mono" style={{ fontSize: 11.5, color: '#A8A89F', margin: '14px 0 0' }}>
            Cada funcionalidad tiene su página con el detalle: <Link href="/funcionalidades" style={{ color: ACC }}>ver todas</Link>
          </p>
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,32px)', letterSpacing: '-.03em', margin: '0 0 8px' }}>Qué se paga aparte y qué no</h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 0 22px' }}>Dicho antes de que lo preguntes, porque es donde el sector suele esconder cosas.</p>
          <div className="pre-dos">
            <div style={{ background: '#F4F8F5', border: '1px solid #DFEBE3', borderRadius: 18, padding: '22px 24px' }}>
              <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#3B7D64', marginBottom: 14 }}>Incluido en la cuota</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                {['Todas las funcionalidades de tu plan', 'Actualizaciones y funciones nuevas', 'Importación de tus datos desde otra plataforma', 'Soporte en español', 'Facturación con Veri*Factu', 'Exportación de tus datos cuando quieras'].map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 9, fontSize: 14.5, lineHeight: 1.5, color: '#3A3A34' }}>
                    <span style={{ color: '#4E9E7F', flexShrink: 0 }}>✓</span>{t}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ background: '#FAFAF6', border: '1px solid #EDEDE5', borderRadius: 18, padding: '22px 24px' }}>
              <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8E6B1E', marginBottom: 14 }}>No lo cobramos nosotros</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: '#3A3A34' }}>
                  <strong>La comisión de Stripe</strong> por procesar cada cobro con tarjeta. Es de Stripe, la ves en su
                  panel y Tentare no añade nada encima.
                </li>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: '#3A3A34' }}>
                  <strong>Tu número de WhatsApp Business</strong>, si quieres enviar por ese canal: se conecta tu propia
                  cuenta de Meta, no una compartida.
                </li>
                <li style={{ fontSize: 14.5, lineHeight: 1.5, color: '#3A3A34' }}>
                  <strong>Lo que te cobre tu banco</strong> por presentar remesas SEPA, si cobras por domiciliación.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,32px)', letterSpacing: '-.03em', margin: '0 0 18px' }}>Preguntas sobre el precio</h2>
          <FeatureFaq items={FAQ} />
        </section>

        <section style={{ marginTop: 'clamp(44px,5.5vw,68px)' }}>
          <h2 style={{ fontWeight: 800, fontSize: 'clamp(23px,2.8vw,32px)', letterSpacing: '-.03em', margin: '0 0 8px' }}>Antes de decidir</h2>
          <p style={{ fontSize: 16, color: MUTED, margin: '0 0 20px' }}>Mira en detalle lo que vas a usar cada día.</p>
          <div className="pre-links">
            {funcionalidades().slice(0, 6).map((f) => (
              <Link key={f.path} href={f.path} style={{ display: 'block', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '15px 17px', textDecoration: 'none', color: 'inherit', fontSize: 14.5, fontWeight: 600 }}>
                {f.etiqueta}
              </Link>
            ))}
          </div>
          <p style={{ fontSize: 15, color: MUTED, margin: '18px 0 0' }}>
            Y si vienes de otra plataforma, la <Link href="/comparativa" style={{ color: ACC }}>comparativa</Link> va punto
            por punto — incluido lo que ellos hacen mejor.
          </p>
        </section>
      </div>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/seguridad', label: 'Seguridad' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .pre-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; align-items: start; }
        .pre-dos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .pre-links { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        @media (max-width: 900px) {
          .pre-grid { grid-template-columns: 1fr; max-width: 440px; margin: 0 auto; }
          .pre-dos { grid-template-columns: 1fr; }
          .pre-links { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 560px) { .pre-links { grid-template-columns: 1fr; } }
      `}</style>
    </PageShell>
  );
}
