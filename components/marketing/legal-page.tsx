import { MarketingShell } from '@/components/marketing/shell';

// Estructura compartida de las 5 páginas legales. AVISO IMPORTANTE (se
// renderiza en cada página, no solo aquí en el código): este es un punto de
// partida razonable con la estructura estándar de un SaaS, NO una revisión
// legal real. No debe publicarse en producción con datos de clientes reales
// sin que un abogado lo revise y complete los datos identificativos
// (razón social, CIF, domicilio) que aquí van como placeholder.
export function LegalPage({ titulo, actualizado, children }: { titulo: string; actualizado: string; children: React.ReactNode }) {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 24px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Legal
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 36, letterSpacing: '-.02em', margin: '0 0 8px' }}>{titulo}</h1>
        <p style={{ fontSize: 13, color: '#8E8E86', margin: '0 0 28px' }}>Última actualización: {actualizado}</p>

        <div style={{ background: '#FFF2F7', border: '1px solid #F7D3E5', borderRadius: 14, padding: '16px 20px', fontSize: 13.5, color: '#7A4E60', lineHeight: 1.6, marginBottom: 32 }}>
          Este documento es un punto de partida razonable con la estructura habitual de un SaaS — no sustituye una revisión legal real.
          Los datos identificativos marcados como <code style={{ background: 'rgba(122,78,96,.1)', padding: '1px 5px', borderRadius: 4 }}>[placeholder]</code> deben completarse
          con los datos reales de la empresa antes de operar con clientes en producción.
        </div>
      </section>
      <section style={{ padding: '0 40px 110px', maxWidth: 760, margin: '0 auto', fontSize: 15, lineHeight: 1.75, color: '#374151' }}>
        {children}
      </section>
    </MarketingShell>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.01em', color: '#1A1A1A', margin: '32px 0 10px' }}>{children}</h2>;
}
