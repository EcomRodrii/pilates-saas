import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { cargarEstudio } from '@/lib/student/estudio';
import { acentoCssText } from '@/lib/student/tema';
import { StudentProvider } from '@/components/student/contexto';
import { ToastProvider } from '@/components/student/ui/Toast';
import { RegistroSW } from '@/components/student/RegistroSW';
import { urlIconoEstudio } from '@/lib/monograma-estudio';
import './student.css';

// Raíz de la Student PWA. Server Component a propósito.
//
// Aquí se resuelve el estudio UNA vez por petición (`getStudioSeo` está
// cacheada con `React.cache`, así que `generateMetadata` y este layout
// comparten la misma consulta) y se inyecta el acento del estudio antes de que
// el navegador pinte nada.
//
// ⚠️ Lo que NO hace, y es la decisión de arquitectura de toda la app: no monta
// `StudioProvider` (lib/studio-context.tsx). El de `app/layout.tsx` sigue por
// encima —envuelve toda la aplicación— pero queda inerte en estas rutas: su
// guardia de ruta pública (`shadowedByPublicRoute`, studio-context.tsx:687)
// reconoce el prefijo `/portal/`, y sin sesión de personal su efecto de carga
// sale por el `return` temprano. La app de la alumna no lee su contexto.

export const viewport: Viewport = {
  // El crema del kit. El navegador tiñe con esto la barra de estado cuando la
  // app está instalada, así que tiene que ser el mismo `--background`.
  themeColor: '#FAF9F5',
  width: 'device-width',
  initialScale: 1,
  // `viewportFit: 'cover'` para que el nav inferior llegue al borde en móviles
  // con notch; el padding lo pone `--safe-bottom`. Sin `maximumScale`: limitar
  // el zoom rompe la accesibilidad y es la misma decisión que /reservar.
  viewportFit: 'cover',
};

/** La base de nuestro Supabase, única procedencia aceptada para un logo. */
function baseSupabase(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const estudio = await cargarEstudio(slug);
  // Si no se ha podido leer, un título neutro: decir «no encontrado» sería
  // afirmar algo que no sabemos, y este título acaba en la pestaña y en el
  // enlace que se comparte.
  if (estudio === 'no-disponible') return { title: 'Portal del estudio' };
  if (!estudio) return { title: 'Estudio no encontrado' };

  const base = `/portal/${encodeURIComponent(slug)}`;
  return {
    title: estudio.nombre,
    description: `Reserva tu clase en ${estudio.nombre}.`,
    // Manifest POR ESTUDIO: es lo que hace que instalarla dé la app del
    // estudio y no «Tentare». El de la plataforma (app/manifest.ts) sigue
    // sirviendo a la web pública.
    manifest: `${base}/manifest.webmanifest`,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: estudio.nombre },
    // ⚠️ Con el LOGO del estudio, no solo con su inicial.
    //
    // `urlIconoEstudio` existía desde hace tiempo —con su validación anti-SSRF
    // y sus tests—, y NADIE la llamaba: los cuatro sitios que pintan el icono
    // usaban `urlMonograma`, que solo sabe de nombre y color. Resultado: un
    // estudio que SÍ había subido su logo veía una inicial generada en la
    // pantalla de inicio del móvil de sus alumnas.
    //
    // Sin logo, o con uno que no podemos servir, sigue cayendo al monograma —
    // nunca al icono de Tentare, que es lo que este mecanismo vino a evitar.
    icons: {
      icon: urlIconoEstudio(estudio.nombre, estudio.colorPrimario, 192, estudio.logoUrl, baseSupabase()),
      apple: urlIconoEstudio(estudio.nombre, estudio.colorPrimario, 192, estudio.logoUrl, baseSupabase()),
    },
    // La app de la alumna vive detrás de sesión: no se indexa. `/portal` ya
    // está en PREFIJOS_NO_INDEXABLES (lib/seo/paginas.ts), esto es el cinturón.
    robots: { index: false, follow: false },
  };
}

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const estudio = await cargarEstudio(slug);
  // Un fallo al LEER no es un estudio inexistente. Se lanza para que lo recoja
  // el error boundary del segmento (error.tsx), que ofrece reintentar; con
  // `notFound()` la clienta veía «esta página no existe» por un parpadeo de la
  // base de datos, y ese 404 se comparte y se indexa.
  if (estudio === 'no-disponible') throw new Error('STUDENT_ESTUDIO_NO_DISPONIBLE');
  if (!estudio) notFound();

  return (
    <div className="student-app">
      {/* El acento del estudio, en servidor. Solo los 7 tokens que cambian por
          estudio; los otros 35 son estáticos y viven en student.css. */}
      <style dangerouslySetInnerHTML={{ __html: acentoCssText(estudio.colorPrimario) }} />
      <RegistroSW slug={estudio.slug} />
      {/* El toast vive aquí y no en cada pantalla: es un aviso global y así
          sobrevive a las navegaciones dentro del portal. */}
      <StudentProvider estudio={estudio}>
        <ToastProvider>{children}</ToastProvider>
      </StudentProvider>
    </div>
  );
}
