import type { ComponentProps } from 'react';
import { AutomatizacionEmail } from '@/lib/emails/automatizacion-template';
import { MARCA, SOCIA, CLASE, URL_MUESTRA } from './_muestra';

type Props = ComponentProps<typeof AutomatizacionEmail>;

// El aviso de hueco libre («Rellenar hueco» de la home y el radar de
// ocupación) cuando sale por correo. Misma plantilla que las campañas, con dos
// diferencias que se ven aquí: el botón de reservar —sin él, el enlace queda
// suelto dentro del texto y Outlook no lo subraya— y el pie de baja, que no es
// opcional: el consentimiento que firmó la socia promete poder darse de baja
// «desde el enlace de baja de cualquier email».
const Preview = (props: Props) => <AutomatizacionEmail {...props} />;

Preview.PreviewProps = {
  ...MARCA,
  socioNombre: SOCIA,
  titulo: `Se ha quedado un hueco en ${CLASE.claseNombre}`,
  mensaje: `Se ha liberado una plaza en ${CLASE.claseNombre} el ${CLASE.fecha} a las ${CLASE.hora}. Si te viene bien, es tuya.`,
  accion: { url: URL_MUESTRA, texto: 'Reservar mi plaza' },
  unsubscribeUrl: `${URL_MUESTRA}/baja`,
} satisfies Props;

export default Preview;
