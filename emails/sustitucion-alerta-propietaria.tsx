import type { ComponentProps } from 'react';
import { AlertaPropietariaEmail } from '@/lib/emails/sustitucion-template';
import { MARCA, INSTRUCTORA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof AlertaPropietariaEmail>;

const Preview = (props: Props) => <AlertaPropietariaEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  claseNombre: CLASE.claseNombre,
  cuando: CUANDO,
  // 'baja' | 'sin_respuesta' | 'agotada' — cada una cambia título y cuerpo.
  tipo: 'sin_respuesta' as const,
  candidataNombre: INSTRUCTORA,
  urlPanel: URL_MUESTRA,
  yaContactando: true,
} satisfies Props;

export default Preview;
