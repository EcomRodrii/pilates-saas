'use client';

// «Mi centro» — la tercera pestaña de la barra de Tentada.
//
// ⚠️ Esta página es un CASCARÓN a propósito. Quien la pinta de verdad es
// `PortalTemaMarco` desde `PortalShell`, igual que /home, /clases, /reservas y
// /bonos: el marco decide la pantalla por la ruta (`pantallaDeRuta`) y monta el
// kit con el tema del estudio. Lo que hay aquí es lo que se ve si alguien llega
// con el kit apagado (`studios.portal_react = false`) o con un tema que no es
// del kit — y entonces esta pestaña no existe en su barra, así que solo se
// alcanza escribiendo la URL a mano.
//
// Se sirve un redirect al Inicio en vez de una pantalla vacía: es exactamente
// lo que hace `/videos` con VOD congelado, y por el mismo motivo — una ruta que
// no puede enseñar nada tiene que devolver a algún sitio, no dejar a la socia
// mirando el fondo.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { esTemaPortal } from '@/themes/registro';

export default function CentroPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { portalReact, themeIdPublicado, dataLoaded } = useStudio();

  // La misma condición que usa `PortalShell` para decidir si monta el kit. Si
  // se cumple, este componente no llega a verse: el shell pinta el marco.
  const loCubreElKit = portalReact && esTemaPortal(themeIdPublicado);

  useEffect(() => {
    // `dataLoaded` primero: sin él, `portalReact` es `false` durante la carga y
    // esto redirigiría al Inicio a una socia cuyo estudio SÍ tiene el kit.
    if (dataLoaded && !loCubreElKit) router.replace(`/portal/${slug}/home`);
  }, [dataLoaded, loCubreElKit, router, slug]);

  return null;
}
