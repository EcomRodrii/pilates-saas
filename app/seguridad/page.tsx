import type { Metadata } from 'next';
import { Activity, CreditCard, Database, Download, FileCheck, Globe, Layers, Lock, Shield, X } from 'lucide-react';
import { ACC, MUTED, MUTED_DARK } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/seguridad';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    title: pagina.titulo,
    description: 'Datos aislados por estudio, alojados en la UE y conformes al RGPD. Sin permanencia.',
    url: urlDe(PATH),
    images: [{ url: '/seguridad/opengraph-image' }],
  },
};

function Icon({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return <div style={{ width: 44, height: 44, borderRadius: 12, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{children}</div>;
}

const PILLARS = [
  {
    bg: '#F1F2EA', fg: ACC,
    icon: <Layers size={21} />,
    title: 'Cada estudio, aislado',
    body: 'Seguridad a nivel de fila en todas las tablas de la base de datos: tu estudio accede únicamente a sus propios datos, nunca a los de otro. Es una barrera técnica, no solo una pantalla.',
  },
  {
    bg: '#EDF3F4', fg: '#3E7C86',
    icon: <Globe size={21} />,
    title: 'Datos en Europa, RGPD',
    body: 'La información se aloja en la Unión Europea y se trata conforme al RGPD. No cruza el Atlántico como en las suites estadounidenses.',
  },
  {
    bg: '#F1F2EA', fg: '#C2503A',
    icon: <Activity size={21} />,
    title: 'Datos de salud, con consentimiento',
    body: 'La ficha clínica de tus alumnas (lesiones, embarazo, condiciones) es categoría especial del RGPD. Se guarda con consentimiento explícito y acceso restringido por rol.',
  },
  {
    bg: '#E7F3EC', fg: '#4E9E7F',
    icon: <FileCheck size={21} />,
    title: 'Facturación legal (Veri*factu)',
    body: 'Las facturas se emiten con encadenamiento por hash y código QR, según el estándar Veri*factu español. Corrección fiscal de serie, sin capas externas.',
  },
  {
    bg: '#F1F2EA', fg: '#5A6142',
    icon: <CreditCard size={21} />,
    title: 'Pagos que no tocan tu servidor',
    body: 'Los cobros se procesan con Stripe. Tentare no almacena los números de tarjeta de tus alumnas — los gestiona el proveedor de pagos certificado.',
  },
  {
    bg: '#F1F2EA', fg: ACC,
    icon: <Database size={21} />,
    title: 'Copias de seguridad',
    body: 'Guardamos copias fuera de la propia base de datos, en almacenamiento independiente. Si algo se tuerce, tu información se puede restaurar.',
  },
];

const NEVER = [
  'No vendemos ni cedemos los datos de tus alumnas a terceros para publicidad.',
  'No guardamos números de tarjeta en nuestros servidores.',
  'No te atamos con contratos de permanencia ni cobros por marcharte.',
];

export default function SeguridadPage() {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <PageBreadcrumb path="/seguridad" name="Seguridad" />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', background: '#0F0F0F', color: '#E8E8E4', overflow: 'hidden', padding: 'clamp(52px,7vw,92px) clamp(20px,4vw,44px) clamp(44px,6vw,72px)' }}>
        <div style={{ position: 'absolute', top: '-18%', right: '-6%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(90,97,66,.28), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 800, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A8B080', background: 'rgba(90,97,66,.16)', padding: '8px 15px', borderRadius: 999, marginBottom: 22 }}>
            <Shield size={14} />
            Seguridad y privacidad
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px', color: '#fff' }}>Tus datos y los de tus<br />alumnas, protegidos.</h1>
          <p style={{ fontSize: 'clamp(17px,1.6vw,20px)', lineHeight: 1.55, color: MUTED_DARK, maxWidth: 600, margin: '0 0 30px' }}>Tentare gestiona información sensible de tu negocio y de tus socias. Está construido desde el primer día para que esos datos estén aislados, alojados en Europa y bajo tu control.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {['Datos alojados en la UE', 'Conforme al RGPD', 'Cifrado en tránsito', 'Sin permanencia'].map((t) => (
              <span key={t} className="lp-mono" style={{ fontSize: 12, color: '#D8D8D2', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 999, padding: '8px 14px' }}>{t}</span>
            ))}
          </div>
        </div>
      </header>

      <section style={{ padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="sec-grid">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 70} style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 20, padding: 26 }}>
                <Icon bg={p.bg} fg={p.fg}>{p.icon}</Icon>
                <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 8px' }}>{p.title}</h2>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED, margin: 0 }}>{p.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="sec-two" style={{ marginTop: 22 }}>
            <Reveal style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 20, padding: 28 }}>
              <Icon bg="rgba(255,255,255,.08)" fg="#A8B080"><Lock size={21} /></Icon>
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 8px', color: '#fff' }}>Acceso protegido</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Inicio de sesión seguro con tu cuenta o con Google, permisos por rol para tu equipo, límites anti-abuso en las peticiones y monitorización continua de errores. Cada instructora ve solo lo que le corresponde.</p>
            </Reveal>
            <Reveal delay={90} style={{ background: '#0F0F0F', color: '#E8E8E4', borderRadius: 20, padding: 28 }}>
              <Icon bg="rgba(255,255,255,.08)" fg="#7BD3A8"><Download size={21} /></Icon>
              <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 8px', color: '#fff' }}>Tus datos son tuyos</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.55, color: MUTED_DARK, margin: 0 }}>Sin permanencia y sin secuestro de datos. Puedes exportar tus alumnas, tu historial y tus facturas cuando quieras. Si un día te vas, te vas con todo.</p>
            </Reveal>
          </div>

          <Reveal style={{ marginTop: 44, textAlign: 'center' }}>
            <div className="lp-mono" style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#A8A89F', marginBottom: 18 }}>Construido sobre infraestructura de referencia</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {['Supabase · Postgres + Auth', 'Stripe · pagos', 'Cloudflare · copias y vídeo', 'Sentry · monitorización'].map((t) => (
                <span key={t} className="lp-mono" style={{ fontSize: 13, color: '#5A5A52', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 12, padding: '11px 18px' }}>{t}</span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section style={{ background: '#F3F3EF', borderTop: '1px solid #E7E7E0', padding: 'clamp(56px,7vw,88px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <Reveal className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#22251A', marginBottom: 16 }}>Nuestro compromiso</Reveal>
          <Reveal delay={80}><h2 style={{ fontWeight: 800, fontSize: 'clamp(26px,3.6vw,40px)', lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 26px' }}>Lo que <span style={{ color: ACC }}>nunca</span> hacemos con tus datos.</h2></Reveal>
          <Reveal delay={120} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {NEVER.map((t) => (
              <div key={t} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 14, padding: '18px 20px' }}>
                <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, background: '#F1F2EA', color: '#C2503A', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <X size={14} strokeWidth={2.4} />
                </span>
                <span style={{ fontSize: 15.5, lineHeight: 1.5, color: '#3A3A34' }}>{t}</span>
              </div>
            ))}
          </Reveal>
          <p className="lp-mono" style={{ fontSize: 12, color: '#A8A89F', margin: '24px 0 0', lineHeight: 1.6 }}>
            ¿Necesitas un acuerdo de tratamiento de datos (DPA) o detalles para tu asesoría? Escríbenos a <a href="mailto:hola@tentare.app" style={{ color: ACC }}>hola@tentare.app</a> y te lo damos.
          </p>
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Tranquila con tus datos. Y con tu estudio." />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/recursos', label: 'Recursos' }]} />

      <style>{`
        .sec-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
        .sec-two { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
        @media (max-width: 900px) {
          .sec-grid { grid-template-columns: 1fr 1fr; }
          .sec-two { grid-template-columns: 1fr; }
        }
        @media (max-width: 600px) {
          .sec-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </PageShell>
  );
}
