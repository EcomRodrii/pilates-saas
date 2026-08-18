'use client';

import { useRouter } from 'next/navigation';
import { PortalTemaMarco } from './portal-tema-marco';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { esTemaPortal } from '@/themes/registro';

/**
 * La raíz del portal: la bienvenida del tema.
 *
 * ⚠️ El kit trae su pantalla de bienvenida desde el principio y el portal real
 * NO la montaba nunca: `/portal/<slug>` redirigía en el servidor a `/acceso`,
 * así que la primera impresión que diseñó el tema no la veía nadie.
 *
 * Se sigue acabando en `/acceso` —el botón lleva ahí—, que es lo que hace que
 * un enlace pelado compartido por WhatsApp funcione igual para quien tiene
 * contraseña y para quien no. Lo que cambia es que ahora hay algo antes.
 *
 * Sin tema del kit no se inventa nada: se va directo a `/acceso`, como siempre.
 */
export function PortalRaiz({ slug }: { slug: string }) {
  const router = useRouter();
  const { themeIdPublicado, portalReact, dataLoaded } = useStudio();
  const { session, isLoading } = usePortalAuth();
  const acceso = `/portal/${slug}/acceso`;

  // ⚠️ Nada hasta saber si hay sesión. `PortalShell` ya manda a /home a quien
  // la tiene, pero la resuelve de forma asíncrona: sin esta guarda, quien entra
  // todos los días veía la bienvenida ASOMARSE antes del salto. Añadirle un
  // parpadeo a quien ya está dentro sería empeorarle la app para enseñarle una
  // pantalla que no es para él.
  if (isLoading || session) return null;

  // Mientras no se sabe qué tema hay, tampoco: enseñar la bienvenida de un tema
  // y cambiarla al llegar el bueno es peor que esperar un instante.
  if (!dataLoaded) return null;

  if (!portalReact || !esTemaPortal(themeIdPublicado)) {
    router.replace(acceso);
    return null;
  }

  return <PortalTemaMarco alEntrar={() => router.push(acceso)} />;
}
