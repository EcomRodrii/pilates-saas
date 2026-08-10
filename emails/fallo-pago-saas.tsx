import type { ComponentProps } from 'react';
import { FalloPagoSaasEmail } from '@/lib/emails/fallo-pago-saas-template';
import { MARCA } from './_muestra';

type Props = ComponentProps<typeof FalloPagoSaasEmail>;

const Preview = (props: Props) => <FalloPagoSaasEmail {...props} />;

Preview.PreviewProps = { estudioNombre: MARCA.estudioNombre, plan: 'Estudio', proximoIntento: '14 de agosto' } satisfies Props;

export default Preview;
