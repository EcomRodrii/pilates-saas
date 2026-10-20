import type { Metadata } from 'next';
import { AltaEstudio } from './alta-estudio';
import { foundingGratisEnAltas } from '@/lib/alta/founding-gratis-alta';

// La pantalla del alta es de cliente (alta-estudio.tsx). Esta página solo lee en
// el servidor si un estudio nuevo empieza gratis (FOUNDING_GRATIS encendido para
// todos; la variable no llega al navegador) y se lo pasa.
// Sin indexar (NOINDEX_PROPIO, lib/seo/no-indexables.ts): es el alta, no
// contenido. Antes heredaba el título y la descripción comerciales del layout
// raíz y robots.txt la bloqueaba, así que Google no podía leer ningún `noindex`.
export const metadata: Metadata = {
  title: 'Crea tu estudio | Tentare',
  robots: { index: false, follow: true },
};

export default function CrearEstudioPage() {
  return <AltaEstudio foundingGratis={foundingGratisEnAltas()} />;
}
