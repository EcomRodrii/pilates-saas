import { correoReserva } from '@/lib/emails/estudio/clase';
import { MARCA_CORREO, SOCIA, CLASE, URL_MUESTRA } from './_muestra';

// El mismo correo, pero con el estudio habiendo escrito el suyo: cuerpo entero
// en Markdown, los datos y el botón colocados donde ella quiere, su color y su
// tipografía. Sirve de referencia de lo que ve una propietaria al usar
// «Escribir el correo entero» en Configuración.
const Preview = () => (
  <div dangerouslySetInnerHTML={{
    __html: correoReserva({
      marca: MARCA_CORREO,
      socioNombre: SOCIA,
      ...CLASE,
      url: URL_MUESTRA,
      personalizacion: {
        cuerpo: [
          '## Nos vemos el lunes, Ana',
          '',
          'Tu sitio está guardado. Llega **cinco minutos antes** para colocarte con calma.',
          '',
          '{datos}',
          '',
          '- Trae calcetines antideslizantes',
          '- El agua la ponemos nosotras',
          '',
          '{boton}',
          '',
          'Si te surge algo, avísanos por [WhatsApp](https://wa.me/34600111222) y liberamos tu plaza.',
        ].join('\n'),
        colorCabecera: '#8C6A4A',
        fuente: 'Georgia',
        pie: 'Estudio Aravaca · Calle Ejemplo 12 · 600 111 222',
      },
    }),
  }} />
);

export default Preview;
