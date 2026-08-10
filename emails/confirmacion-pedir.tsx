import type { ComponentProps } from 'react';
import { PedirConfirmacionEmail } from '@/lib/emails/confirmacion-riesgo-template';
import { MARCA, SOCIA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof PedirConfirmacionEmail>;

const Preview = (props: Props) => <PedirConfirmacionEmail {...props} />;

Preview.PreviewProps = { ...MARCA, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, url: URL_MUESTRA } satisfies Props;

export default Preview;
