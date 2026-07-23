import Image from 'next/image';
import Link from 'next/link';
import { ACC } from '@/components/landing/theme';

export function SiteNav({ backHref = '/recursos', backLabel = 'Centro de Recursos' }: { backHref?: string; backLabel?: string }) {
  return (
    <nav style={{ position: 'sticky', top: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px clamp(20px,4vw,44px)', background: 'rgba(238,238,232,.82)', backdropFilter: 'blur(14px)', borderBottom: '1px solid rgba(26,26,26,.05)' }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
        <Image src="/logo-wordmark.png" alt="Tentare" width={150} height={48} style={{ height: 28, width: 'auto' }} />
      </Link>
      <Link href={backHref} className="lp-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, letterSpacing: '.03em', color: '#5A5A52' }}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        {backLabel}
      </Link>
      <Link href="/#lista-espera" className="hover:brightness-110" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: ACC, padding: '10px 18px', borderRadius: 999, boxShadow: '0 10px 22px rgba(109,40,217,.28)' }}>
        Lista de espera
      </Link>
    </nav>
  );
}
