import type { ComponentProps } from 'react';
import { ReferenciaSolicitudEmail } from '@/lib/emails/referencia-solicitud-template';
import { URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof ReferenciaSolicitudEmail>;

const Preview = (props: Props) => <ReferenciaSolicitudEmail {...props} />;

Preview.PreviewProps = {
  nombreReferente: 'Carla Jiménez',
  profesionalNombre: 'Marta Ruiz',
  relacion: 'fue mi responsable de estudio',
  url: URL_MUESTRA,
} satisfies Props;

export default Preview;
