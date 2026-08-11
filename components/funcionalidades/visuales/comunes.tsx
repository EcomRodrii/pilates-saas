import { MUTED } from '@/components/landing/theme';

// Andamiaje mínimo compartido por los dibujos de ./visuales. NO es un
// "diagrama genérico": solo resuelve el marco (panel translúcido para el
// encabezado oscuro, panel claro para el cuerpo) para que cada página dibuje
// lo suyo dentro sin repetir estilos de contenedor.

/** Panel translúcido: va sobre el degradado oscuro del encabezado. */
export function PanelOscuro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'rgba(255,255,255,.055)', border: '1px solid rgba(255,255,255,.13)', borderRadius: 20, padding: 'clamp(18px,2.2vw,24px)', backdropFilter: 'blur(8px)' }}>
      <div className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>{titulo}</div>
      {children}
    </div>
  );
}

/** Panel claro con título: para los diagramas que van dentro del cuerpo. */
export function PanelClaro({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: '28px 0', background: '#fff', border: '1px solid #E7E7E0', borderRadius: 20, padding: 'clamp(20px,2.6vw,28px)', overflow: 'hidden' }}>
      <figcaption className="lp-mono" style={{ fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8E8E86', marginBottom: 18 }}>{titulo}</figcaption>
      {children}
      {nota && <p style={{ margin: '18px 0 0', fontSize: 12.5, lineHeight: 1.5, color: MUTED }}>{nota}</p>}
    </figure>
  );
}

/** Fila de una secuencia vertical con conector. `ultimo` corta la línea. */
export function PasoVertical({
  indice, titulo, children, color = '#343825', ultimo = false, tono = 'claro',
}: {
  indice: string; titulo: string; children?: React.ReactNode; color?: string; ultimo?: boolean; tono?: 'claro' | 'oscuro';
}) {
  const oscuro = tono === 'oscuro';
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <span className="lp-mono" style={{ width: 28, height: 28, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 500, color: oscuro ? '#0F0F0F' : '#fff', background: oscuro ? '#D9C29E' : color }}>{indice}</span>
        {!ultimo && <span style={{ flex: 1, width: 2, minHeight: 18, background: oscuro ? 'rgba(255,255,255,.16)' : '#E7E7E0', marginTop: 4 }} />}
      </div>
      <div style={{ paddingBottom: ultimo ? 0 : 18, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em', color: oscuro ? '#fff' : '#1A1A1A', marginBottom: children ? 4 : 0 }}>{titulo}</div>
        {children && <div style={{ fontSize: 13.5, lineHeight: 1.5, color: oscuro ? 'rgba(255,255,255,.66)' : MUTED }}>{children}</div>}
      </div>
    </div>
  );
}
