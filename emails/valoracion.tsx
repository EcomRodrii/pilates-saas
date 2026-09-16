import { correoValoracion } from '@/lib/emails/estudio/mensajes';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO, INSTRUCTORA, URL_MUESTRA } from './_muestra';

// Petición de valoración tras la clase. Sin portada: es una pregunta corta.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoValoracion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, instructorNombre: INSTRUCTORA, url: URL_MUESTRA }) }} />
);

export default Preview;
