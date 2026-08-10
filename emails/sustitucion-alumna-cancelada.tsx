import type { ComponentProps } from 'react';
import { AlumnaAvisoClaseEmail } from '@/lib/emails/sustitucion-template';
import { MARCA, SOCIA, CLASE, CUANDO } from './_muestra';

type Props = ComponentProps<typeof AlumnaAvisoClaseEmail>;

const Preview = (props: Props) => <AlumnaAvisoClaseEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  toName: SOCIA,
  claseNombre: CLASE.claseNombre,
  cuando: CUANDO,
  aviso: { tipo: 'cancelada' } as const,
} satisfies Props;

export default Preview;
