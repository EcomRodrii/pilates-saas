import { correoAlertaPropietaria } from '@/lib/emails/tentare/equipo';
import { MARCA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{ __html: correoAlertaPropietaria({ estudioNombre: MARCA.estudioNombre, claseNombre: CLASE.claseNombre, cuando: CUANDO, tipo: 'agotada' as const, urlPanel: URL_MUESTRA, nNetwork: 2 }) }} />
);

export default Preview;
