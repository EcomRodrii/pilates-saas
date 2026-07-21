import Image from 'next/image';
import Link from 'next/link';
import { MarketingFooter } from '@/components/marketing/footer';

const ACC = '#FFC8E2';

// Cabecera + fondo + footer compartidos por las páginas de marketing nuevas
// (soluciones, características, comparativas, empresa, recursos, legal).
// app/page.tsx (la landing) tiene su propia cabecera con anclas propias —
// aquí basta un nav simple: logo a casa + CTA, ya que estas páginas se
// navegan sobre todo desde el footer, no desde la nav principal.
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#EEEEE8', color: '#1A1A1A', minHeight: '100vh' }}>
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '15px 40px',
          background: 'rgba(238,238,232,.92)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(26,26,26,.07)',
        }}
      >
        <Link href="/">
          <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 34, width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Link href="/login" style={{ fontSize: 15, fontWeight: 500, color: '#5A5A52', textDecoration: 'none' }}>
            Entrar
          </Link>
          <Link
            href="/crear-estudio"
            style={{
              display: 'inline-block',
              background: ACC,
              color: '#171717',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 600,
              padding: '11px 22px',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Crear estudio
          </Link>
        </div>
      </nav>
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

export { ACC };
