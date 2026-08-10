import type { ComponentProps } from 'react';
import { ImpagoEmail } from '@/lib/emails/impago-template';
import { MARCA, SOCIA } from './_muestra';

type Props = ComponentProps<typeof ImpagoEmail>;

const Preview = (props: Props) => <ImpagoEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  socioNombre: SOCIA,
  concepto: 'Cuota de agosto',
  importe: 45,
  // true = fallo definitivo (cabecera roja, pide acción). false = primer fallo
  // (cabecera ámbar, solo informa de que se reintentará).
  definitivo: false,
} satisfies Props;

export default Preview;
