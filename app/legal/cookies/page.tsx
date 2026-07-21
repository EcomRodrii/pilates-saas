import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Política de cookies | Tentare' };

export default function Page() {
  return (
    <LegalPage titulo="Política de cookies" actualizado="julio de 2026">
      <H2>1. Qué son</H2>
      <p>Las cookies son pequeños archivos que se almacenan en tu navegador al visitar un sitio web o usar una aplicación.</p>
      <H2>2. Cookies que usamos</H2>
      <p>
        Cookies técnicas necesarias para el funcionamiento (mantener tu sesión iniciada, recordar preferencias del portal) y, si el estudio
        activa herramientas de analítica, cookies de medición de uso. No usamos cookies de publicidad de terceros.
      </p>
      <H2>3. Cómo gestionarlas</H2>
      <p>
        Puedes eliminar o bloquear las cookies desde la configuración de tu navegador. Bloquear las cookies técnicas puede impedir que
        determinadas funciones (como mantener la sesión iniciada) funcionen correctamente.
      </p>
    </LegalPage>
  );
}
