'use client';

// El portal en React (el kit de diseño) montado DENTRO de las rutas de Next.
//
// Aquí se junta todo lo de las últimas tandas: el tema por contexto, el
// adaptador de datos y la costura de navegación. Manda `PortalShell` con sus
// rutas — pulsar una pestaña hace `router.push`, no `set({ screen })` — pero
// la barra que se ve es la del kit, que es parte del diseño (la píldora que
// flota de Bloom, la barra oscura con el dorado de Noir).
//
// El kit cubre CUATRO rutas. El resto del portal (`/perfil`, `/progreso`,
// `/compras`, `/preferencias`, `/notificaciones`, `/invitar`, `/instructores`,
// `/videos`) se queda con el portal de siempre — decisión del fundador, el
// portal se ve mezclado un tiempo.
//
// ⚠️ `/perfil` estuvo aquí y se ha SACADO. La pantalla `Profile` del kit es
// todavía una maqueta: su tabla de "Historial" son tres filas inventadas a
// mano (una de ellas "No asistida"), sus interruptores de avisos solo escriben
// en el estado local del navegador, y no tiene foto, correo, usuario ni
// contraseña. Mientras cubriera la ruta, montarla dejaba a la socia sin la
// mitad de su perfil Y enseñándole un historial falso. Un diseño nuevo no
// puede costar funcionalidad: hasta que `Profile` lea datos de verdad, esta
// ruta la sirve el portal completo de siempre.
//
// ⚠️ TEMPORAL, con fecha de caducidad: vive detrás de `studios.portal_react`
// y desaparece —con el portal viejo— cuando termine el despliegue por fases.

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { TabBar } from '@/components/portal-tema/components/layout/chrome';
import { PortalProvider, usePortal, type AlCancelarPortal, type AlPagarPortal, type AlReservarPortal, type DestinoPortal, type ScreenId } from '@/components/portal-tema/store/PortalStore';
import { TemaProvider } from '@/components/portal-tema/store/TemaContext';
import { useViewModel } from '@/components/portal-tema/store/useViewModel';
import { Home } from '@/components/portal-tema/screens/Home';
import { Schedule } from '@/components/portal-tema/screens/Schedule';
import { Bookings } from '@/components/portal-tema/screens/Bookings';
import { Passes } from '@/components/portal-tema/screens/Passes';
import { ClassDetail } from '@/components/portal-tema/screens/ClassDetail';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { crearCheckoutPlan } from '@/lib/api-client';
import { construirDatosPortal, diaDelMesHoy } from '@/lib/portal-tema/datos';
import { TEMAS_PORTAL, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/** Última parte de la ruta → pantalla del kit. Lo que no esté aquí, no lo cubre. */
const RUTA_A_PANTALLA: Record<string, ScreenId> = {
  home: 'inicio',
  clases: 'clases',
  reservas: 'reservas',
  bonos: 'bonos',
};

const PANTALLA_A_RUTA: Partial<Record<ScreenId, string>> = {
  inicio: 'home', clases: 'clases', reservas: 'reservas', bonos: 'bonos',
  // Sigue siendo un destino navegable aunque el kit ya no la pinte: la píldora
  // "Perfil" de la barra tiene que llevar al perfil de verdad, no a ningún
  // sitio.
  perfil: 'perfil',
  // El kit tiene calendario propio; aquí la agenda es la de Clases.
  calendario: 'clases',
};

/**
 * Las que el kit pinta. `detalle` no tiene ruta propia y no está en
 * `RUTA_A_PANTALLA`: se abre desde dentro de Clases (o de Reservas, o del
 * Inicio) y es la ÚNICA pantalla desde la que se reserva.
 */
const PANTALLAS = {
  inicio: Home, clases: Schedule, reservas: Bookings, bonos: Passes, detalle: ClassDetail,
} as const;

/** Las que sí manda la URL. Ver `pantallasDeRuta` en el store. */
const PANTALLAS_DE_RUTA = Object.values(RUTA_A_PANTALLA);

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
    planesTarifa, suscripciones, socios, themeIdPublicado, cancelarReserva, addReserva,
  } = useStudio();

  const slug = studio?.slug ?? '';
  const pantalla = pantallaDeRuta(pathname, slug) ?? 'inicio';
  const tema = esTemaPortal(themeIdPublicado) ? TEMAS_PORTAL[themeIdPublicado] : TEMAS_PORTAL.oliva;

  // El día de HOY en la zona del estudio. Sin esto sale el 4 de la demo, que
  // con datos reales es un día cualquiera del pasado.
  const hoy = useMemo(() => diaDelMesHoy(new Date()), []);

  const socioId = session?.socioId ?? null;
  // Antes de `datos`: ese `useMemo` la lee al construirse, y declararla
  // después la dejaba en zona muerta (ReferenceError en el primer render).
  const socia = useMemo(() => socios.find((s) => s.id === socioId) ?? null, [socios, socioId]);
  const datos = useMemo(() => construirDatosPortal({
    ahora: new Date(),
    sesiones, reservas, tiposClase, salas, instructores,
    planes: planesTarifa,
    socio: socia,
    // Las SUYAS, con su id de reserva. Sin esto la pantalla de Reservas usaba
    // la lista de demostración del kit —que arranca vacía— y la socia no veía
    // ni una de sus reservas reales.
    reservasPropias: socioId ? reservas.filter((r) => r.socioId === socioId) : undefined,
    // Solo las SUYAS: el adaptador elige el bono al que le quedan menos
    // sesiones, y con las de todo el estudio elegiría el de otra persona.
    suscripciones: suscripciones.filter((s) => s.socioId === socioId),
  }), [sesiones, reservas, tiposClase, salas, instructores, planesTarifa, suscripciones, socia, socioId]);

  const navegar = useMemo(() => (destino: DestinoPortal): boolean => {
    const ruta = PANTALLA_A_RUTA[destino.screen];
    // `false` = "esta no la tengo como ruta"; la abre el store dentro de la
    // ruta actual. Es el caso del detalle de una clase, que vive dentro de
    // Clases igual que la hoja de reserva del portal de siempre.
    if (!ruta) return false;
    const destinoUrl = `/portal/${slug}/${ruta}`;
    // Ya estamos aquí: navegar apilaría una entrada de historial idéntica y
    // el botón atrás dejaría de funcionar como espera la socia. Lo que sí
    // cambia (el día, la pestaña) ya lo ha aplicado el store antes de
    // llamarnos — ver `ir()` en `PortalStore`.
    if (pathname !== destinoUrl) router.push(destinoUrl);
    return true;
  }, [router, slug, pathname]);

  // El cobro de verdad: Checkout alojado de Stripe, el mismo camino que
  // `/compras` (`crearCheckoutPlan`). La maqueta de tarjeta del kit no se monta
  // nunca aquí — pedía número y CVC en nuestro propio DOM sin cobrar nada.
  const studioId = studio?.id ?? null;
  const alPagar: AlPagarPortal = useCallback(async (planId) => {
    if (!studioId) return 'No hemos podido identificar el estudio.';
    const r = await crearCheckoutPlan({
      studioId,
      planId,
      socioId,
      socioEmail: socia?.email ?? null,
      socioNombre: socia?.nombre ?? 'Socia',
      origen: 'portal',
    });
    if ('url' in r) {
      window.location.assign(r.url);
      return null;
    }
    return r.error;
  }, [studioId, socioId, socia?.email, socia?.nombre]);

  // Reservar de verdad: `addReserva` del contexto, la MISMA vía que el portal
  // de siempre — que espera la respuesta del servidor entera antes de decir
  // nada, porque este endpoint rechaza legítimamente en seis sitios (sin bono,
  // bono que no cubre el tipo, clase empezada, cancelada, tope de simultáneas,
  // límite semanal) y durante un tiempo ninguno de esos rechazos llegó a la
  // pantalla: la socia leía "Reservada" y en el panel no había nada (#500).
  const alReservar: AlReservarPortal = useCallback(async (sesionId) => {
    if (!socioId) return { ok: false as const, error: 'Entra en tu cuenta para reservar.' };
    const r = await addReserva(sesionId, socioId, null);
    if (!r.ok) return { ok: false as const, error: r.error };
    // El estado lo decide la base de datos bloqueando la fila de la sesión, no
    // lo que se viera al pulsar: con dos socias peleando por la última plaza,
    // la pantalla decía CONFIRMADA y la BD LISTA_ESPERA.
    return {
      ok: true as const,
      mensaje: r.estado === 'LISTA_ESPERA'
        ? 'La clase estaba completa: te hemos puesto en la lista de espera.'
        : r.estado === 'PENDIENTE_APROBACION'
          ? 'Reserva enviada: queda pendiente de aprobación.'
          : 'Reservada. Te esperamos.',
    };
  }, [addReserva, socioId]);

  const alCancelar: AlCancelarPortal = useCallback(async (reservaId) => {
    // `cancelarReserva` del contexto: la MISMA vía que el portal de siempre
    // (RPC transaccional, promociona la lista de espera, devuelve bono según
    // la política del estudio). Nada de un `fetch` nuevo aquí.
    const res = await cancelarReserva(reservaId);
    return res.ok ? null : res.error;
  }, [cancelarReserva]);

  // `portal-tema` acota TODO el CSS del kit a este subárbol. Sin ella no se
  // pinta nada del kit — y con ella, nada del kit se escapa al resto del
  // portal (ver la cabecera de `01-base.css`).
  return (
    <div className="portal-tema" style={{ display: 'contents' }}>
    <TemaProvider tema={tema}>
      <PortalProvider
        datos={datos}
        navegar={navegar}
        alPagar={alPagar}
        alCancelar={alCancelar}
        alReservar={alReservar}
        pantallasDeRuta={PANTALLAS_DE_RUTA}
        pantalla={pantalla}
        // El día de HOY en la semana del estudio, no el 4 de la demo.
        diaPorDefecto={hoy}
        // Nada de barra de estado falsa ni isla dinámica: esto es un móvil de
        // verdad y ya tiene las suyas.
        cromoDemo={false}
        // Nada de piezas de maqueta: aquí paga una socia de verdad.
        esDemo={false}
      >
        <Pantalla />
      </PortalProvider>
    </TemaProvider>
    </div>
  );
}

/**
 * Aparte y no en línea porque `usePortal`/`useViewModel` solo pueden llamarse
 * DENTRO del provider, y este es el primer componente que lo está.
 *
 * ⚠️ La pantalla la dice el STORE, no la ruta. Casi siempre son la misma cosa
 * (el store la copia de `pantalla`), pero el detalle de una clase no tiene
 * ruta: si esto leyera la ruta, abrir una clase no pintaría nada.
 */
function Pantalla() {
  const { screen } = usePortal();
  const vm = useViewModel();
  const Screen = PANTALLAS[screen as keyof typeof PANTALLAS] ?? PANTALLAS.inicio;
  return (
    <div className="screen">
      <Screen vm={vm} />
      {vm.showTabBar ? <TabBar tabs={vm.tabs} floating={vm.tabBarFloating} /> : null}
    </div>
  );
}
