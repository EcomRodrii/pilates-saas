import { correoFalloPagoSaas } from '@/lib/emails/tentare/cuenta';

// Familia Tentare (lib/emails/tentare/): el sistema devuelve el documento
// entero, así que se inyecta tal cual. Ver la nota de emails/reserva.tsx.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoFalloPagoSaas({
      estudioNombre: 'Estudio Aravaca', plan: 'Estudio', proximoIntento: '19 de septiembre',
      urlSuscripcion: 'https://www.tentare.app/suscripcion',
    }),
  }} />
);

export default Preview;
