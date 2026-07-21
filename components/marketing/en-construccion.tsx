import Link from 'next/link';
import { MarketingShell, ACC } from '@/components/marketing/shell';

// Página honesta de "en construcción" — usada por las secciones del footer
// que aún no tienen contenido real (Testimonios, Blog, Carreras, Recomienda
// un cliente). Decisión explícita: mejor esto que testimonios o vacantes
// inventados. El enlace sigue existiendo porque tiene sentido en la
// navegación — solo que el contenido llega después.
export function EnConstruccionPage({ titulo, contexto }: { titulo: string; contexto: string }) {
  return (
    <MarketingShell>
      <section style={{ padding: '110px 40px', maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          En construcción
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 36, letterSpacing: '-.02em', margin: '0 0 16px' }}>{titulo}</h1>
        <p style={{ fontSize: 16, color: '#5A5A52', lineHeight: 1.6, margin: '0 0 32px' }}>{contexto}</p>
        <Link
          href="/empresa/contacto"
          style={{ display: 'inline-block', background: ACC, color: '#171717', borderRadius: 999, fontSize: 15, fontWeight: 600, padding: '14px 26px', textDecoration: 'none' }}
        >
          Escríbenos
        </Link>
      </section>
    </MarketingShell>
  );
}
