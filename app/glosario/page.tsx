import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, LayoutGrid, Sparkles, CalendarCheck, Users, Receipt, ShieldCheck, type LucideIcon } from 'lucide-react';
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
    images: [{ url: '/glosario/opengraph-image' }],
  },
};

type CategoriaId = 'producto' | 'modelo' | 'reservas' | 'equipo' | 'cobros' | 'seguridad';

type Termino = { slug: string; categoria: CategoriaId; name: string; description: string; extra?: React.ReactNode; guia?: { href: string; label: string } };

// Cinco líneas de negocio del glosario, en el orden en que aparece un estudio
// nuevo repasando el software: primero qué es y cómo se organiza, luego cómo
// reserva la alumna, quién da las clases, cómo se cobra y qué pasa con sus
// datos. El índice de abajo y las secciones comparten este mismo orden.
const CATEGORIAS: { id: CategoriaId; nombre: string; icon: LucideIcon }[] = [
  { id: 'producto', nombre: 'Producto y software', icon: LayoutGrid },
  { id: 'modelo', nombre: 'Modelo de estudio y disciplinas', icon: Sparkles },
  { id: 'reservas', nombre: 'Reservas, aforo y cancelaciones', icon: CalendarCheck },
  { id: 'equipo', nombre: 'Equipo e instructoras', icon: Users },
  { id: 'cobros', nombre: 'Cobros, bonos y fiscalidad', icon: Receipt },
  { id: 'seguridad', nombre: 'Seguridad y datos de la alumna', icon: ShieldCheck },
];

