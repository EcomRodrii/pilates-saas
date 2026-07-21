import { Text, Section, Row, Column, Hr } from '@react-email/components';
import { EmailLayout } from '@/lib/emails/layout';

// Email a la gestoría con el resumen del Cierre de año. El libro de facturas
// completo va como adjunto CSV (lo añade el sender); aquí va el resumen legible.
// Marca del estudio (EmailLayout) para que sea reconocible y profesional.

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface CierreGestoriaEmailProps {
  estudioNombre: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  anio: number;
  remitente: string;             // nombre del estudio / propietaria que envía
  totales: { base: number; cuota: number; total: number; numFacturas: number; numManuales: number };
  trimestres: { trimestre: number; base: number; cuota: number; total: number }[];
  nombreAdjunto: string;
}

const th: React.CSSProperties = { color: '#9C9C94', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 0 6px' };
const td: React.CSSProperties = { color: '#1A1A1A', fontSize: 13, padding: '7px 0', borderTop: '1px solid #E5E1DA' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right' as const };

export function CierreGestoriaEmail({ estudioNombre, logoUrl, colorPrimario, anio, remitente, totales, trimestres, nombreAdjunto }: CierreGestoriaEmailProps) {
  return (
    <EmailLayout
      studioNombre={estudioNombre}
      logoUrl={logoUrl}
      colorPrimario={colorPrimario}
      titulo={`Cierre de año ${anio}`}
      preview={`Resumen fiscal ${anio} de ${estudioNombre} — ${eur(totales.total)} facturado`}
    >
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 16px' }}>
        Hola, te comparto el <strong>cierre del año {anio}</strong> de <strong>{estudioNombre}</strong>: el resumen de ingresos y del IVA repercutido, con el libro de facturas emitidas adjunto en CSV (<em>{nombreAdjunto}</em>).
      </Text>

      <Section style={{ backgroundColor: '#FAFAF7', borderRadius: 10, padding: '18px 22px', margin: '0 0 20px' }}>
        <Row>
          <Column><Text style={{ color: '#9C9C94', fontSize: 12, margin: '0 0 2px' }}>Base imponible</Text><Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: 0 }}>{eur(totales.base)}</Text></Column>
          <Column><Text style={{ color: '#9C9C94', fontSize: 12, margin: '0 0 2px' }}>IVA repercutido</Text><Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, margin: 0 }}>{eur(totales.cuota)}</Text></Column>
          <Column><Text style={{ color: '#9C9C94', fontSize: 12, margin: '0 0 2px' }}>Total facturado</Text><Text style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 800, margin: 0 }}>{eur(totales.total)}</Text></Column>
        </Row>
      </Section>

      <Text style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 700, margin: '0 0 6px' }}>Resumen por trimestre</Text>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', margin: '0 0 18px' }}>
        <thead>
          <tr><th style={{ ...th, textAlign: 'left' as const }}>Trimestre</th><th style={{ ...th, textAlign: 'right' as const }}>Base</th><th style={{ ...th, textAlign: 'right' as const }}>IVA</th><th style={{ ...th, textAlign: 'right' as const }}>Total</th></tr>
        </thead>
        <tbody>
          {trimestres.map((t) => (
            <tr key={t.trimestre}>
              <td style={td}>T{t.trimestre}</td>
              <td style={tdR}>{eur(t.base)}</td>
              <td style={tdR}>{eur(t.cuota)}</td>
              <td style={tdR}>{eur(t.total)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 800, borderTop: '2px solid #DAD6CC' }}>Año {anio}</td>
            <td style={{ ...tdR, fontWeight: 800, borderTop: '2px solid #DAD6CC' }}>{eur(totales.base)}</td>
            <td style={{ ...tdR, fontWeight: 800, borderTop: '2px solid #DAD6CC' }}>{eur(totales.cuota)}</td>
            <td style={{ ...tdR, fontWeight: 800, borderTop: '2px solid #DAD6CC' }}>{eur(totales.total)}</td>
          </tr>
        </tbody>
      </table>

      <Text style={{ color: '#6B7280', fontSize: 12.5, margin: '0 0 4px' }}>
        Incluye {totales.numFacturas} factura(s) emitida(s) en Tentare{totales.numManuales ? ` y ${totales.numManuales} ingreso(s) añadido(s) a mano (cobrados fuera de la plataforma)` : ''}.
      </Text>
      <Hr style={{ borderColor: '#E5E1DA', margin: '16px 0' }} />
      <Text style={{ color: '#9C9C94', fontSize: 12, margin: 0, lineHeight: 1.55 }}>
        Este resumen recopila ingresos y el IVA repercutido a partir de las facturas del estudio. No incluye gastos ni IVA soportado, y no sustituye la presentación de impuestos. Enviado desde Tentare por {remitente}; puedes responder a este correo para contactar con el estudio.
      </Text>
    </EmailLayout>
  );
}
