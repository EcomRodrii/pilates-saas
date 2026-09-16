import { correoAvisoSustitucion } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO } from './_muestra';

// La única mala de las tres, y la única con filete rojo.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoAvisoSustitucion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, aviso: { tipo: 'cancelada' as const } }) }} />
);

export default Preview;
