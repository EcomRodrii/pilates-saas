import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell, ACC } from '@/components/marketing/shell';

export const metadata: Metadata = {
  title: 'Sobre nosotros | Tentare',
  description: 'Por qué existe Tentare y qué defendemos como software para estudios de Pilates.',
};

export default function Page() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 100px', maxWidth: 720, margin: '0 auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Sobre nosotros
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 40, lineHeight: 1.1, letterSpacing: '-.03em', margin: '0 0 28px' }}>
          Un solo tipo de negocio, hecho bien
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontSize: 16.5, lineHeight: 1.75, color: '#374151' }}>
          <p>
            Tentare existe porque la mayoría del software de gestión para estudios se diseñó para gimnasios, spas o cualquier negocio de &ldquo;wellness&rdquo; a la vez —
            y un estudio de Pilates real acaba forzando su día a día en un calendario genérico que no entiende qué es un reformer, un bono de sesiones o una
            lista de espera que se llena sola.
          </p>
          <p>
            Elegimos hacer un solo tipo de negocio muy bien en vez de veinte a medias. Eso significa un mapa de plazas por máquina en vez de un cupo
            genérico, facturación pensada para España desde el primer cobro, y un sistema autónomo que decide y ejecuta tareas de gestión — pero nunca
            sin que tú apruebes lo que de verdad importa.
          </p>
          <p>
            No cobramos comisión sobre lo que factura tu estudio. Solo pagas tu cuota mensual y la comisión estándar de Stripe por procesar los pagos —
            nuestro incentivo es que tu estudio crezca, no quedarnos con un porcentaje de cada cobro.
          </p>
          <p>
            Somos un equipo pequeño construyendo esto activamente — el producto cambia rápido porque lo seguimos usando estudios reales para decidir
            qué construir después, no una hoja de ruta cerrada hace un año.
          </p>
        </div>

        <div style={{ marginTop: 44, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/crear-estudio" style={{ display: 'inline-block', background: ACC, color: '#171717', borderRadius: 999, fontSize: 15, fontWeight: 600, padding: '14px 26px', textDecoration: 'none' }}>
            Crear mi estudio →
          </Link>
          <Link href="/empresa/contacto" style={{ display: 'inline-block', border: '1px solid #E7E7E0', background: '#FFFFFF', color: '#1A1A1A', borderRadius: 999, fontSize: 15, fontWeight: 600, padding: '14px 26px', textDecoration: 'none' }}>
            Contacta con nosotros
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
