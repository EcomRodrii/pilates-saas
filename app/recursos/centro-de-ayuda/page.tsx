import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingShell } from '@/components/marketing/shell';

export const metadata: Metadata = {
  title: 'Centro de ayuda | Tentare',
  description: 'Encuentra respuesta a las dudas más habituales sobre Tentare.',
};

const TEMAS = [
  {
    t: 'Migrar desde otra plataforma',
    d: 'Exporta tu CSV actual (socias, horario, membresías) desde tu plataforma anterior y súbelo al importador — detecta las columnas solo, tú confirmas antes de guardar.',
  },
  {
    t: 'Configurar tus automatizaciones',
    d: 'En Automatizaciones IA activas qué reglas quieres (ausencias, pagos pendientes, clases llenas) y decides cuáles necesitan tu aprobación antes de enviarse a una socia.',
  },
  {
    t: 'Dar de alta a tu equipo',
    d: 'Desde Equipo añades instructoras o recepción con su rol — al darlas de alta con email, reciben una invitación para crear su cuenta.',
  },
  {
    t: 'Personalizar tu marca',
    d: 'En Mi estudio → Apariencia subes tu logo y eliges tu color — se aplica al portal de socias y a los emails que reciben.',
  },
  {
    t: 'Sustituciones de última hora',
    d: 'Si una instructora avisa de que no puede dar su clase, el sistema busca sustituta por disponibilidad y avisa a las alumnas apuntadas automáticamente.',
  },
  {
    t: 'Facturación y Stripe',
    d: 'Los cobros se procesan por Stripe (tarjeta y SEPA). Las facturas incluyen NIF, IVA y numeración correlativa desde el primer cobro.',
  },
];

export default function Page() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 44px', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Centro de ayuda
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', margin: '0 0 16px' }}>¿En qué podemos ayudarte?</h1>
        <p style={{ fontSize: 16, color: '#5A5A52', margin: 0 }}>
          Temas rápidos abajo. Para algo más concreto, <Link href="/empresa/contacto" style={{ color: '#B57A8E' }}>escríbenos directamente</Link>.
        </p>
      </section>
      <section style={{ padding: '0 40px 110px', maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {TEMAS.map(tema => (
          <div key={tema.t} style={{ background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 16, padding: '22px 26px' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px' }}>{tema.t}</h2>
            <p style={{ fontSize: 14.5, color: '#5A5A52', margin: 0, lineHeight: 1.6 }}>{tema.d}</p>
          </div>
        ))}
      </section>
    </MarketingShell>
  );
}
