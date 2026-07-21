import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, ACC } from '@/components/marketing/shell';
import { CARACTERISTICAS } from '@/lib/marketing-nav';

export const metadata: Metadata = {
  title: 'Características | Tentare',
  description: 'Todas las funciones de Tentare: horarios, reservas, pagos, automatizaciones IA, marketing, informes y más.',
};

interface Contenido {
  descripcion: string;
  puntos: string[];
}

// Cada entrada mapea a un módulo real de lib/nav-config.tsx o a un motor
// concreto del repo (automation-engine, marketing-automation-engine,
// billing/entitlements...) — nada de lo listado aquí es aspiracional.
const CONTENIDO: Record<string, Contenido> = {
  horarios: {
    descripcion: 'Calendario semanal con varias salas e instructoras a la vez, tipos de clase con aforo y precio propios.',
    puntos: ['Vista semanal con todas tus salas', 'Aforo y precio independientes por tipo de clase', 'Sesiones recurrentes o puntuales (citas)'],
  },
  reservas: {
    descripcion: 'Tus socias reservan y cancelan solas, 24/7, desde el portal o la app de marca.',
    puntos: ['Lista de espera que promociona sola al liberarse una plaza', 'Cancelación con antelación mínima configurable', 'Check-in desde el portal o en kiosko'],
  },
  pagos: {
    descripcion: 'Cobros vía Stripe (tarjeta y SEPA) sin comisión adicional de Tentare sobre tus cobros.',
    puntos: ['Bonos de sesiones y cuotas recurrentes', 'Reintento automático de pagos fallidos', 'Facturas con NIF, IVA y numeración correlativa'],
  },
  'gestion-de-miembros': {
    descripcion: 'Ficha completa de cada socia: historial de clases, bonos, pagos y valoraciones.',
    puntos: ['Historial de asistencia y bonos por persona', 'Preferencias de notificación (email/WhatsApp)', 'Importador CSV con auto-mapeo de columnas'],
  },
  equipo: {
    descripcion: 'Altas, roles y permisos de instructoras y recepción — con invitación por email.',
    puntos: ['Roles: propietaria, recepción, instructor', 'Email de invitación automático al dar de alta', 'Colores y avatar propios por instructora'],
  },
  sustituciones: {
    descripcion: 'Si una instructora avisa de que no puede dar su clase, el sistema busca sustituta y avisa a las alumnas.',
    puntos: ['Ranking de candidatas por disponibilidad', 'Aceptación en un toque, sin login', 'Aviso automático a las alumnas apuntadas'],
  },
  'automatizaciones-ia': {
    descripcion: 'Reglas que vigilan datos reales (ausencias, pagos pendientes, clases llenas) y redactan el mensaje con IA.',
    puntos: ['Secuencia de reactivación en varios pasos, no un único aviso', 'Aprobación humana antes de enviar cualquier oferta', 'Automatizaciones de marketing por cumpleaños, altas o inactividad'],
  },
  'centro-de-control': {
    descripcion: 'Tu copiloto de decisiones: cada mañana resume qué necesita tu atención.',
    puntos: ['Recomendaciones con nivel de autonomía configurable', 'Ejecuta solo lo que tú decidas que no necesita tu OK', 'Riesgo de concentración por instructora, entre otras señales'],
  },
  marketing: {
    descripcion: 'Calendario de contenido, guiones y carruseles para redes generados con IA, más campañas con objetivo y presupuesto.',
    puntos: ['Biblioteca e ideas de contenido', 'Guiones y carruseles redactados con IA', 'Campañas de marketing con ciclo de vida y cupones'],
  },
  crm: {
    descripcion: 'Mensajería, comunidad y chat de equipo integrados, sin salir del panel.',
    puntos: ['Bandeja de mensajería con las socias', 'Comunidad para el estudio', 'Chat de equipo interno'],
  },
  'app-personalizada': {
    descripcion: 'Portal web instalable (PWA) con el logo y el color de tu estudio, no los de Tentare.',
    puntos: ['Reservas, pagos, valoraciones y racha de asistencia', 'Marca propia: logo y color en el portal y los emails', 'Instalable en la pantalla de inicio, sin tiendas de apps'],
  },
  'panel-de-rendimiento': {
    descripcion: 'Ingresos, ocupación y retención al día, sin exportar a Excel.',
    puntos: ['Informes de ingresos y ocupación en vivo', 'Riesgo de concentración por instructora', 'Contador de acciones ejecutadas por el sistema autónomo'],
  },
  ventas: {
    descripcion: 'Caja para cobros presenciales y catálogo de productos físicos.',
    puntos: ['Caja (POS) para venta en mostrador', 'Catálogo de productos', 'Cobros y facturas centralizados'],
  },
  integraciones: {
    descripcion: 'Conecta las herramientas que ya usas, configurables por estudio.',
    puntos: ['Videollamada (Zoom) para clases online', 'Control de accesos (Kisi)', 'WhatsApp y Gmail para comunicación con socias'],
  },
};

export default function CaracteristicasPage() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 44px', maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Características
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 44, lineHeight: 1.05, letterSpacing: '-.03em', margin: '0 0 20px' }}>
          Todo lo que hace Tentare, en una página
        </h1>
        <p style={{ fontSize: 17, color: '#5A5A52', margin: 0 }}>
          Cada función de aquí abajo está en producción y en uso — nada de esta lista es un plan a futuro.
        </p>
      </section>

      <section style={{ padding: '0 40px 100px', maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {CARACTERISTICAS.map(c => {
          const cont = CONTENIDO[c.slug];
          return (
            <div key={c.slug} id={c.slug} style={{ scrollMarginTop: 90, background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 20, padding: '28px 32px' }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', margin: '0 0 8px' }}>{c.label}</h2>
              <p style={{ fontSize: 15, color: '#5A5A52', margin: '0 0 16px' }}>{cont.descripcion}</p>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#374151', fontSize: 14.5, lineHeight: 1.9 }}>
                {cont.puntos.map(p => <li key={p}>{p}</li>)}
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
