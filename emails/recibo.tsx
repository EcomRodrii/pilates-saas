import type { ComponentProps } from 'react';
import { ReciboEmail } from '@/lib/emails/recibo-template';
import { MARCA, SOCIA, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof ReciboEmail>;

const Preview = (props: Props) => <ReciboEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  socioNombre: SOCIA,
  concepto: 'Bono 10 sesiones',
  importe: 120,
  // La plantilla hace `new Date(fechaCobro)`: tiene que ser ISO, igual que lo
  // que pasa el webhook real (recibos.fecha_cobro). Un "4 de agosto de 2026"
  // aquí sale como "Invalid Date".
  fechaCobro: '2026-08-04T10:30:00.000Z',
  numeroFactura: 'F2026-0042',
  url: URL_MUESTRA,
} satisfies Props;

export default Preview;
