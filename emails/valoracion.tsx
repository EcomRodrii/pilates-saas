import type { ComponentProps } from 'react';
import { PedirValoracionEmail } from '@/lib/emails/valoracion-template';
import { MARCA, SOCIA, INSTRUCTORA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof PedirValoracionEmail>;

const Preview = (props: Props) => <PedirValoracionEmail {...props} />;

Preview.PreviewProps = { ...MARCA, toName: SOCIA, claseNombre: CLASE.claseNombre, cuando: CUANDO, instructorNombre: INSTRUCTORA, url: URL_MUESTRA } satisfies Props;

export default Preview;
