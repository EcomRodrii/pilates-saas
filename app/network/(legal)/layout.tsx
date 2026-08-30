import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { LEGAL } from '@/lib/legal-info';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_PRODUCTO } from '@/components/network-v2/tokens';

// Chrome compartido de las dos páginas legales propias de Network
// (/network/terminos, /network/privacidad) — pedido explícito del
// fundador tras el clon literal de la landing (#1482): el marketplace
// tiene una relación de tres partes (instructora↔estudio↔Tentare) que las
// páginas legales generales (/terminos, /privacidad) no cubren, así que
// necesita las suyas propias. Mismo patrón que app/(legal)/layout.tsx
// (cabecera + prosa + nav entre documentos + pie), pero con la marca y los
// tokens de Network en vez del blanco/negro genérico — esto SÍ vive dentro
// de /network, a diferencia de las generales.

const DOCUMENTOS = [
  { href: '/network/terminos', label: 'Términos de Network' },
  { href: '/network/privacidad', label: 'Privacidad de Network' },
];

export default function NetworkLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: NW_FONDO, color: NW_TINTA, minHeight: '100vh' }}>
      <header
        style={{ borderBottom: `1px solid ${NW_BORDE}`, maxWidth: 780, margin: '0 auto', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
      >
        <Link href="/network" aria-label="Ir a Tentare Network" className="inline-flex items-center">
          <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo />
        </Link>
        <Link href="/network" style={{ fontSize: 13, fontWeight: 600, color: NW_PRODUCTO, textDecoration: 'none', whiteSpace: 'nowrap' }}>
          ← Volver a Network
        </Link>
      </header>

      <main className="nw-legal-doc">
        {children}

        <nav aria-label="Documentos legales de Network" style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${NW_BORDE}`, display: 'flex', flexWrap: 'wrap', gap: 18 }}>
          {DOCUMENTOS.map((d) => (
            <Link key={d.href} href={d.href} style={{ fontSize: 13, color: NW_MUTED, textDecoration: 'none' }}>{d.label}</Link>
          ))}
          <Link href="/legal" style={{ fontSize: 13, color: NW_MUTED, textDecoration: 'none' }}>Aviso legal de Tentare</Link>
          <Link href="/cookies" style={{ fontSize: 13, color: NW_MUTED, textDecoration: 'none' }}>Cookies</Link>
        </nav>
        <p style={{ marginTop: 14, fontSize: 12, color: NW_MUTED_2 }}>
          © 2026 Tentare Network · Última actualización: {LEGAL.actualizado}
        </p>
      </main>

      <style>{`
        .nw-legal-doc { max-width: 780px; margin: 0 auto; padding: 40px 24px 80px; }
        .nw-legal-doc h1 { font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; margin: 0 0 8px; }
        .nw-legal-doc .lead { color: ${NW_MUTED}; font-size: 15px; margin-bottom: 28px; }
        .nw-legal-doc h2 { font-size: 18px; font-weight: 750; margin: 34px 0 10px; letter-spacing: -.01em; }
        .nw-legal-doc h3 { font-size: 15px; font-weight: 700; margin: 20px 0 6px; }
        .nw-legal-doc p, .nw-legal-doc li { font-size: 14.5px; line-height: 1.65; color: ${NW_TINTA}; }
        .nw-legal-doc p { margin: 0 0 12px; }
        .nw-legal-doc ul { margin: 0 0 14px 20px; }
        .nw-legal-doc li { margin-bottom: 6px; }
        .nw-legal-doc a { color: ${NW_PRODUCTO}; }
        .nw-legal-doc strong { font-weight: 700; }
        .nw-legal-doc table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; font-size: 13.5px; }
        .nw-legal-doc th, .nw-legal-doc td { text-align: left; padding: 8px 10px; border-bottom: 1px solid ${NW_BORDE}; vertical-align: top; }
        .nw-legal-doc th { color: ${NW_MUTED_2}; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      `}</style>
    </div>
  );
}
