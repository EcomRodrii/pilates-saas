import { correoAvisoSustitucion } from '@/lib/emails/estudio/avisos';
import { MARCA_CORREO, SOCIA, CLASE, CUANDO } from './_muestra';

// Cambia de horario: el antes tachado y el después debajo.
// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoAvisoSustitucion({ marca: MARCA_CORREO, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, aviso: { tipo: 'reprogramada' as const, cuandoNuevo: 'jueves 7 de agosto a las 19:00' } }) }} />
);

export default Preview;
