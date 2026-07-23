import { IBM_Plex_Mono } from 'next/font/google';
import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { BG } from '@/components/landing/theme';

const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={plexMono.variable} style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      {children}
      <GlobalStyles />
    </div>
  );
}
