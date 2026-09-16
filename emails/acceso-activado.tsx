import { correoAccesoActivado } from '@/lib/emails/tentare/cuenta';
import { INSTRUCTORA } from './_muestra';

// Familia Tentare (lib/emails/tentare/). Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoAccesoActivado({
      nombre: INSTRUCTORA, emailCuenta: 'marta@example.com', estudioNombre: 'Estudio Aravaca',
      urlEquipo: 'https://www.tentare.app/equipo',
    }),
  }} />
);

export default Preview;
