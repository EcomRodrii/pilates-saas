import Image from 'next/image';
import Link from 'next/link';

export function SiteFooter({ links = [] }: { links?: { href: string; label: string }[] }) {
  return (
    <footer style={{ background: '#0F0F0F', color: '#8E8E86', padding: 'clamp(44px,6vw,64px) clamp(20px,4vw,44px) 36px' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <Link href="/">
          <Image src="/logo-mark.png" alt="Tentare" width={32} height={32} style={{ height: 32, width: 'auto' }} />
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
