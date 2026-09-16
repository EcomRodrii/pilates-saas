import { correoPlazaLiberada } from '@/lib/emails/estudio/clase';
import { MARCA_CORREO, SOCIA, CLASE, URL_MUESTRA } from './_muestra';

// Buenas noticias: sí lleva portada, y el filete va en verde.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoPlazaLiberada({ marca: MARCA_CORREO, socioNombre: SOCIA, ...CLASE, url: URL_MUESTRA, bonoConsumido: true }) }} />
);

export default Preview;
