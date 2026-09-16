import { correoContactoSustituta } from '@/lib/emails/tentare/equipo';
import { MARCA, INSTRUCTORA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoContactoSustituta({ toName: INSTRUCTORA, estudioNombre: MARCA.estudioNombre, claseNombre: CLASE.claseNombre, cuando: CUANDO, url: URL_MUESTRA }) }} />
);

export default Preview;
