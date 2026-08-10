import type { ComponentProps } from 'react';
import { AccesoActivadoEmail } from '@/lib/emails/acceso-activado-template';
import { MARCA, INSTRUCTORA } from './_muestra';

type Props = ComponentProps<typeof AccesoActivadoEmail>;

const Preview = (props: Props) => <AccesoActivadoEmail {...props} />;

Preview.PreviewProps = { ...MARCA, nombre: INSTRUCTORA, emailCuenta: 'marta.ruiz@ejemplo.com' } satisfies Props;

export default Preview;
