import type { ComponentProps } from 'react';
import { BienvenidaEmail } from '@/lib/emails/bienvenida-template';
import { MARCA, SOCIA, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof BienvenidaEmail>;

const Preview = (props: Props) => <BienvenidaEmail {...props} />;

Preview.PreviewProps = { ...MARCA, socioNombre: SOCIA, planNombre: 'Mensual Ilimitado', url: URL_MUESTRA } satisfies Props;

export default Preview;
