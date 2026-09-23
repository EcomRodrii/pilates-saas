import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { BG } from '@/components/landing/theme';

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: BG, color: '#1A1A1A', overflowX: 'clip', position: 'relative' }}>
      {children}
      <GlobalStyles />
    </div>
  );
}
