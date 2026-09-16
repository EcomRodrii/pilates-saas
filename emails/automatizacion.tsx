import { correoAutomatizacion } from '@/lib/emails/estudio/mensajes';
import { MARCA_CORREO, SOCIA } from './_muestra';

// Ver la nota de emails/reserva.tsx: el sistema devuelve el documento entero.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoAutomatizacion({
      marca: MARCA_CORREO,
      socioNombre: SOCIA,
      titulo: 'Te echamos de menos',
      mensaje: 'Hace tres semanas que no vienes a clase.\n\nSi quieres retomar, tienes plaza el lunes a las 09:00. Escríbenos y te la guardamos.',
    }),
  }} />
);

export default Preview;
