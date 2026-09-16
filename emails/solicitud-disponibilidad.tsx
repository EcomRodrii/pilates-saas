import { correoSolicitudDisponibilidad } from '@/lib/emails/tentare/equipo';
import { MARCA, INSTRUCTORA, PROPIETARIA, URL_MUESTRA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoSolicitudDisponibilidad({ nombre: INSTRUCTORA, propietariaNombre: PROPIETARIA, estudioNombre: MARCA.estudioNombre, url: URL_MUESTRA }) }} />
);

export default Preview;
