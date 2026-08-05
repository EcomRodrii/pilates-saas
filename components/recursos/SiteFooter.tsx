import { LogoTentare } from '@/components/marca/logo-tentare';
import Link from 'next/link';

export function SiteFooter({ links = [] }: { links?: { href: string; label: string }[] }) {
  return (
    <footer style={{ background: '#0F0F0F', color: '#8E8E86', padding: 'clamp(44px,6vw,64px) clamp(20px,4vw,44px) 36px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <Link href="/">
          {/* negativo: el footer va sobre #0F0F0F. */}
          <LogoTentare formato="isotipo" tinta="negativo" alto={32} />
        </Link>
        {links.length > 0 && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 14 }}>
            {links.map((l) => (
              <Link key={l.href} href={l.href} style={{ color: '#8E8E86' }}>{l.label}</Link>
            ))}
          </div>
        )}
        <span className="lp-mono" style={{ fontSize: 12, color: '#6E6E68' }}>© 2026 Tentare · Software para estudios de Pilates · Hecho en España 🇪🇸</span>
      </div>
    </footer>
  );
}
