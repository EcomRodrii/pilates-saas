import { correoReferenciaSolicitud } from '@/lib/emails/tentare/equipo';
import { INSTRUCTORA, PROPIETARIA, URL_MUESTRA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoReferenciaSolicitud({ nombreReferente: PROPIETARIA, profesionalNombre: INSTRUCTORA, relacion: 'Compañeras en Estudio Aravaca', url: URL_MUESTRA }) }} />
);

export default Preview;
