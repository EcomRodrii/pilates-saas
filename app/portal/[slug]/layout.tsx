import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cargarEstudio } from '@/lib/student/estudio';
import { getStudioSeo, slugActualDeDireccionAntigua } from '@/lib/studio-seo';
import { estiloPorId, temaAppCssText } from '@/lib/student/apariencia';
import { StudentProvider } from '@/components/student/contexto';
import { ToastProvider } from '@/components/student/ui/Toast';
import { RegistroSW } from '@/components/student/RegistroSW';
import { iconosDeEstudio } from '@/lib/monograma-estudio';
import { veredictoPagina, nombreCookieAcceso } from '@/lib/publico/acceso-pagina';
import { PaginaOculta } from '@/components/publico/pagina-oculta';
import './student.css';

// Raíz de la Student PWA. Server Component a propósito.
//
// Aquí se resuelve el estudio UNA vez por petición (`getStudioSeo` está
// cacheada con `React.cache`, así que `generateMetadata` y este layout
// comparten la misma consulta) y se inyecta el acento del estudio antes de que
// el navegador pinte nada.
//
// ⚠️ Lo que NO hace, y es la decisión de arquitectura de toda la app: no monta
// `StudioProvider` (lib/studio-context.tsx) ni `AuthProvider`. Y desde que la
// raíz los monta vía `components/raiz/proveedores-raiz.tsx`, tampoco llegan de
// arriba: en `/portal/**` no se renderizan ni se descarga su código (~65 KB gz).
// Un `useStudio()`/`useAuth()` aquí LANZA en ejecución; lo impide la regla de
// `eslint.config.mjs` y lo vigila `e2e/student-sin-codigo-del-panel.spec.ts`.

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const { slug } = await params;
  const estudio = await cargarEstudio(slug);
  return {
    // El fondo del estilo que eligió el estudio (el crema del kit si no eligió
    // ninguno). El navegador tiñe con esto la barra de estado cuando la app
    // está instalada, así que tiene que ser el mismo `--background`.
    themeColor: estudio && estudio !== 'no-disponible' ? estiloPorId(estudio.apariencia.estilo).background : '#FAF9F5',
    width: 'device-width',
    initialScale: 1,
    // `viewportFit: 'cover'` para que el nav inferior llegue al borde en móviles
    // con notch; el padding lo pone `--safe-bottom`. Sin `maximumScale`: limitar
    // el zoom rompe la accesibilidad y es la misma decisión que /reservar.
    viewportFit: 'cover',
  };
}

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
    // Su icono › su logo › su inicial; nunca el de Tentare. ⚠️ Antes esto no
    // leía el favicon que sube el estudio: pintaba el LOGO completo al 68 %
    // sobre el color de la app, y ese marco de color era el favicon verde que
    // se veía en la pestaña. Ver `iconosDeEstudio`.
    icons: iconosDeEstudio(
      estudio.nombre, estudio.colorPrimario,
      { iconoUrl: estudio.iconoMarcaUrl, logoUrl: estudio.logoUrl }, baseSupabase(),
    ),
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
  if (!estudio) {
    // La dirección de antes de rebautizarse lleva a la de ahora (ver /reservar).
    const actual = await slugActualDeDireccionAntigua(slug);
    if (actual) redirect(`/portal/${actual}`);
    notFound();
  }

  // M-2 (auditoría 58ª pasada): el gate de "página oculta" ya lo respeta
  // `/reservar` (app/reservar/[slug]/layout.tsx) pero aquí nunca se leía —
  // `estudio.paginaOculta` viaja desde `cargarEstudio` sin que nadie lo
  // comprobara. Mismo criterio exacto. Las rutas de la alumna que reservan o
  // compran siguen esta misma regla en servidor (lib/publico/pagina-cerrada-peticion.ts):
  // si esta pantalla la deja fuera, ellas también.
  if (estudio.paginaOculta) {
    const galleta = await cookies();
    // La huella se lee aquí, en servidor, y no viaja en `estudio`: ese objeto
    // acaba en `StudentProvider` (cliente). `getStudioSeo` está cacheada por
    // petición, así que es la misma consulta que ya hizo `cargarEstudio`.
    const huella = (await getStudioSeo(slug))?.paginaHuellaClave ?? null;
    const veredicto = veredictoPagina({
      oculta: true,
      huellaClave: huella,
      pase: galleta.get(nombreCookieAcceso(estudio.id))?.value,
      studioId: estudio.id,
    });
    if (veredicto !== 'abierta') {
      return <PaginaOculta nombre={estudio.nombre} slug={slug} pideClave={veredicto === 'pide-clave'} />;
    }
  }

  return (
    <div className="student-app">
      {/* La apariencia del estudio, en servidor (sin destello). Solo lo que
          cambia respecto al kit: sin nada elegido, los 7 tokens de acento de
          siempre; el resto vive en student.css. */}
      <style dangerouslySetInnerHTML={{ __html: temaAppCssText(estudio.colorPrimario, estudio.apariencia) }} />
      <RegistroSW slug={estudio.slug} studioId={estudio.id} />
      {/* El toast vive aquí y no en cada pantalla: es un aviso global y así
          sobrevive a las navegaciones dentro del portal. */}
      <StudentProvider estudio={estudio}>
        <ToastProvider>{children}</ToastProvider>
      </StudentProvider>
    </div>
  );
}
