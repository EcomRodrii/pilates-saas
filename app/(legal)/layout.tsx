import Link from 'next/link';
import Image from 'next/image';
import { LEGAL } from '@/lib/legal-info';

// Chrome compartido de las páginas legales públicas (/legal, /privacidad,
// /terminos, /cookies). Vive bajo el RootLayout (html/body/fuentes/providers),
// así que aquí solo se añade la cabecera, el contenedor de prosa y el pie.

const PAGINAS = [
  { href: '/legal', label: 'Aviso legal' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/terminos', label: 'Términos' },
  { href: '/cookies', label: 'Cookies' },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#ffffff', color: '#1a1d21', minHeight: '100vh' }}>
      <header
        style={{
          borderBottom: '1px solid #e4e7ea',
          maxWidth: 780,
          margin: '0 auto',
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Link href="/" aria-label={`Ir al inicio de ${LEGAL.marca}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Image src="/logo-horizontal.png" alt={LEGAL.marca} width={160} height={44} style={{ height: 30, width: 'auto' }} priority />
        </Link>
        <Link href="/" style={{ fontSize: 13, fontWeight: 600, color: '#0f6b5c', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← Volver a {LEGAL.marca}
        </Link>
      </header>

      <main className="legal-doc">
        {children}

        <nav aria-label="Documentos legales" style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #e4e7ea', display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          {PAGINAS.map((p) => (
            <Link key={p.href} href={p.href} style={{ fontSize: 13, color: '#4a5158', textDecoration: 'none' }}>
              {p.label}
            </Link>
          ))}
        </nav>
        <p style={{ marginTop: 14, fontSize: 12, color: '#767d85' }}>
          © 2026 {LEGAL.marca} · Última actualización: {LEGAL.actualizado}
        </p>
      </main>

      <style>{`
        .legal-doc { max-width: 780px; margin: 0 auto; padding: 40px 24px 80px; }
        .legal-doc h1 { font-size: 30px; font-weight: 750; letter-spacing: -.02em; line-height: 1.15; margin: 0 0 8px; }
        .legal-doc .lead { color: #4a5158; font-size: 15px; margin-bottom: 28px; }
        .legal-doc h2 { font-size: 18px; font-weight: 700; margin: 34px 0 10px; letter-spacing: -.01em; }
        .legal-doc h3 { font-size: 15px; font-weight: 650; margin: 20px 0 6px; }
        .legal-doc p, .legal-doc li { font-size: 14.5px; line-height: 1.65; color: #2b2f34; }
        .legal-doc p { margin: 0 0 12px; }
        .legal-doc ul { margin: 0 0 14px 20px; }
        .legal-doc li { margin-bottom: 6px; }
        .legal-doc a { color: #0f6b5c; }
        .legal-doc strong { font-weight: 650; }
        .legal-doc table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 13.5px; }
        .legal-doc th, .legal-doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e4e7ea; vertical-align: top; }
        .legal-doc th { color: #767d85; font-weight: 650; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      `}</style>
    </div>
  );
}
