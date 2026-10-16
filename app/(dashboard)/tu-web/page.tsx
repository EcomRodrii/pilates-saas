import { TuWeb } from './tu-web';

// «Tu web» (16-oct-2026, interruptor MI_WEB_NUEVA): los widgets para la página web del estudio, en su
// propia entrada del menú y separados de la app de la alumna (decisión del fundador). Hoy es el
// constructor de siempre; la portada «Tus widgets» de la v2 aprobada llega aquí.
export const metadata = { title: 'Tu web' };

export default function TuWebPage() {
  return <TuWeb />;
}
