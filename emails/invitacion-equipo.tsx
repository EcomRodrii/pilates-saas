import type { ComponentProps } from 'react';
import { InvitacionEquipoEmail } from '@/lib/emails/invitacion-equipo-template';
import { MARCA, PROPIETARIA, INSTRUCTORA, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof InvitacionEquipoEmail>;

const Preview = (props: Props) => <InvitacionEquipoEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  nombre: INSTRUCTORA,
  propietariaNombre: PROPIETARIA,
  // Cambia el rol para ver el nombre de producto que sale: INSTRUCTOR da
  // Tentare Core; PROPIETARIO/MANAGER/RECEPCION dan Tentare Manager.
  rol: 'INSTRUCTOR',
  url: URL_MUESTRA,
} satisfies Props;

export default Preview;
