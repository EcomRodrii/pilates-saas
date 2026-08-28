import { ACC } from '@/components/landing/theme';

export function AyudaPaso({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, margin: '24px 0' }}>
      <span
        aria-hidden
        style={{
          flex: 'none', width: 30, height: 30, borderRadius: '50%', background: ACC, color: '#fff',
          display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13.5, marginTop: 2,
        }}
      >
        {numero}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', margin: '2px 0 8px' }}>{titulo}</h3>
        <div style={{ fontSize: 15, lineHeight: 1.65, color: '#33352C' }}>{children}</div>
      </div>
    </div>
  );
}

export function AyudaAntesDeEmpezar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#F1F2EA', borderRadius: 14, padding: '16px 20px', margin: '20px 0 28px', fontSize: 14, lineHeight: 1.6, color: '#33352C' }}>
      <p className="lp-mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#5A5A52', margin: '0 0 6px' }}>Antes de empezar</p>
      {children}
    </div>
  );
}

export function AyudaResultado({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `3px solid ${ACC}`, paddingLeft: 16, margin: '28px 0', fontSize: 15, lineHeight: 1.65, color: '#33352C' }}>
      <p className="lp-mono" style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#5A5A52', margin: '0 0 6px' }}>Resultado</p>
      {children}
    </div>
  );
}
