import { AltaEstudio } from './alta-estudio';
import { foundingGratisEnAltas } from '@/lib/alta/founding-gratis-alta';

// La pantalla del alta es de cliente (alta-estudio.tsx). Esta página solo lee en
// el servidor si un estudio nuevo empieza gratis (FOUNDING_GRATIS encendido para
// todos; la variable no llega al navegador) y se lo pasa.
export default function CrearEstudioPage() {
  return <AltaEstudio foundingGratis={foundingGratisEnAltas()} />;
}
