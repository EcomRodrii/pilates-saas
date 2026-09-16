import { correoPlazaLiberadaSinConfirmar } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

// No confirmó y se liberó su plaza. Sin filete de alerta a propósito: informar, no castigar.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoPlazaLiberadaSinConfirmar({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, url: URL_MUESTRA }) }} />
);

export default Preview;
