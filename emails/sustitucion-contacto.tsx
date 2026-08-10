import type { ComponentProps } from 'react';
import { ContactoSustitutaEmail } from '@/lib/emails/sustitucion-template';
import { MARCA, INSTRUCTORA, CLASE, CUANDO, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof ContactoSustitutaEmail>;

const Preview = (props: Props) => <ContactoSustitutaEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  toName: INSTRUCTORA,
  claseNombre: CLASE.claseNombre,
  cuando: CUANDO,
  url: URL_MUESTRA,
  // true = segundo intento; cambia el título y el texto de introducción.
  recordatorio: false,
} satisfies Props;

export default Preview;
