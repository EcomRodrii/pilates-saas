import type { Metadata } from 'next';
import { Activity, CreditCard, Database, Download, FileCheck, Globe, Layers, Lock, Shield, X } from 'lucide-react';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { IslaWeb } from '@/components/web/IslaWeb';
import { PieWeb } from '@/components/web/PieWeb';
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
    siteName: 'Tentare',
    type: 'website',
    title: pagina.titulo,
    description: 'Datos aislados por estudio, base de datos en la UE y diseñado con el RGPD en mente. Sin permanencia.',
    url: urlDe(PATH),
    images: [{ url: '/seguridad/opengraph-image' }],
  },
};

// Sin baldosa teñida (fase 2.5): el icono va solo, en oliva, como en la home.
function Icon({ children }: { children: React.ReactNode }) {
  return <div className="sec-icono" aria-hidden>{children}</div>;
}

const PILLARS = [
  {
    icon: <Layers size={22} />,
    title: 'Cada estudio, aislado',
    body: 'Seguridad a nivel de fila en todas las tablas de la base de datos: tu estudio accede únicamente a sus propios datos, nunca a los de otro. Es una barrera técnica, no solo una pantalla.',
  },
  {
    icon: <Globe size={22} />,
    title: 'Datos en Europa, RGPD',
    body: 'La base de datos se aloja en la Unión Europea (Fráncfort). Algunos proveedores que usamos pueden tratar datos fuera de la UE: están listados, con su ubicación, en la política de privacidad.',
  },
  {
    icon: <Activity size={22} />,
    title: 'Datos de salud, con consentimiento',
    body: 'La ficha clínica de tus alumnas (lesiones, embarazo, condiciones) es categoría especial del RGPD. Se guarda con consentimiento explícito y acceso restringido por rol.',
  },
  {
    icon: <FileCheck size={22} />,
    title: 'Facturas con numeración legal',
    body: 'Las facturas se emiten con numeración legal correlativa. Veri*Factu (la huella, el QR y el envío del registro a la AEAT) todavía no está activo en ningún estudio: hoy no llevan huella ni QR y no se envían a la AEAT.',
  },
  {
    icon: <CreditCard size={22} />,
    title: 'Pagos que no tocan tu servidor',
    body: 'Los cobros se procesan con Stripe. Tentare no almacena los números de tarjeta de tus alumnas — los gestiona el proveedor de pagos certificado.',
  },
  {
    icon: <Database size={22} />,
    title: 'Copias de seguridad',
    body: 'Guardamos una copia diaria fuera de la propia base de datos, en almacenamiento independiente. La restauración desde el panel está desactivada temporalmente: si necesitas recuperar datos, lo hacemos contigo desde soporte.',
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
      <IslaWeb />

      <header className="sec-cab">
        <div className="sec-cab-in">
          <p className="sec-antetitulo"><Shield size={16} aria-hidden /> Seguridad y privacidad</p>
          <h1 className="sec-h1">Tus datos y los de tus<br />alumnas, protegidos.</h1>
          <p className="sec-entrada">Tentare gestiona información sensible de tu negocio y de tus socias. Está construido desde el primer día para que esos datos estén aislados, alojados en Europa y bajo tu control.</p>
          <ul className="sec-sellos">
            {['Base de datos en la UE', 'Diseñado con el RGPD en mente', 'Cifrado en tránsito', 'Sin permanencia'].map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </header>

      <section className="sec-zona">
        <div className="sec-ancho">
          <div className="sec-grid">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={(i % 3) * 70} className="sec-tarjeta">
                <Icon>{p.icon}</Icon>
                <h2 className="sec-tarjeta-h">{p.title}</h2>
                <p className="sec-tarjeta-p">{p.body}</p>
              </Reveal>
            ))}
          </div>

          <div className="sec-two">
            <Reveal className="sec-tarjeta">
              <Icon><Lock size={22} /></Icon>
              <h2 className="sec-tarjeta-h">Acceso protegido</h2>
              <p className="sec-tarjeta-p">Inicio de sesión seguro con tu cuenta o con Google, permisos por rol para tu equipo, límites anti-abuso en las peticiones y monitorización continua de errores. Cada instructora ve solo lo que le corresponde.</p>
            </Reveal>
            <Reveal delay={90} className="sec-tarjeta">
              <Icon><Download size={22} /></Icon>
              <h2 className="sec-tarjeta-h">Tus datos son tuyos</h2>
              <p className="sec-tarjeta-p">Sin permanencia y sin secuestro de datos. Puedes exportar tus alumnas, tu historial y tus facturas cuando quieras. Si un día te vas, te llevas tus alumnas, sus reservas, sus cobros y tus facturas.</p>
            </Reveal>
          </div>

          <Reveal className="sec-infra">
            <p className="sec-infra-t">Construido sobre infraestructura de referencia</p>
            <ul className="sec-sellos sec-sellos-claros">
              {['Supabase · Postgres + Auth', 'Stripe · pagos', 'Cloudflare · copias y antibots', 'Sentry · monitorización'].map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="sec-nunca">
        <div className="sec-nunca-in">
          <Reveal><p className="sec-antetitulo sec-antetitulo-claro">Nuestro compromiso</p></Reveal>
          <Reveal delay={80}><h2 className="sec-h2">Lo que nunca hacemos con tus datos.</h2></Reveal>
          <Reveal delay={120}>
            <ul className="sec-nunca-lista">
              {NEVER.map((t) => (
                <li key={t}>
                  <X size={18} strokeWidth={2.2} aria-hidden className="sec-nunca-x" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <p className="sec-dpa">
            ¿Necesitas detalles para tu asesoría? Escríbenos a <a href="mailto:hola@tentare.app">hola@tentare.app</a>.
          </p>
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) var(--w-margen)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="Tranquila con tus datos. Y con tu estudio." />
        </div>
      </section>

      <PieWeb />

      <style>{`
        .sec-cab { background: var(--w-noche); color: var(--w-sobre-noche); padding: clamp(56px,8vw,104px) var(--w-margen) clamp(48px,6vw,80px); }
        .sec-cab-in { max-width: 800px; margin: 0 auto; }
        .sec-antetitulo { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 20px; font-size: 14px; font-weight: var(--w-peso-enfasis); color: var(--w-sand); }
        .sec-antetitulo-claro { color: var(--w-olive); }
        .sec-h1 { margin: 0 0 20px; font-weight: var(--w-peso-titular); font-size: var(--w-fs-h1); line-height: 1.04; letter-spacing: var(--w-track-h1); color: var(--w-sobre-noche); }
        .sec-entrada { max-width: 600px; margin: 0 0 30px; font-size: clamp(17px,1.6vw,20px); line-height: 1.55; color: var(--w-sobre-noche-2); }
        .sec-sellos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px; }
        .sec-sellos li { font-size: 14px; color: var(--w-sobre-noche); border: 1px solid var(--w-linea-noche); border-radius: 999px; padding: 8px 15px; }
        .sec-sellos-claros { justify-content: center; }
        .sec-sellos-claros li { color: var(--w-texto-2); background: var(--w-papel); border-color: var(--w-linea); }
        .sec-zona { padding: var(--w-seccion) var(--w-margen); }
        .sec-ancho { max-width: 1120px; margin: 0 auto; }
        .sec-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 18px; }
        .sec-two { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; margin-top: 18px; }
        .sec-tarjeta { background: var(--w-papel); border: 1px solid var(--w-linea); border-radius: var(--w-r-tarjeta); padding: 28px; }
        .sec-icono { display: flex; color: var(--w-olive); margin-bottom: 18px; }
        .sec-tarjeta-h { margin: 0 0 8px; font-size: 19px; font-weight: var(--w-peso-titular); letter-spacing: -.015em; line-height: 1.25; color: var(--w-texto); }
        .sec-tarjeta-p { margin: 0; font-size: 15px; line-height: 1.6; color: var(--w-texto-2); }
        .sec-infra { margin-top: 48px; text-align: center; }
        .sec-infra-t { margin: 0 0 18px; font-size: 14px; font-weight: var(--w-peso-enfasis); color: var(--w-texto-3); }
        .sec-nunca { background: var(--w-papel); border-top: 1px solid var(--w-linea); padding: var(--w-seccion) var(--w-margen); }
        .sec-nunca-in { max-width: 820px; margin: 0 auto; }
        .sec-h2 { margin: 0 0 28px; font-weight: var(--w-peso-titular); font-size: var(--w-fs-h2); line-height: 1.08; letter-spacing: var(--w-track-h2); color: var(--w-texto); }
        .sec-nunca-lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
        .sec-nunca-lista li { display: flex; gap: 14px; align-items: flex-start; padding: 18px 0; border-top: 1px solid var(--w-linea); font-size: 16.5px; line-height: 1.5; color: var(--w-texto); }
        .sec-nunca-lista li:last-child { border-bottom: 1px solid var(--w-linea); }
        .sec-nunca-x { flex-shrink: 0; margin-top: 2px; color: var(--w-error); }
        .sec-dpa { margin: 24px 0 0; font-size: 15px; line-height: 1.6; color: var(--w-texto-2); }
        .sec-dpa a { color: var(--w-olive); font-weight: var(--w-peso-enfasis); text-decoration: underline; text-underline-offset: 3px; }
        @media (max-width: 900px) {
          .sec-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .sec-two { grid-template-columns: minmax(0,1fr); }
        }
        @media (max-width: 600px) {
          .sec-grid { grid-template-columns: minmax(0,1fr); }
          .sec-tarjeta { padding: 24px; }
        }
      `}</style>
    </PageShell>
  );
}
