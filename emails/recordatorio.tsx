import { correoRecordatorio } from '@/lib/emails/estudio/clase';
import { MARCA_CORREO, SOCIA, CLASE, URL_MUESTRA } from './_muestra';

// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoRecordatorio({ marca: MARCA_CORREO, socioNombre: SOCIA, ...CLASE, url: URL_MUESTRA }),
  }} />
);

export default Preview;