const TERMINOS: Termino[] = [
  {
    slug: 'software-gestion-pilates',
    categoria: 'producto',
    name: 'Software de gestión para estudios de Pilates',
    description:
      'Aplicación que centraliza las tareas administrativas de un estudio de Pilates: reservas de clases, cobros y facturación, ficha de cada alumna (historial, bonos, lesiones), calendario de salas e instructoras, y comunicación automática (recordatorios, avisos de cambios).',
    extra: 'Sustituye la combinación habitual de agenda en papel o Excel, un grupo de WhatsApp para coordinar al equipo, y una hoja aparte para llevar los cobros.',
  },
  {
    slug: 'crm-estudio-pilates',
    categoria: 'producto',
    name: 'CRM para estudios de Pilates',
    description:
      'Sistema que centraliza el historial de cada alumna —asistencia, bonos, comunicaciones, notas— para que el estudio pueda gestionar la relación con ella más allá de la reserva puntual: recordatorios de renovación, seguimiento de inactividad, avisos personalizados.',
  },
  {
    slug: 'app-de-marca-pwa',
    categoria: 'producto',
    name: 'App de marca instalable (PWA)',
    description:
      'Aplicación web progresiva con el nombre, el logo y los colores del estudio, que una alumna puede instalar en la pantalla de inicio de su móvil desde el navegador, sin pasar por App Store ni Google Play. Se diferencia de una app nativa en que no requiere descarga desde una tienda de aplicaciones.',
    guia: { href: '/funcionalidades/app-para-alumnas', label: 'App de marca instalable, no nativa' },
  },
  {
    slug: 'multi-centro-cadena',
    categoria: 'producto',
    name: 'Multi-centro / cadena de estudios',
    description:
      'Gestión de varias sedes de un mismo negocio desde un solo acceso, con datos separados por sede pero configuración compartida —menú, marca— a nivel de cadena. Una instructora puede trabajar en más de una sede, con rol y tarifa propios en cada una.',
    guia: { href: '/funcionalidades/multi-centro', label: 'Software para cadenas con varios centros' },
  },
  {
    slug: 'estudio-boutique-pilates',
    categoria: 'modelo',
    name: 'Estudio boutique de Pilates',
    description:
      'Centro especializado, normalmente de aforo reducido (entre 6 y 12 personas por clase), centrado en pocas disciplinas — pilates reformer, mat, a veces yoga o barre — frente a un gimnasio generalista.',
    extra: 'El modelo boutique prioriza la atención personalizada y la experiencia de marca sobre el volumen de socios.',
  },
  {
    slug: 'pilates-reformer',
    categoria: 'modelo',
    name: 'Pilates reformer',
    description:
      'Modalidad de pilates que se practica sobre una máquina con muelles y una plataforma deslizante — el "reformer" — que añade resistencia variable al ejercicio. Se diferencia del pilates mat (en el suelo, sin máquina) en el coste de la clase y el aforo por sala.',
    guia: { href: '/recursos/precios-reformer-mat', label: 'Cómo poner precio a reformer y mat' },
  },
  {
    slug: 'comision-por-reserva-marketplace',
    categoria: 'modelo',
    name: 'Comisión por reserva (marketplace de clases)',
    description:
      'Modelo en el que un software de gestión también opera un directorio público donde alumnas nuevas descubren y reservan clase en distintos estudios, a cambio de una comisión sobre cada reserva o cobro captado por esa vía. Es distinto de un software sin marketplace, que no cobra ese porcentaje pero tampoco aporta esa visibilidad.',
    guia: { href: '/comparativa', label: 'Qué modelo usa cada software con el que se compara Tentare' },
  },
  {
    slug: 'lista-de-espera-automatica',
    categoria: 'reservas',
    name: 'Lista de espera automática',
    description:
      'Función de un software de reservas que, cuando una clase está completa y alguien cancela, ofrece automáticamente la plaza liberada a la siguiente persona apuntada en la lista de espera, sin que el estudio tenga que intervenir a mano.',
  },
  {
    slug: 'aforo-por-puesto',
    categoria: 'reservas',
    name: 'Aforo por puesto (o por reformer)',
    description:
      'Forma de fijar la capacidad de una clase contando las máquinas o puestos físicos disponibles —cada reformer, cada colchoneta— en lugar de un número de aforo fijo para la sala. Si una máquina se avería, la capacidad de esa clase concreta baja sola, sin tener que cambiar el aforo general.',
    guia: { href: '/funcionalidades/calendario-y-salas', label: 'Calendario, salas y aforo por reformer' },
  },
  {
    slug: 'plaza-fija',
    categoria: 'reservas',
    name: 'Plaza fija',
    description:
      'Reserva recurrente de una alumna en el mismo horario semanal, sin tener que reservar clase a clase. Suele combinarse con un sistema de recuperaciones para las semanas en las que la alumna no puede asistir.',
  },
  {
    slug: 'recuperacion-de-clase',
    categoria: 'reservas',
    name: 'Recuperación de clase',
    description:
      'Sesión que una alumna con plaza fija o bono puede usar más adelante cuando falta a su horario habitual, en lugar de perder esa sesión sin más. El estudio define las condiciones: en cuánto tiempo, en qué otros horarios y con qué límite.',
  },
  {
    slug: 'ventana-de-cancelacion',
    categoria: 'reservas',
    name: 'Ventana de cancelación',
    description:
      'Plazo mínimo antes del inicio de una clase dentro del cual una alumna puede cancelar su reserva sin penalización y recuperando su sesión o su plaza en el bono. Cancelar fuera de esa ventana suele tratarse como si hubiera asistido.',
    guia: { href: '/funcionalidades/cancelaciones-y-politicas', label: 'Qué pasa con el bono y la plaza al cancelar' },
  },
  {
    slug: 'penalizacion-no-show',
    categoria: 'reservas',
    name: 'Penalización por no-show',
    description:
      'Cargo económico opcional que un estudio puede aplicar cuando una alumna reserva una clase y no se presenta, sin haber cancelado a tiempo. Requiere tarjeta guardada y, si se hace bien, un consentimiento explícito comprobado antes de cobrar.',
    guia: { href: '/recursos/reducir-cancelaciones-ultima-hora', label: 'Cómo reducir las cancelaciones de última hora' },
  },
  {
    slug: 'sustitucion-de-instructoras',
    categoria: 'equipo',
    name: 'Sustitución de instructoras',
    description:
      'Proceso por el que un estudio cubre una clase cuando la instructora asignada avisa de que no puede darla: encontrar a alguien disponible con el formato adecuado, actualizar el calendario y avisar a las alumnas ya reservadas.',
    extra: 'Puede hacerse a mano (llamadas y mensajes) o de forma automatizada por el software, que ya sabe qué instructoras pueden cubrir cada clase.',
    guia: { href: '/recursos/cubrir-baja-instructora', label: 'Cómo cubrir una baja sin hacer una llamada' },
  },
  {
    slug: 'riesgo-dependencia-instructora',
    categoria: 'equipo',
    name: 'Riesgo de dependencia de una instructora',
    description:
      'Indicador que mide qué parte de las clases de un estudio dependen de una sola instructora. Un estudio con dependencia alta sufre más si esa persona causa una baja larga, porque hay pocas alternativas reales para cubrir sus clases.',
  },
  {
    slug: 'autonomia-en-sustituciones',
    categoria: 'equipo',
    name: 'Niveles de autonomía en sustituciones',
    description:
      'Distintos grados de intervención de la propietaria en el proceso de cubrir una baja: desde uno totalmente manual (ella busca y decide) hasta uno autónomo (el sistema busca, contacta y confirma sustituta sin que nadie lo apruebe a mano), pasando por un modo asistido intermedio.',
    guia: { href: '/funcionalidades/sustituciones', label: 'Cómo funciona el motor de sustituciones' },
  },
  {
    slug: 'bono-vs-suscripcion',
    categoria: 'cobros',
    name: 'Bono de clases vs. suscripción',
    description:
      'Dos modelos de cobro habituales en un estudio. Un bono es un paquete cerrado de sesiones que se consumen y caducan; una suscripción es un cobro recurrente —normalmente mensual— que da acceso a un número de clases o ilimitado mientras esté activa.',
    extra: 'Difieren en cómo se comporta la caja del estudio (ingreso puntual vs. recurrente) y en el nivel de compromiso que asume la alumna.',
  },
  {
    slug: 'cobro-recurrente-sepa',
    categoria: 'cobros',
    name: 'Cobro recurrente y domiciliación SEPA',
    description:
      'Cobro automático y periódico de una cuota o bono con una tarjeta guardada o una cuenta bancaria domiciliada (SEPA), sin que la alumna tenga que pagar a mano cada mes. Incluye normalmente reintentos automáticos cuando un cobro falla antes de darlo por impagado.',
    guia: { href: '/funcionalidades/cobros-recurrentes', label: 'Cobro recurrente, SEPA y recuperación de impagos' },
  },
  {
    slug: 'margen-por-clase',
    categoria: 'cobros',
    name: 'Margen de contribución por clase',
    description:
      'Diferencia entre lo que ingresa una clase concreta —repartiendo el precio de bonos y cuotas entre las sesiones que cubren— y el coste de la instructora que la imparte, calculado con su tarifa por hora real. Sirve para ver qué clases dan dinero de verdad, no solo cuáles se llenan.',
    guia: { href: '/funcionalidades/informes-y-rentabilidad', label: 'Informes de rentabilidad y margen por clase' },
  },
  {
    slug: 'plan-por-tipo-de-clase',
    categoria: 'cobros',
    name: 'Plan por tipo de clase',
    description:
      'Bono o suscripción que solo da acceso a un tipo concreto de clase —por ejemplo, solo reformer— en lugar de a todo el catálogo del estudio. Permite precios distintos según el coste real de cada tipo de clase.',
    guia: { href: '/funcionalidades/bonos-y-membresias', label: 'Bonos, cuotas y planes por tipo de clase' },
  },
  {
    slug: 'verifactu',
    categoria: 'cobros',
    name: 'Veri*factu',
    description:
      'Sistema exigido por la Ley Antifraude española (Real Decreto 1007/2023) para que el software de facturación no pueda ocultar, modificar ni eliminar ventas. Cada factura queda encadenada a la anterior mediante un hash y lleva un código QR de verificación.',
    guia: { href: '/recursos/facturacion-electronica-verifactu', label: 'Qué cambia con Veri*factu y cuándo es obligatorio' },
  },
  {
    slug: 'ticketbai',
    categoria: 'cobros',
    name: 'TicketBAI',
    description:
      'Sistema de control de facturación de las haciendas forales del País Vasco y Navarra, equivalente en propósito a Veri*factu pero con su propio régimen técnico y normativo. Un software que cumple Veri*factu no cumple TicketBAI automáticamente: son sistemas distintos.',
    guia: { href: '/recursos/facturacion-electronica-verifactu', label: 'Veri*factu, TicketBAI y cuándo aplica cada uno' },
  },
  {
    slug: 'ficha-de-salud-operativa',
    categoria: 'seguridad',
    name: 'Ficha de salud operativa',
    description:
      'Registro de condiciones, lesiones o adaptaciones de una alumna pensado para que la instructora sepa qué tener en cuenta al dar la clase —no un historial clínico médico. No diagnostica ni prescribe: es una nota operativa, visible solo para quien debe verla.',
    guia: { href: '/seguridad', label: 'Quién puede ver qué dato en Tentare' },
  },
];

