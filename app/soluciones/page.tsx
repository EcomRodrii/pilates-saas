import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, ACC } from '@/components/marketing/shell';
import { SOLUCIONES } from '@/lib/marketing-nav';

export const metadata: Metadata = {
  title: 'Soluciones por tipo de estudio | Tentare',
  description: 'Cómo encaja Tentare en Pilates, Pilates Reformer, Yoga, estudios fitness y otros negocios de clases con cupo.',
};

interface Contenido {
  intro: string;
  puntos: string[];
}

// Honestidad ante todo: Tentare nació y está pensado para Pilates (mapa de
// spots por reformer, gestión de salas con aforo — ver FAQ de app/page.tsx).
// El motor de horarios/cupo/cobros es genérico y sirve a cualquier negocio de
// clases con plaza limitada, así que estas fichas describen ESO — nunca una
// función específica de un nicho que no existe en el producto.
const CONTENIDO: Record<string, Contenido> = {
  pilates: {
    intro: 'El núcleo de Tentare: nació para estudios de Pilates y es donde tiene más funciones específicas.',
    puntos: [
      'Mapa de plazas por reformer, con aforo real por sala',
      'Bonos de sesiones y planes mensuales, con renovación y cobro automáticos',
      'Lista de espera que promociona sola cuando alguien cancela',
    ],
  },
  'pilates-reformer': {
    intro: 'Pensado específicamente para salas con máquinas y plazas numeradas.',
    puntos: [
      'Cada reformer es una plaza con su propia capacidad — no un cupo genérico',
      'Sustituciones entre instructoras cuando alguien no puede dar su clase',
      'Portal de socias con su racha de asistencia y reservas desde el móvil',
    ],
  },
  yoga: {
    intro: 'El motor de horarios y cupo por sala funciona igual de bien para clases de yoga sin material específico.',
    puntos: [
      'Tipos de clase con aforo y precio independientes',
      'Bonos de sesiones o cuotas mensuales, a tu elección',
      'Portal de socias de marca propia para reservar y cancelar solas',
    ],
  },
  'estudios-fitness': {
    intro: 'Para estudios boutique de fitness general — no gimnasios de acceso libre con máquinas sueltas.',
    puntos: [
      'Calendario semanal con varias salas e instructoras a la vez',
      'Cobros recurrentes y bonos conciliados automáticamente',
      'Informes de ocupación, ingresos y retención en vivo',
    ],
  },
  'ciclismo-indoor': {
    intro: 'Clases de aforo fijo (una bici, una plaza) con alta rotación de horarios.',
    puntos: [
      'Aforo por sala/sala virtual, igual que en reformer',
      'Lista de espera automática para las clases con más demanda',
      'Recordatorios automáticos de la próxima clase',
    ],
  },
  baile: {
    intro: 'Clases sueltas o por bonos, con instructoras distintas según el estilo.',
    puntos: [
      'Tipos de clase con nombre, precio y aforo propios por estilo',
      'Gestión de equipo con varias instructoras y sus horarios',
      'App de marca para que las alumnas reserven desde el móvil',
    ],
  },
  barre: {
    intro: 'Igual que Pilates Mat: aforo por sala, sin necesidad de mapa de máquinas.',
    puntos: [
      'Bonos de sesiones y cuotas mensuales',
      'Lista de espera y lanzamiento de plazas liberadas',
      'Portal de socias con su historial de clases',
    ],
  },
  boxeo: {
    intro: 'Clases dirigidas con aforo por sala — no llevanza de acceso libre a saco.',
    puntos: [
      'Calendario con varias clases e instructores al día',
      'Cobros por bono o cuota mensual',
      'Automatizaciones para avisar de ausencias o pagos pendientes',
    ],
  },
  'artes-marciales': {
    intro: 'Escuelas con clases por nivel/grupo y cuota mensual habitual.',
    puntos: [
      'Cuotas mensuales recurrentes cobradas automáticamente',
      'Gestión de miembros con historial de asistencia',
      'Portal de alumnos para ver horarios y reservar clase',
    ],
  },
  bootcamp: {
    intro: 'Sesiones grupales de cupo limitado en exterior o sala.',
    puntos: [
      'Aforo por sesión con lista de espera automática',
      'Bonos de sesiones sueltas o packs',
      'Recordatorios automáticos antes de cada sesión',
    ],
  },
  hiit: {
    intro: 'Clases cortas y de alta rotación — el mismo motor de aforo y reservas 24/7 aplica.',
    puntos: [
      'Reservas y cancelaciones en autoservicio, sin llamadas',
      'Lista de espera que llena huecos de última hora',
      'Informes de ocupación por franja horaria',
    ],
  },
  'entrenamiento-funcional': {
    intro: 'Salas con aforo por equipamiento (racks, zonas) — gestionable como plazas por sala.',
    puntos: [
      'Tipos de clase con aforo y precio independientes',
      'Cobros recurrentes y bonos conciliados solos',
      'Automatizaciones IA para reactivar a quien deja de venir',
    ],
  },
  'estudios-multiples': {
    intro: 'Varias salas o sedes bajo una misma cuenta, con datos separados por sede.',
    puntos: [
      'Gestión de equipo por sede, con roles y permisos propios',
      'Informes consolidados y por sede',
      'Plan Cadena con soporte dedicado (ver /#precios)',
    ],
  },
  franquicias: {
    intro: 'Para redes con varios centros que necesitan una base común y control central.',
    puntos: [
      'Un panel de Centro de Control por sede, además de la vista consolidada',
      'Marca propia (logo y color) por centro dentro de la misma cuenta',
      'Plan Cadena con soporte dedicado',
    ],
  },
};

export default function SolucionesPage() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 44px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Diseñado para
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 20px' }}>
          Un motor de horarios y cobros que se adapta a tu tipo de estudio
        </h1>
        <p style={{ fontSize: 17, color: '#5A5A52', margin: 0 }}>
          Tentare nació para Pilates — ahí tiene sus funciones más específicas (mapa de reformer, sustituciones). El resto de negocios de clases con cupo comparten el mismo motor de horarios, aforo y cobros.
        </p>
      </section>

      <section style={{ padding: '0 40px 100px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {SOLUCIONES.map(s => {
          const c = CONTENIDO[s.slug];
          return (
            <div key={s.slug} id={s.slug} style={{ scrollMarginTop: 90, background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 20, padding: '28px 32px' }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 8px' }}>{s.label}</h2>
              <p style={{ fontSize: 15, color: '#5A5A52', margin: '0 0 16px' }}>{c.intro}</p>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 14.5, lineHeight: 1.9 }}>
                {c.puntos.map(p => <li key={p}>{p}</li>)}
              </ul>
            </div>
          );
        })}
      </section>

      <section style={{ padding: '0 40px 110px', textAlign: 'center' }}>
        <Link
          href="/crear-estudio"
          style={{ display: 'inline-block', background: ACC, color: '#171717', borderRadius: 999, fontSize: 16, fontWeight: 600, padding: '16px 30px', textDecoration: 'none' }}
        >
          Crear mi estudio →
        </Link>
      </section>
    </MarketingShell>
  );
}
