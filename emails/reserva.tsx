import type { ComponentProps } from 'react';
import { ReservaEmail } from '@/lib/emails/reserva-template';
import { MARCA, SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof ReservaEmail>;

const Preview = (props: Props) => <ReservaEmail {...props} />;

Preview.PreviewProps = { ...MARCA, ...CLASE, socioNombre: SOCIA } satisfies Props;

export default Preview;
