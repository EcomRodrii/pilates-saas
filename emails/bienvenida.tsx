import { correoBienvenida } from '@/lib/emails/estudio/cuenta';
import { MARCA_CORREO, SOCIA, URL_MUESTRA } from './_muestra';

// El alta de una alumna: el único correo del estudio cuyo botón abre una cuenta.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoBienvenida({ marca: MARCA_CORREO, socioNombre: SOCIA, planNombre: 'Mensual Ilimitado', url: URL_MUESTRA }) }} />
);

export default Preview;
