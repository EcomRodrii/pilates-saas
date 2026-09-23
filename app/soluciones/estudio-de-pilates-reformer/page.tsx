import type { Metadata } from 'next';
import Link from 'next/link';
import { MUTED } from '@/components/landing/theme';
import { Reveal } from '@/components/landing/Reveal';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { Callout, Checklist, CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { ArticleFaq } from '@/components/recursos/ArticleFaq';
import { FaqStructuredData, PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { paginaDe, relacionadasDe, urlDe } from '@/lib/seo/paginas';

// Página pilar del estudio de Pilates REFORMER (fase 5 del rediseño, 23-sep).
//
// No compite con la home —que se queda la búsqueda genérica «software de
// gestión para estudios de Pilates»—: responde a quien busca cómo gestionar un
// estudio de máquinas, donde lo que se vende es un reformer a una hora.
//
// ⚠️ Cada frase está cruzada con el código (registro de afirmaciones de la
// fase 1 del rediseño). En particular: elegir reformer funciona cuando la sala
// tiene sus puestos definidos; la plaza fija la PIDE la alumna y el estudio la
// aprueba; la penalización por cancelación tardía o no-show es opcional y
// exige tarjeta guardada y consentimiento; los bonos online, Stripe conectado.
// No prometer más de lo que hay.

const PATH = '/soluciones/estudio-de-pilates-reformer';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    title: pagina.titulo,
    description: pagina.descripcion,
    url: urlDe(PATH),
  },
};

const LO_QUE_CUBRE = [
  'Cada sala con su aforo, y cada reformer con su plaza: la alumna ve qué máquinas quedan libres y elige la suya',
  'Plazas fijas: la alumna pide su hueco de cada semana desde la app y tú lo apruebas',
  'Lista de espera automática: la plaza que se libera pasa sola a la primera de la cola',
  'Bonos y cuotas por tipo de clase: el reformer y el mat pueden tener precio distinto',
  'Cancelaciones con tu ventana por tipo de clase y, si lo activas, penalización por no-show',
  'Si una instructora no puede, Tentare busca quién cubre la clase y avisa a las alumnas',
  'Qué deja cada clase: ingresos menos lo que cuesta la instructora, clase por clase',
];

const FAQ = [
  {
    q: '¿Puedo limitar cada clase al número de reformers de la sala?',
    a: 'Sí. Cada sala tiene su capacidad y cada clase respeta ese aforo. Si además defines los puestos de la sala, la alumna ve qué reformers quedan libres al reservar y elige el suyo, como en el cine. Si no los defines, funciona con el aforo de la sala.',
  },
  {
    q: '¿Puedo cobrar distinto el reformer y el mat?',
    a: 'Sí. Los bonos y las cuotas pueden ser de un tipo de clase concreto, así que el reformer y el mat tienen cada uno su precio. Una alumna puede tener a la vez un bono de reformer y una cuota de mat. Para venderlos online hace falta conectar tu cuenta de Stripe; también puedes apuntar pagos en efectivo o por transferencia.',
  },
  {
    q: '¿Cómo funcionan las plazas fijas?',
    a: 'La alumna pide desde la app su hueco de cada semana (por ejemplo, el reformer de los martes a las 19:00) y tú lo apruebas. A partir de ahí se le reserva sola cada semana, y desde el panel puedes pausarla o quitarla.',
  },
  {
    q: '¿Qué pasa con una plaza cuando alguien cancela?',
    a: 'Si hay lista de espera, la plaza pasa sola a la primera de la cola, al instante o con el plazo que tú decidas para que la acepte. Y si quieres, puedes activar una penalización por cancelación tardía o por no presentarse, que se cobra a la tarjeta guardada de la alumna con su consentimiento.',
  },
  {
    q: '¿Y si mi estudio combina reformer con mat o con yoga?',
    a: 'Es lo más habitual. Cada disciplina es su propio tipo de clase, con su horario, su sala, su aforo y su precio, dentro del mismo estudio.',
  },
];

