import type { ComponentProps } from 'react';
import { CierreGestoriaEmail } from '@/lib/emails/cierre-gestoria-template';
import { MARCA, PROPIETARIA } from './_muestra';

type Props = ComponentProps<typeof CierreGestoriaEmail>;

const Preview = (props: Props) => <CierreGestoriaEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  anio: 2026,
  // null = el año completo. 1|2|3|4 = envío trimestral (modelo 303).
  trimestre: null,
  remitente: PROPIETARIA,
  totales: { base: 48250, cuota: 10132.5, total: 58382.5, numFacturas: 412, numManuales: 7 },
  trimestres: [
    { trimestre: 1, base: 11200, cuota: 2352, total: 13552 },
    { trimestre: 2, base: 12800, cuota: 2688, total: 15488 },
    { trimestre: 3, base: 12450, cuota: 2614.5, total: 15064.5 },
    { trimestre: 4, base: 11800, cuota: 2478, total: 14278 },
  ],
  nombreAdjunto: 'facturas-2026.csv',
} satisfies Props;

export default Preview;
