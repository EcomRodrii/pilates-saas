import { correoCambioClase } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE } from './_muestra';

// Cambio en una clase ya reservada. Tacha a quien la daba antes.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoCambioClase({ marca: MARCA_CORREO, socioNombre: SOCIA, ...CLASE, instructorAnterior: 'Lucía', cambioHora: true, masClasesDeLaSerie: true }) }} />
);

export default Preview;
