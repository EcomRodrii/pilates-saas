'use client';

// El portal en React (el kit de diseño) montado DENTRO de las rutas de Next.
//
// Aquí se junta todo lo de las últimas tandas: el tema por contexto, el
// adaptador de datos y la costura de navegación. Manda `PortalShell` con sus
// rutas — pulsar una pestaña hace `router.push`, no `set({ screen })` — pero
// la barra que se ve es la del kit, que es parte del diseño (la píldora que
// flota de Bloom, la barra oscura con el dorado de Noir).
//
// El kit cubre CINCO rutas. Las otras siete del portal (`/progreso`,
// `/compras`, `/preferencias`, `/notificaciones`, `/invitar`, `/instructores`,
// `/videos`) no tienen pantalla equivalente y se quedan con el portal de
// siempre — decisión del fundador, el portal se ve mezclado un tiempo.
//
// ⚠️ TEMPORAL, con fecha de caducidad: vive detrás de `studios.portal_react`
// y desaparece —con el portal viejo— cuando termine el despliegue por fases.

import { useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { TabBar } from '@/components/portal-tema/components/layout/chrome';
import { PortalProvider, type DestinoPortal, type ScreenId } from '@/components/portal-tema/store/PortalStore';
import { TemaProvider } from '@/components/portal-tema/store/TemaContext';
import { useViewModel } from '@/components/portal-tema/store/useViewModel';
import { Home } from '@/components/portal-tema/screens/Home';
import { Schedule } from '@/components/portal-tema/screens/Schedule';
import { Bookings } from '@/components/portal-tema/screens/Bookings';
import { Passes } from '@/components/portal-tema/screens/Passes';
import { Profile } from '@/components/portal-tema/screens/Profile';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { construirDatosPortal, diaDelMesHoy } from '@/lib/portal-tema/datos';
import { TEMAS_PORTAL, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/** Última parte de la ruta → pantalla del kit. Lo que no esté aquí, no lo cubre. */
const RUTA_A_PANTALLA: Record<string, ScreenId> = {
  home: 'inicio',
  clases: 'clases',
  reservas: 'reservas',
  bonos: 'bonos',
  perfil: 'perfil',
};

const PANTALLA_A_RUTA: Partial<Record<ScreenId, string>> = {
  inicio: 'home', clases: 'clases', reservas: 'reservas', bonos: 'bonos', perfil: 'perfil',
  // El kit tiene calendario propio; aquí la agenda es la de Clases.
  calendario: 'clases',
};

const PANTALLAS = {
  inicio: Home, clases: Schedule, reservas: Bookings, bonos: Passes, perfil: Profile,
} as const;

/**
 * `null` = esta ruta NO la cubre el kit y tiene que seguir con el portal
 * viejo. Se exporta porque quien decide es `PortalShell`, antes de montar
 * nada: si se decidiera aquí dentro habría que montar el marco entero para
 * descubrir que no pinta nada.
 */
export function pantallaDeRuta(pathname: string, slug: string): keyof typeof PANTALLAS | null {
  const resto = pathname.replace(`/portal/${slug}/`, '').split('/')[0];
  const pantalla = RUTA_A_PANTALLA[resto];
  return pantalla && pantalla in PANTALLAS ? (pantalla as keyof typeof PANTALLAS) : null;
}

export function PortalTemaMarco() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { session } = usePortalAuth();
  const {
    studio, sesiones, reservas, tiposClase, salas, instructores,
    planesTarifa, suscripciones, socios, themeIdPublicado,
  } = useStudio();

  const slug = studio?.slug ?? '';
  const pantalla = pantallaDeRuta(pathname, slug) ?? 'inicio';
  const tema = esTemaPortal(themeIdPublicado) ? TEMAS_PORTAL[themeIdPublicado] : TEMAS_PORTAL.oliva;

  // El día de HOY en la zona del estudio. Sin esto sale el 4 de la demo, que
  // con datos reales es un día cualquiera del pasado.
  const hoy = useMemo(() => diaDelMesHoy(new Date()), []);

  const socioId = session?.socioId ?? null;
  const datos = useMemo(() => construirDatosPortal({
    ahora: new Date(),
    sesiones, reservas, tiposClase, salas, instructores,
    planes: planesTarifa,
    socio: socios.find((s) => s.id === socioId) ?? null,
    // Solo las SUYAS: el adaptador elige el bono al que le quedan menos
    // sesiones, y con las de todo el estudio elegiría el de otra persona.
    suscripciones: suscripciones.filter((s) => s.socioId === socioId),
  }), [sesiones, reservas, tiposClase, salas, instructores, planesTarifa, suscripciones, socios, socioId]);

  const navegar = useMemo(() => (destino: DestinoPortal) => {
    const ruta = PANTALLA_A_RUTA[destino.screen];
    // Destino que el kit todavía no tiene como ruta (detalle de clase,
    // checkout, sesión guiada): no se navega, en vez de caer al Inicio — que
    // sería peor, porque la socia creería que ha pasado algo. Se irán
    // conectando pantalla a pantalla.
    if (!ruta) return;
    router.push(`/portal/${slug}/${ruta}`);
  }, [router, slug]);

  return (
    <TemaProvider tema={tema}>
      <PortalProvider
        datos={datos}
        navegar={navegar}
        pantalla={pantalla}
        // El día de HOY en la semana del estudio, no el 4 de la demo.
        diaPorDefecto={hoy}
        // Nada de barra de estado falsa ni isla dinámica: esto es un móvil de
        // verdad y ya tiene las suyas.
        cromoDemo={false}
      >
        <Pantalla nombre={pantalla} />
      </PortalProvider>
    </TemaProvider>
  );
}

/**
 * Aparte y no en línea porque `useViewModel` solo puede llamarse DENTRO del
 * provider, y este es el primer componente que lo está.
 */
function Pantalla({ nombre }: { nombre: keyof typeof PANTALLAS }) {
  const vm = useViewModel();
  const Screen = PANTALLAS[nombre];
  return (
    <div className="screen">
      <Screen vm={vm} />
      {vm.showTabBar ? <TabBar tabs={vm.tabs} floating={vm.tabBarFloating} /> : null}
    </div>
  );
}
