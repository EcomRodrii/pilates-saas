import { correoAvisoSustitucion } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO, INSTRUCTORA } from './_muestra';

// Buena noticia: la clase sigue en pie con otra instructora.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoAvisoSustitucion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, aviso: { tipo: 'cubierta' as const, sustituta: INSTRUCTORA } }) }} />
);

export default Preview;
