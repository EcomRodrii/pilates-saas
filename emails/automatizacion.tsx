import type { ComponentProps } from 'react';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { MARCA, SOCIA } from './_muestra';

type Props = ComponentProps<typeof AutomatizacionEmail>;

const Preview = (props: Props) => <AutomatizacionEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  socioNombre: SOCIA,
  titulo: 'Te echamos de menos',
  mensaje: 'Hace tres semanas que no vienes a clase.\n\nSi quieres retomar, tienes plaza el lunes a las 09:00. Escríbenos y te la guardamos.',
} satisfies Props;

export default Preview;
