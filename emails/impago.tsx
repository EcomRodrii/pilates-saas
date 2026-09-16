import { correoImpago } from '@/lib/emails/estudio/cobros';
import { MARCA_CORREO, SOCIA } from './_muestra';

// Primer fallo (ámbar). Con `definitivo: true` cambian titular, tono y color.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoImpago({ marca: MARCA_CORREO, socioNombre: SOCIA, concepto: 'Cuota de agosto', importe: 45, definitivo: false }) }} />
);

export default Preview;
