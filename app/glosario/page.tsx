import type { Metadata } from 'next';
import Link from 'next/link';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { GlossaryStructuredData } from '@/components/glosario/GlossaryStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';

export const metadata: Metadata = {
  title: 'Glosario del software de gestión para estudios de Pilates — Tentare',
  description: 'Definiciones claras y neutrales de los términos del sector: software de gestión, pilates reformer, Veri*factu, lista de espera automática, CRM de estudio y más.',
  alternates: { canonical: 'https://tentare.app/glosario' },
  openGraph: {
    type: 'website',
    title: 'Glosario del software de gestión para estudios de Pilates',
    description: 'Definiciones claras y neutrales de los términos que se usan al gestionar un estudio de Pilates.',
    url: 'https://tentare.app/glosario',
  },
};

type Termino = { slug: string; name: string; description: string; extra?: React.ReactNode; guia?: { href: string; label: string } };

const TERMINOS: Termino[] = [
  {
    slug: 'software-gestion-pilates',
    name: 'Software de gestión para estudios de Pilates',
    description:
      'Aplicación que centraliza las tareas administrativas de un estudio de Pilates: reservas de clases, cobros y facturación, ficha de cada alumna (historial, bonos, lesiones), calendario de salas e instructoras, y comunicación automática (recordatorios, avisos de cambios).',
    extra: 'Sustituye la combinación habitual de agenda en papel o Excel, un grupo de WhatsApp para coordinar al equipo, y una hoja aparte para llevar los cobros.',
  },
  {
    slug: 'estudio-boutique-pilates',
    name: 'Estudio boutique de Pilates',
    description:
      'Centro especializado, normalmente de aforo reducido (entre 6 y 12 personas por clase), centrado en pocas disciplinas — pilates reformer, mat, a veces yoga o barre — frente a un gimnasio generalista.',
    extra: 'El modelo boutique prioriza la atención personalizada y la experiencia de marca sobre el volumen de socios.',
  },
  {
    slug: 'pilates-reformer',
    name: 'Pilates reformer',
    description:
      'Modalidad de pilates que se practica sobre una máquina con muelles y una plataforma deslizante — el "reformer" — que añade resistencia variable al ejercicio. Se diferencia del pilates mat (en el suelo, sin máquina) en el coste de la clase y el aforo por sala.',
    guia: { href: '/recursos/precios-reformer-mat', label: 'Cómo poner precio a reformer y mat' },
  },
  {
    slug: 'verifactu',
    name: 'Veri*factu',
    description:
      'Sistema exigido por la Ley Antifraude española (Real Decreto 1007/2023) para que el software de facturación no pueda ocultar, modificar ni eliminar ventas. Cada factura queda encadenada a la anterior mediante un hash y lleva un código QR de verificación.',
    guia: { href: '/recursos/facturacion-electronica-verifactu', label: 'Qué cambia con Veri*factu y cuándo es obligatorio' },
  },
  {
    slug: 'lista-de-espera-automatica',
    name: 'Lista de espera automática',
    description:
      'Función de un software de reservas que, cuando una clase está completa y alguien cancela, ofrece automáticamente la plaza liberada a la siguiente persona apuntada en la lista de espera, sin que el estudio tenga que intervenir a mano.',
  },
  {
    slug: 'sustitucion-de-instructoras',
    name: 'Sustitución de instructoras',
    description:
      'Proceso por el que un estudio cubre una clase cuando la instructora asignada avisa de que no puede darla: encontrar a alguien disponible con el formato adecuado, actualizar el calendario y avisar a las alumnas ya reservadas.',
    extra: 'Puede hacerse a mano (llamadas y mensajes) o de forma automatizada por el software, que ya sabe qué instructoras pueden cubrir cada clase.',
    guia: { href: '/recursos/cubrir-baja-instructora', label: 'Cómo cubrir una baja sin hacer una llamada' },
  },
  {
    slug: 'bono-vs-suscripcion',
    name: 'Bono de clases vs. suscripción',
    description:
      'Dos modelos de cobro habituales en un estudio. Un bono es un paquete cerrado de sesiones que se consumen y caducan; una suscripción es un cobro recurrente —normalmente mensual— que da acceso a un número de clases o ilimitado mientras esté activa.',
    extra: 'Difieren en cómo se comporta la caja del estudio (ingreso puntual vs. recurrente) y en el nivel de compromiso que asume la alumna.',
  },
  {
    slug: 'crm-estudio-pilates',
    name: 'CRM para estudios de Pilates',
    description:
      'Sistema que centraliza el historial de cada alumna —asistencia, bonos, comunicaciones, notas— para que el estudio pueda gestionar la relación con ella más allá de la reserva puntual: recordatorios de renovación, seguimiento de inactividad, avisos personalizados.',
  },
  {
    slug: 'riesgo-dependencia-instructora',
    name: 'Riesgo de dependencia de una instructora',
    description:
      'Indicador que mide qué parte de las clases de un estudio dependen de una sola instructora. Un estudio con dependencia alta sufre más si esa persona causa una baja larga, porque hay pocas alternativas reales para cubrir sus clases.',
  },
];

export default function GlosarioPage() {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <GlossaryStructuredData terms={TERMINOS.map((t) => ({ slug: t.slug, name: t.name, description: t.description }))} />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header style={{ position: 'relative', padding: 'clamp(48px,7vw,88px) clamp(20px,4vw,44px) clamp(32px,4vw,44px)' }}>
        <div style={{ position: 'absolute', top: -140, right: -120, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle at 42% 42%, rgba(90,97,66,.16), transparent 62%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 780, margin: '0 auto' }}>
          <div className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#22251A', background: '#F1F2EA', padding: '8px 15px', borderRadius: 999, marginBottom: 24 }}>Glosario</div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(34px,5.2vw,58px)', lineHeight: 1.02, letterSpacing: '-.035em', margin: '0 0 20px' }}>Los términos del software de gestión para Pilates, explicados sin venderte nada.</h1>
          <p style={{ fontSize: 'clamp(17px,1.5vw,20px)', lineHeight: 1.55, color: MUTED, maxWidth: 620, margin: 0 }}>Definiciones neutrales, no un argumentario. Si un término tiene una guía más larga detrás, la enlazamos.</p>
        </div>
      </header>

      <section style={{ padding: 'clamp(8px,2vw,20px) clamp(20px,4vw,44px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {TERMINOS.map((t) => (
            <div key={t.slug} id={t.slug} style={{ scrollMarginTop: 96, background: '#fff', border: '1px solid #E7E7E0', borderRadius: 18, padding: '24px 26px' }}>
              <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 10px' }}>{t.name}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, color: '#3A3A34', margin: t.extra ? '0 0 10px' : 0 }}>{t.description}</p>
              {t.extra && <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: 0 }}>{t.extra}</p>}
              {t.guia && (
                <Link href={t.guia.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 14, fontSize: 14, fontWeight: 700, color: ACC, textDecoration: 'none' }}>
                  {t.guia.label} <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: 'clamp(64px,8vw,110px) clamp(20px,4vw,44px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="¿Quieres verlo en tu propio estudio?" body="Migramos tus datos por ti. Sin permanencia." />
        </div>
      </section>

      <SiteFooter links={[{ href: '/recursos', label: 'Recursos' }, { href: '/comparativa', label: 'Comparativa' }, { href: '/seguridad', label: 'Seguridad' }]} />
    </PageShell>
  );
}
