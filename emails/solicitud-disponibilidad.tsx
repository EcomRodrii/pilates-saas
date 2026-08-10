import type { ComponentProps } from 'react';
import { SolicitudDisponibilidadEmail } from '@/lib/emails/solicitud-disponibilidad-template';
import { MARCA, PROPIETARIA, INSTRUCTORA, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof SolicitudDisponibilidadEmail>;

const Preview = (props: Props) => <SolicitudDisponibilidadEmail {...props} />;

Preview.PreviewProps = { ...MARCA, nombre: INSTRUCTORA, propietariaNombre: PROPIETARIA, url: URL_MUESTRA } satisfies Props;

export default Preview;
