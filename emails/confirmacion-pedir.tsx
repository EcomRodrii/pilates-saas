import { correoPedirConfirmacion } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

// Víspera de clase, a quien tiene riesgo de no venir. Un botón, sin vueltas.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoPedirConfirmacion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, url: URL_MUESTRA }) }} />
);

export default Preview;
