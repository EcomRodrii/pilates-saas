import { correoRecibo } from '@/lib/emails/estudio/cobros';
import { MARCA_CORREO, SOCIA, URL_MUESTRA } from './_muestra';

// Contenido fiscal: es el único de la familia que NO se puede personalizar.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoRecibo({ marca: MARCA_CORREO, socioNombre: SOCIA, concepto: 'Cuota de agosto', importe: 45, fechaCobro: '2026-08-04T10:00:00.000Z', numeroFactura: 'A-2026-0042', url: URL_MUESTRA }) }} />
);

export default Preview;
