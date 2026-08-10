import type { ComponentProps } from 'react';
import { PromocionEsperaEmail } from '@/lib/emails/promocion-espera-template';
import { MARCA, SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof PromocionEsperaEmail>;

const Preview = (props: Props) => <PromocionEsperaEmail {...props} />;

Preview.PreviewProps = { ...MARCA, ...CLASE, socioNombre: SOCIA, bonoConsumido: true } satisfies Props;

export default Preview;
