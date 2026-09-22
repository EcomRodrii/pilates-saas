import { EditorAparienciaApp } from '@/components/apariencia/editor-apariencia-app';

// «Apariencia de tu app» (22-sep-2026). Sustituye al aviso de mantenimiento
// que había aquí desde el 7-sep: el editor de marca del portal se rehízo como
// editor GUIADO de la app de la alumna — ver components/apariencia/.
export const metadata = { title: 'Apariencia de tu app' };

export default function AparienciaPage() {
  return <EditorAparienciaApp />;
}