export default function GlosarioPage() {
  return (
    <PageShell>
      <OrganizationStructuredData />
      <GlossaryStructuredData terms={TERMINOS.map((t) => ({ slug: t.slug, name: t.name, description: t.description }))} />
      <SiteNav backHref="/" backLabel="Volver a Tentare" />

      <header className="glo-portada">
        <Image
          src="/assets/foto-reformer.webp"
          alt="Dos alumnas practicando pilates reformer en un estudio boutique"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: 'cover', objectPosition: 'center 22%' }}
        />
        <div className="glo-velo" aria-hidden />
        <div className="glo-portada-cuerpo">
          <nav aria-label="Ruta" className="lp-mono glo-miga">
            <Link href="/">Inicio</Link>
            <span aria-hidden>/</span>
            <span className="glo-miga-aqui">Glosario</span>
          </nav>
          <p className="lp-mono glo-eyebrow">Glosario · {TERMINOS.length} términos</p>
          <h1 className="glo-titular">Los términos del software de gestión para Pilates, explicados sin venderte nada.</h1>
          <p className="glo-entrada">
            Definiciones neutrales, no un argumentario: qué significa cada término, en qué se diferencia de otro parecido y, cuando aplica, un enlace a la guía
            larga. Pensado para una propietaria que está comparando software y se encuentra palabras como &ldquo;aforo por puesto&rdquo; o &ldquo;Veri*factu&rdquo;
            sin que nadie se las haya explicado antes. Agrupado en seis bloques —producto, modelo de estudio, reservas, equipo, cobros y seguridad— para no
            tener que leer los {TERMINOS.length} de un tirón.
          </p>
        </div>
      </header>

      <nav aria-label="Índice del glosario" className="glo-indice">
        {CATEGORIAS.map((c) => {
          const Icon = c.icon;
          const n = TERMINOS.filter((t) => t.categoria === c.id).length;
          return (
            <a key={c.id} href={`#cat-${c.id}`} className="glo-indice-chip">
              <Icon size={15} aria-hidden />
              {c.nombre}
              <span className="glo-indice-n">{n}</span>
            </a>
          );
        })}
      </nav>

      <section className="glo-cuerpo">
        {CATEGORIAS.map((cat, i) => {
          const Icon = cat.icon;
          const terminos = TERMINOS.filter((t) => t.categoria === cat.id);
          return (
            <div key={cat.id}>
              <div id={`cat-${cat.id}`} className="glo-cat-header">
                <span className="glo-cat-icon"><Icon size={18} aria-hidden /></span>
                <h2 className="glo-cat-titulo">{cat.nombre}</h2>
              </div>
              <div className="glo-grid">
                {terminos.map((t) => (
                  <div key={t.slug} id={t.slug} className="glo-card">
                    <h3 className="glo-card-titulo">{t.name}</h3>
                    <p className="glo-card-desc" style={{ marginBottom: t.extra ? 10 : 0 }}>{t.description}</p>
                    {t.extra && <p className="glo-card-extra">{t.extra}</p>}
                    {t.guia && (
                      <Link href={t.guia.href} className="glo-card-guia">
                        {t.guia.label} <ArrowRight size={14} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>

              {/* Foto real de una sesión de reformer, a la mitad del glosario —
                  el punto donde una lista de definiciones más larga empieza a
                  sentirse plana. `foto-clase.webp` no se usa en ningún otro
                  sitio del repo (a diferencia de disciplinas/pilates.jpg, ya
                  repetida en media docena de páginas — ver FeatureShell). */}
              {i === 2 && (
                <figure className="glo-foto-embed">
                  <Image
                    src="/assets/foto-clase.webp"
                    alt="Reformer de pilates en la sala de un estudio boutique, con luz natural"
                    width={1536}
                    height={864}
                    sizes="(max-width: 900px) 100vw, 820px"
                  />
                  <figcaption className="lp-mono">Así es una sala de reformer en un estudio boutique real.</figcaption>
                </figure>
              )}
            </div>
          );
        })}
      </section>

      <section style={{ padding: 'clamp(24px,4vw,40px) clamp(20px,4vw,44px) clamp(64px,8vw,110px)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <CtaBlock title="¿Quieres verlo en tu propio estudio?" body="Migramos tus datos por ti. Sin permanencia." />
        </div>
      </section>

      <SiteFooter links={[{ href: '/funcionalidades', label: 'Funcionalidades' }, { href: '/precios', label: 'Precios' }, { href: '/recursos', label: 'Recursos' }, { href: '/comparativa', label: 'Comparativa' }]} />

      <style>{`
        .glo-portada { position: relative; isolation: isolate; overflow: hidden; background: #14150F;
          padding: clamp(28px,4vw,40px) clamp(20px,4vw,44px) clamp(56px,7vw,84px); }
        .glo-portada > img { z-index: -2; }
        .glo-velo { position: absolute; inset: 0; z-index: -1;
          background: linear-gradient(180deg, rgba(15,16,10,.66) 0%, rgba(15,16,10,.58) 40%, rgba(15,16,10,.92) 100%); }
        .glo-portada-cuerpo { position: relative; max-width: 780px; margin: 0 auto; color: #fff; }
        .glo-miga { display: flex; align-items: center; gap: 8px; font-size: 11.5px; letter-spacing: .06em;
          color: rgba(255,255,255,.55); margin: 0 0 clamp(22px,4vw,36px); }
        .glo-miga a { color: rgba(255,255,255,.72); }
        .glo-miga a:hover { color: #fff; }
        .glo-miga-aqui { color: #fff; }
        .glo-eyebrow { margin: 0 0 16px; font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #D9C29E; }
        .glo-titular { font-weight: 800; font-size: clamp(32px,5vw,54px); line-height: 1.03; letter-spacing: -.035em;
          margin: 0 0 18px; text-wrap: balance; }
        .glo-entrada { font-size: clamp(15.5px,1.4vw,17.5px); line-height: 1.6; color: rgba(255,255,255,.82); max-width: 640px; margin: 0; }

        .glo-indice { position: relative; z-index: 3; display: flex; flex-wrap: wrap; gap: 10px;
          max-width: 900px; margin: clamp(-30px,-3vw,-22px) auto 0; padding: 0 clamp(20px,4vw,44px) clamp(28px,3vw,36px); }
        .glo-indice-chip { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600;
          color: #22251A; background: #fff; border: 1px solid #E7E7E0; border-radius: 999px; padding: 9px 16px 9px 14px;
          box-shadow: 0 14px 30px -18px rgba(20,21,15,.35); transition: transform .18s, box-shadow .18s; }
        .glo-indice-chip:hover { transform: translateY(-2px); box-shadow: 0 18px 34px -16px rgba(20,21,15,.42); }
        .glo-indice-n { font-size: 11.5px; font-weight: 700; color: ${MUTED}; background: #F1F2EA; border-radius: 999px; padding: 1px 7px; }

        .glo-cuerpo { padding: clamp(16px,2vw,24px) clamp(20px,4vw,44px) clamp(20px,3vw,32px); max-width: 900px; margin: 0 auto; }
        .glo-cat-header { display: flex; align-items: center; gap: 11px; margin: clamp(40px,5vw,56px) 0 16px; scroll-margin-top: 88px; }
        .glo-cat-header:first-child { margin-top: 4px; }
        .glo-cat-icon { flex: none; display: flex; align-items: center; justify-content: center;
          width: 34px; height: 34px; border-radius: 10px; background: #F1F2EA; color: ${ACC}; }
        .glo-cat-titulo { font-size: clamp(19px,2vw,22px); font-weight: 800; letter-spacing: -.02em; margin: 0; }

        .glo-grid { display: flex; flex-direction: column; gap: 8px; }
        .glo-card { scroll-margin-top: 96px; background: #fff; border: 1px solid #E7E7E0; border-radius: 18px; padding: 22px 24px; }
        .glo-card-titulo { font-size: 18.5px; font-weight: 800; letter-spacing: -.015em; margin: 0 0 9px; }
        .glo-card-desc { font-size: 15.5px; line-height: 1.62; color: #3A3A34; margin: 0; }
        .glo-card-extra { font-size: 15.5px; line-height: 1.62; color: ${MUTED}; margin: 0; }
        .glo-card-guia { display: inline-flex; align-items: center; gap: 7px; margin-top: 14px;
          font-size: 14px; font-weight: 700; color: ${ACC}; text-decoration: none; }
        .glo-card-guia:hover { text-decoration: underline; }

        .glo-foto-embed { margin: clamp(20px,3vw,28px) 0 clamp(36px,4vw,48px); border-radius: 18px; overflow: hidden;
          border: 1px solid #E7E7E0; background: #fff; }
        .glo-foto-embed img { display: block; width: 100%; height: auto; }
        .glo-foto-embed figcaption { padding: 12px 18px; font-size: 12px; color: ${MUTED}; border-top: 1px solid #EDEDE5; }

        @media (max-width: 640px) {
          .glo-indice-chip { font-size: 13px; padding: 8px 13px; }
        }
      `}</style>
    </PageShell>
  );
}
