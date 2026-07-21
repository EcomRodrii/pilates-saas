import type { Metadata } from 'next';
import { MarketingShell, ACC } from '@/components/marketing/shell';

export const metadata: Metadata = {
  title: 'Contacto | Tentare',
  description: 'Escríbenos si tienes dudas sobre Tentare, tu estudio o una migración.',
};

export default function Page() {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 110px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Contacto
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 40, letterSpacing: '-.03em', margin: '0 0 20px' }}>
          Escríbenos
        </h1>
        <p style={{ fontSize: 16.5, color: '#5A5A52', lineHeight: 1.6, margin: '0 0 36px' }}>
          Para dudas sobre el producto, tu estudio o una migración desde otra plataforma, el email es la vía más rápida.
        </p>
        <a
          href="mailto:hola@tentare.es"
          style={{ display: 'inline-block', background: ACC, color: '#171717', borderRadius: 999, fontSize: 17, fontWeight: 700, padding: '18px 34px', textDecoration: 'none' }}
        >
          hola@tentare.es
        </a>
        <p style={{ fontSize: 13.5, color: '#8E8E86', marginTop: 28 }}>
          Si ya eres cliente y necesitas ayuda con tu cuenta, consulta también el{' '}
          <a href="/recursos/centro-de-ayuda" style={{ color: '#B57A8E' }}>Centro de ayuda</a>.
        </p>
      </section>
    </MarketingShell>
  );
}
