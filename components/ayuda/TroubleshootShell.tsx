import { AlertTriangle } from 'lucide-react';

// Estructura fija de un artículo de "Problemas y soluciones", pedida en el
// brief: Qué está pasando → Causas más comunes → Cómo solucionarlo → Si sigue
// sin funcionar (ese último bloque es <AyudaCTASoporte>, ya en ArticuloShell,
// así que no se repite aquí).
export function QueEstaPasando({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, background: '#FBF3EC', borderRadius: 14, padding: '16px 18px', margin: '4px 0 24px' }}>
      <AlertTriangle size={18} style={{ flex: 'none', color: '#B5652F', marginTop: 2 }} aria-hidden />
      <div style={{ fontSize: 14.5, lineHeight: 1.6, color: '#5A3B1E' }}>{children}</div>
    </div>
  );
}

export function CausasComunes({ items }: { items: string[] }) {
  return (
    <div style={{ margin: '24px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Causas más comunes</h2>
      <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((c, i) => (
          <li key={i} style={{ fontSize: 15, lineHeight: 1.6, color: '#33352C' }}>{c}</li>
        ))}
      </ol>
    </div>
  );
}

export function ComoSolucionarlo({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: '28px 0' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Cómo solucionarlo</h2>
      {children}
    </div>
  );
}
