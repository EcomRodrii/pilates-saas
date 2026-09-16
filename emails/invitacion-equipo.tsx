import { correoInvitacionEquipo } from '@/lib/emails/tentare/equipo';
import { MARCA, INSTRUCTORA, PROPIETARIA, URL_MUESTRA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoInvitacionEquipo({ nombre: INSTRUCTORA, propietariaNombre: PROPIETARIA, estudioNombre: MARCA.estudioNombre, rol: 'INSTRUCTOR', url: URL_MUESTRA }) }} />
);

export default Preview;