export default function EstudioDePilatesReformerPage() {
  const relacionadas = relacionadasDe(PATH);
  return (
    <PageShell>
      <OrganizationStructuredData />
      <FaqStructuredData items={FAQ} />
      <PageBreadcrumb path={PATH} name="Estudio de Pilates reformer" />
      <SiteNav backHref="/" backLabel="Inicio" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Para estudios de reformer</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Software para estudios de Pilates reformer.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>Un estudio de reformer no vende clases: vende <strong style={{ color: '#1A1A1A' }}>máquinas a una hora</strong>. Tentare lo gestiona así: cada sala con sus reformers, cada alumna con su plaza, y cada hueco que se libera, ocupado antes de que tengas que escribir a nadie.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(24px,4vw,40px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Checklist eyebrow="Lo que cubre en un estudio de reformer" items={LO_QUE_CUBRE} />
          </Reveal>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'grid', gap: 16 }}>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>Una clase llena no debería tener huecos</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>En un estudio de máquinas, un reformer vacío es dinero que no vuelve. Cuando alguien cancela, la plaza pasa a la lista de espera sin que tú hagas nada, y la alumna recibe el aviso en su móvil. Las plazas fijas aseguran el hueco de cada semana a quien viene siempre, sin reservar a mano.</p>
          </Reveal>
          <Reveal style={{ background: '#fff', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 24px' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px' }}>La baja de la instructora, cubierta</h2>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#3A3A34', margin: 0 }}>Si una instructora no puede dar su clase, Tentare busca quién puede cubrirla según su disponibilidad y su costumbre, la contacta con tu visto bueno y avisa a las alumnas del cambio. En el plan Estudio puede hacerlo también sin esperar a que lo apruebes. <Link href="/funcionalidades/sustituciones" style={{ color: '#343825', fontWeight: 700 }}>Cómo funcionan las sustituciones</Link>.</p>
          </Reveal>
        </div>
      </section>

      <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(40px,5vw,56px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <Reveal>
            <Callout title="Lo que conviene saber antes" iconColor="#C79A2E" bg="#FBF6EA" border="#EEDFB8">
              Para que la alumna elija su reformer, la sala tiene que tener sus puestos definidos; si no, se reserva por aforo. Vender bonos y cuotas online exige conectar tu cuenta de Stripe, y la penalización por no-show solo se cobra a quien tiene tarjeta guardada y ha aceptado esa condición.
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
          <CtaBlock title="Pruébalo con tu estudio de verdad." body="7 días gratis, sin tarjeta. Tu horario y tu página de reservas, listos en tu primera sesión." cta="Probar 7 días gratis" />
        </div>
      </section>

      {relacionadas.length > 0 && (
        <section style={{ padding: '0 clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 className="lp-mono" style={{ fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#8E8E86', margin: '0 0 18px' }}>Sigue por aquí</h2>
            <div className="ref-rel">
              {relacionadas.map((r) => (
                <Link key={r.path} href={r.path} className="ref-rel-card">
                  <span className="ref-rel-nombre">{r.etiqueta}</span>
                  <span className="ref-rel-resumen">{r.resumen ?? r.descripcion}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/soluciones', label: 'Soluciones' }]} />

      <style>{`
        .ref-rel { display: grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap: 16px; }
        .ref-rel-card { display: block; background: #fff; border: 1px solid #E7E7E0;
          border-radius: 16px; padding: 20px; text-decoration: none;
          transition: transform var(--motion-normal) var(--motion-ease), box-shadow var(--motion-normal) var(--motion-ease); }
        .ref-rel-card:hover { transform: translateY(-4px); box-shadow: 0 28px 52px -32px rgba(26,26,26,.3); }
        .ref-rel-nombre { display: block; font-size: 15.5px; font-weight: 700; color: #1A1A1A; margin-bottom: 6px; }
        .ref-rel-resumen { display: block; font-size: 13px; line-height: 1.5; color: ${MUTED}; }
        @media (max-width: 760px) { .ref-rel { grid-template-columns: 1fr; } }
        @media (prefers-reduced-motion: reduce) { .ref-rel-card { transition: none; } }
      `}</style>
    </PageShell>
  );
}
