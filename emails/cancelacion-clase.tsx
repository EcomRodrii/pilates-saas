import type { ComponentProps } from 'react';
import { CancelacionClaseEmail } from '@/lib/emails/cancelacion-clase-template';
import { MARCA, SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof CancelacionClaseEmail>;

const Preview = (props: Props) => <CancelacionClaseEmail {...props} />;

Preview.PreviewProps = { ...MARCA, ...CLASE, socioNombre: SOCIA, bonoDevuelto: true } satisfies Props;

export default Preview;
