import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ACC, MUTED } from '@/components/landing/theme';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { CtaBlock } from '@/components/recursos/ArticlePrimitives';
import { GlossaryStructuredData } from '@/components/glosario/GlossaryStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Glosario del software de gestión para estudios de Pilates — Tentare',
  description: 'Definiciones claras y neutrales de los términos del sector: software de gestión, pilates reformer, Veri*factu, lista de espera automática, CRM de estudio y más.',
  alternates: { canonical: urlDe('/glosario') },
  openGraph: {
    type: 'website',
    title: 'Glosario del software de gestión para estudios de Pilates',
    description: 'Definiciones claras y neutrales de los términos que se usan al gestionar un estudio de Pilates.',
    url: urlDe('/glosario'),
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
  {
    slug: 'aforo-por-puesto',
    name: 'Aforo por puesto (o por reformer)',
    description:
      'Forma de fijar la capacidad de una clase contando las máquinas o puestos físicos disponibles —cada reformer, cada colchoneta— en lugar de un número de aforo fijo para la sala. Si una máquina se avería, la capacidad de esa clase concreta baja sola, sin tener que cambiar el aforo general.',
    guia: { href: '/funcionalidades/calendario-y-salas', label: 'Calendario, salas y aforo por reformer' },
  },
  {
    slug: 'plaza-fija',
    name: 'Plaza fija',
    description:
      'Reserva recurrente de una alumna en el mismo horario semanal, sin tener que reservar clase a clase. Suele combinarse con un sistema de recuperaciones para las semanas en las que la alumna no puede asistir.',
  },
  {
    slug: 'recuperacion-de-clase',
    name: 'Recuperación de clase',
    description:
      'Sesión que una alumna con plaza fija o bono puede usar más adelante cuando falta a su horario habitual, en lugar de perder esa sesión sin más. El estudio define las condiciones: en cuánto tiempo, en qué otros horarios y con qué límite.',
  },
  {
    slug: 'ventana-de-cancelacion',
    name: 'Ventana de cancelación',
    description:
      'Plazo mínimo antes del inicio de una clase dentro del cual una alumna puede cancelar su reserva sin penalización y recuperando su sesión o su plaza en el bono. Cancelar fuera de esa ventana suele tratarse como si hubiera asistido.',
    guia: { href: '/funcionalidades/cancelaciones-y-politicas', label: 'Qué pasa con el bono y la plaza al cancelar' },
  },
  {
    slug: 'penalizacion-no-show',
    name: 'Penalización por no-show',
    description:
      'Cargo económico opcional que un estudio puede aplicar cuando una alumna reserva una clase y no se presenta, sin haber cancelado a tiempo. Requiere tarjeta guardada y, si se hace bien, un consentimiento explícito comprobado antes de cobrar.',
    guia: { href: '/recursos/reducir-cancelaciones-ultima-hora', label: 'Cómo reducir las cancelaciones de última hora' },
  },
  {
    slug: 'autonomia-en-sustituciones',
    name: 'Niveles de autonomía en sustituciones',
    description:
      'Distintos grados de intervención de la propietaria en el proceso de cubrir una baja: desde uno totalmente manual (ella busca y decide) hasta uno autónomo (el sistema busca, contacta y confirma sustituta sin que nadie lo apruebe a mano), pasando por un modo asistido intermedio.',
    guia: { href: '/funcionalidades/sustituciones', label: 'Cómo funciona el motor de sustituciones' },
  },
  {
    slug: 'cobro-recurrente-sepa',
    name: 'Cobro recurrente y domiciliación SEPA',
    description:
      'Cobro automático y periódico de una cuota o bono con una tarjeta guardada o una cuenta bancaria domiciliada (SEPA), sin que la alumna tenga que pagar a mano cada mes. Incluye normalmente reintentos automáticos cuando un cobro falla antes de darlo por impagado.',
    guia: { href: '/funcionalidades/cobros-recurrentes', label: 'Cobro recurrente, SEPA y recuperación de impagos' },
  },
  {
    slug: 'margen-por-clase',
    name: 'Margen de contribución por clase',
    description:
      'Diferencia entre lo que ingresa una clase concreta —repartiendo el precio de bonos y cuotas entre las sesiones que cubren— y el coste de la instructora que la imparte, calculado con su tarifa por hora real. Sirve para ver qué clases dan dinero de verdad, no solo cuáles se llenan.',
    guia: { href: '/funcionalidades/informes-y-rentabilidad', label: 'Informes de rentabilidad y margen por clase' },
  },
  {
    slug: 'app-de-marca-pwa',
    name: 'App de marca instalable (PWA)',
    description:
      'Aplicación web progresiva con el nombre, el logo y los colores del estudio, que una alumna puede instalar en la pantalla de inicio de su móvil desde el navegador, sin pasar por App Store ni Google Play. Se diferencia de una app nativa en que no requiere descarga desde una tienda de aplicaciones.',
    guia: { href: '/funcionalidades/app-para-alumnas', label: 'App de marca instalable, no nativa' },
  },
  {
    slug: 'multi-centro-cadena',
    name: 'Multi-centro / cadena de estudios',
    description:
      'Gestión de varias sedes de un mismo negocio desde un solo acceso, con datos separados por sede pero configuración compartida —menú, marca— a nivel de cadena. Una instructora puede trabajar en más de una sede, con rol y tarifa propios en cada una.',
    guia: { href: '/funcionalidades/multi-centro', label: 'Software para cadenas con varios centros' },
  },
  {
    slug: 'plan-por-tipo-de-clase',
    name: 'Plan por tipo de clase',
    description:
      'Bono o suscripción que solo da acceso a un tipo concreto de clase —por ejemplo, solo reformer— en lugar de a todo el catálogo del estudio. Permite precios distintos según el coste real de cada tipo de clase.',
    guia: { href: '/funcionalidades/bonos-y-membresias', label: 'Bonos, cuotas y planes por tipo de clase' },
  },
  {
    slug: 'ficha-de-salud-operativa',
    name: 'Ficha de salud operativa',
    description:
      'Registro de condiciones, lesiones o adaptaciones de una alumna pensado para que la instructora sepa qué tener en cuenta al dar la clase —no un historial clínico médico. No diagnostica ni prescribe: es una nota operativa, visible solo para quien debe verla.',
    guia: { href: '/seguridad', label: 'Quién puede ver qué dato en Tentare' },
  },
  {
    slug: 'ticketbai',
    name: 'TicketBAI',
    description:
      'Sistema de control de facturación de las haciendas forales del País Vasco y Navarra, equivalente en propósito a Veri*factu pero con su propio régimen técnico y normativo. Un software que cumple Veri*factu no cumple TicketBAI automáticamente: son sistemas distintos.',
    guia: { href: '/recursos/facturacion-electronica-verifactu', label: 'Veri*factu, TicketBAI y cuándo aplica cada uno' },
  },
  {
    slug: 'comision-por-reserva-marketplace',
    name: 'Comisión por reserva (marketplace de clases)',
    description:
      'Modelo en el que un software de gestión también opera un directorio público donde alumnas nuevas descubren y reservan clase en distintos estudios, a cambio de una comisión sobre cada reserva o cobro captado por esa vía. Es distinto de un software sin marketplace, que no cobra ese porcentaje pero tampoco aporta esa visibilidad.',
    guia: { href: '/comparativa', label: 'Qué modelo usa cada software con el que se compara Tentare' },
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
                  {t.guia.label} <ArrowRight size={14} />
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

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/recursos', label: 'Recursos' }, { href: '/comparativa', label: 'Comparativa' }]} />
    </PageShell>
  );
}
