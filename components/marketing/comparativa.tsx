import Link from 'next/link';
import { MarketingShell, ACC } from '@/components/marketing/shell';

export interface FilaComparativa {
  criterio: string;
  tentare: string;
  competidor: string;
}

export interface DatosComparativa {
  nombre: string;
  resumen: string;
  filas: FilaComparativa[];
  fuentes: { label: string; nota: string }[];
  fechaVerificacion: string; // "julio de 2026"
}

// Página de comparativa compartida por los 5 competidores. El contenido de
// cada fila viene de investigación pública (páginas de precios propias de
// cada competidor); el aviso de fecha es obligatorio porque precios y
// funciones cambian sin avisar — no queremos dejar una afirmación caducada
// sin contexto.
export function ComparativaPage({ datos }: { datos: DatosComparativa }) {
  return (
    <MarketingShell>
      <section style={{ padding: '72px 40px 32px', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '.14em', textTransform: 'uppercase', color: '#B57A8E', marginBottom: 16, fontFamily: 'monospace' }}>
          Comparativa
        </div>
        <h1 style={{ fontWeight: 800, fontSize: 42, lineHeight: 1.1, letterSpacing: '-.03em', margin: '0 0 20px' }}>
          Tentare vs {datos.nombre}
        </h1>
        <p style={{ fontSize: 17, color: '#5A5A52', margin: 0 }}>{datos.resumen}</p>
      </section>

      <section style={{ padding: '0 40px 24px', maxWidth: 900, margin: '0 auto' }}>
        <div style={{ background: '#FFF2F7', border: '1px solid #F7D3E5', borderRadius: 14, padding: '16px 20px', fontSize: 13.5, color: '#7A4E60', lineHeight: 1.6 }}>
          Comparativa actualizada en <strong>{datos.fechaVerificacion}</strong>, a partir de la información pública de {datos.nombre}. Los precios y funciones de terceros cambian sin avisar — verifica las cifras actuales en su web antes de decidir.
        </div>
      </section>

      <section style={{ padding: '0 40px 80px', maxWidth: 900, margin: '0 auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#FFFFFF', border: '1px solid #E7E7E0', borderRadius: 20, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#0F0F0F' }}>
              <th style={{ textAlign: 'left', padding: '16px 20px', color: '#8E8E86', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>Criterio</th>
              <th style={{ textAlign: 'left', padding: '16px 20px', color: ACC, fontSize: 13, fontWeight: 800 }}>Tentare</th>
              <th style={{ textAlign: 'left', padding: '16px 20px', color: '#E8E8E4', fontSize: 13, fontWeight: 800 }}>{datos.nombre}</th>
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f, i) => (
              <tr key={f.criterio} style={{ borderTop: '1px solid #EDEDE6', background: i % 2 === 0 ? '#FFFFFF' : '#FAFAF7' }}>
                <td style={{ padding: '16px 20px', fontSize: 14, fontWeight: 700, color: '#1A1A1A', verticalAlign: 'top' }}>{f.criterio}</td>
                <td style={{ padding: '16px 20px', fontSize: 14, color: '#374151', verticalAlign: 'top' }}>{f.tentare}</td>
                <td style={{ padding: '16px 20px', fontSize: 14, color: '#5A5A52', verticalAlign: 'top' }}>{f.competidor}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 20, fontSize: 12.5, color: '#8E8E86', lineHeight: 1.7 }}>
          {datos.fuentes.map(f => <div key={f.label}><strong>{f.label}:</strong> {f.nota}</div>)}
        </div>
      </section>

      <section style={{ padding: '0 40px 110px', textAlign: 'center' }}>
        <Link
          href="/crear-estudio"
          style={{ display: 'inline-block', background: ACC, color: '#171717', borderRadius: 999, fontSize: 16, fontWeight: 600, padding: '16px 30px', textDecoration: 'none' }}
        >
          Crear mi estudio →
        </Link>
      </section>
    </MarketingShell>
  );
}
