import type { ComponentProps } from 'react';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof ReservaEmail>;

// La misma plantilla que `reserva.tsx`, pero con el estudio habiendo escrito su
// propio correo: cuerpo entero en Markdown, datos colocados donde ella quiere,
// su color de banda, su tipografía y su pie. Sirve de referencia visual de lo
// que ve una propietaria al usar "Escribir el correo entero" en Configuración.
const Preview = (props: Props) => <ReservaEmail {...props} />;

Preview.PreviewProps = {
  estudioNombre: 'Estudio Aravaca',
  logoUrl: null,
  colorPrimario: '#343825',
  socioNombre: SOCIA,
  ...CLASE,
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
      'Si te surge algo, avísanos por [WhatsApp](https://wa.me/34600111222) y liberamos tu plaza.',
    ].join('\n'),
    colorCabecera: '#8C6A4A',
    fuente: 'Georgia',
    pie: 'Estudio Aravaca · Calle Ejemplo 12 · 600 111 222',
  },
} satisfies Props;

export default Preview;
