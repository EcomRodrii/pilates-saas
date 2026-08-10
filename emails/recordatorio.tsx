import type { ComponentProps } from 'react';
import { RecordatorioEmail } from '@/lib/emails/recordatorio-template';
import { MARCA, SOCIA, CLASE } from './_muestra';

type Props = ComponentProps<typeof RecordatorioEmail>;

const Preview = (props: Props) => <RecordatorioEmail {...props} />;

Preview.PreviewProps = { ...MARCA, ...CLASE, socioNombre: SOCIA } satisfies Props;

export default Preview;
