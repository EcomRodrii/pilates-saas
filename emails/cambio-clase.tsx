import type { ComponentProps } from 'react';
import { CambioClaseEmail } from '@/lib/emails/cambio-clase-template';
import { MARCA, SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof CambioClaseEmail>;

const Preview = (props: Props) => <CambioClaseEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  ...CLASE,
  socioNombre: SOCIA,
  // Los tres cambios a la vez. Ponlos a false uno a uno para ver cada variante
  // del texto de introducción (instructora sola, hora sola, hora + sala...).
  instructorAnterior: 'Lucía Serrano',
  cambioHora: true,
  cambioSala: true,
} satisfies Props;

export default Preview;
