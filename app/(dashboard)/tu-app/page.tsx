import { EditorAparienciaApp } from '@/components/apariencia/editor-apariencia-app';

// «Tu app» (16-oct-2026, interruptor MI_WEB_NUEVA): su propia entrada del menú. Es el editor de
// siempre de «Apariencia de tu app» —el de Bonsai, que el fundador quiere tal cual—, con sus pasos y,
// en el último, la app de la App Store. `/configuracion/apariencia` sigue llevando al mismo editor.
export const metadata = { title: 'Tu app' };

export default function TuAppPage() {
  return <EditorAparienciaApp />;
}
