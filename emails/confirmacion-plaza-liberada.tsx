import type { ComponentProps } from 'react';
import { PlazaLiberadaEmail } from '@/lib/emails/confirmacion-riesgo-template';
import { MARCA, SOCIA, CLASE, CUANDO } from './_muestra';

type Props = ComponentProps<typeof PlazaLiberadaEmail>;

const Preview = (props: Props) => <PlazaLiberadaEmail {...props} />;

Preview.PreviewProps = { ...MARCA, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO } satisfies Props;

export default Preview;
