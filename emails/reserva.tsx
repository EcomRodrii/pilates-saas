import { correoReserva } from '@/lib/emails/estudio/clase';
import { MARCA_CORREO, SOCIA, CLASE, URL_MUESTRA } from './_muestra';

// El sistema de correos del estudio genera el documento HTML entero
// (lib/emails/estudio/plantilla.ts), así que aquí se inyecta tal cual: `email
// dev` lo envuelve en su propio <html> y el navegador se queda con el cuerpo.
// Como todos los estilos van en línea, se ve igual.
//
// ⚠️ Esta vista es una comodidad de desarrollo. La vista previa que importa —la
// que usa la propietaria, con SUS datos— está en Configuración → Correos
// automáticos, y sale del mismo HTML que recibe la clienta.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoReserva({ marca: MARCA_CORREO, socioNombre: SOCIA, ...CLASE, url: URL_MUESTRA }),
  }} />
);

export default Preview;
