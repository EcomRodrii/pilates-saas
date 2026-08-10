import { Text, Section, Hr, Row, Column } from '@react-email/components';
import { EmailLayout, EmailButton } from '@/lib/emails/layout';
// Sin maximumFractionDigits, toLocaleString usa 3 por defecto: el Total de un
// justificante de pago salía como "249,235 €". formatEuro ya fija los 2.
import { formatEuro } from '@/lib/utils';

interface Props {
  socioNombre: string;
  concepto: string;
  importe: number;
  fechaCobro: string;
  numeroFactura?: string;
  estudioNombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  // Enlace a "Mis compras" en el portal, donde la socia puede ver/descargar su
  // factura (el PDF sigue siendo client-side, ver lib/factura-pdf.ts — no hay
  // generación server-side todavía). Sin él (envío disparado sin studio.slug
  // resuelto), el email sale igual, solo sin el botón.
  url?: string;
}

export function ReciboEmail({
  socioNombre,
  concepto,
  importe,
  fechaCobro,
  numeroFactura,
  estudioNombre = 'Tentare',
  logoUrl,
  colorPrimario,
  url,
}: Props) {
  const fecha = new Date(fechaCobro).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <EmailLayout studioNombre={estudioNombre} logoUrl={logoUrl} colorPrimario={colorPrimario} titulo="Pago confirmado" preview={`Hemos recibido tu pago de ${importe.toFixed(2)} €`}>
      <Text style={{ color: '#374151', fontSize: 15, margin: '0 0 24px' }}>
        Hola <strong>{socioNombre}</strong>, hemos recibido tu pago correctamente.
      </Text>

      <Section style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
        <Row>
          <Column>
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 4px' }}>
              Concepto
            </Text>
            <Text style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, margin: 0 }}>
              {concepto}
            </Text>
          </Column>
          <Column style={{ textAlign: 'right' as const }}>
            <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 4px' }}>
              Total
            </Text>
            <Text style={{ color: '#2F6B4F', fontSize: 24, fontWeight: 800, margin: 0 }}>
              {formatEuro(importe)}
            </Text>
          </Column>
        </Row>
      </Section>

      <Hr style={{ borderColor: '#E5E1DA', margin: '0 0 20px' }} />

      <Row>
        <Column>
          <Text style={{ color: '#63635D', fontSize: 12, margin: '0 0 2px' }}>Fecha</Text>
          <Text style={{ color: '#374151', fontSize: 14, fontWeight: 600, margin: 0 }}>{fecha}</Text>
        </Column>
        {numeroFactura && (
          <Column>
            <Text style={{ color: '#63635D', fontSize: 12, margin: '0 0 2px' }}>Nº Factura</Text>
            <Text style={{ color: '#374151', fontSize: 14, fontWeight: 600, margin: 0 }}>{numeroFactura}</Text>
          </Column>
        )}
      </Row>

      {url && (
        <>
          <Hr style={{ borderColor: '#E5E1DA', margin: '20px 0' }} />
          <EmailButton href={url} colorPrimario={colorPrimario}>Ver mi factura</EmailButton>
        </>
      )}
    </EmailLayout>
  );
}
