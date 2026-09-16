import { correoCancelacionClase } from '@/lib/emails/estudio/clase';
import { MARCA_CORREO, SOCIA, CLASE } from './_muestra';

// Sin foto de portada y con filete rojo: es un aviso, no una postal.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoCancelacionClase({ marca: MARCA_CORREO, socioNombre: SOCIA, ...CLASE, bonoDevuelto: true }) }} />
);

export default Preview;
