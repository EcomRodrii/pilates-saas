import { correoRecordatorioConfirmacion } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

// Segundo aviso. Reconoce que ya se escribió, no repite el primero.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoRecordatorioConfirmacion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, url: URL_MUESTRA }) }} />
);

export default Preview;
