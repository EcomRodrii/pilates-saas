'use client';

// El portal en React (el kit de diseño) montado DENTRO de las rutas de Next.
//
// Aquí se junta todo lo de las últimas tandas: el tema por contexto, el
// adaptador de datos y la costura de navegación. Manda `PortalShell` con sus
// rutas — pulsar una pestaña hace `router.push`, no `set({ screen })` — pero
// la barra que se ve es la del kit, que es parte del diseño (la píldora que
// flota de Bloom, la barra oscura con el dorado de Noir).
//
// El resto del portal (`/progreso`, `/compras`, `/preferencias`,
// `/notificaciones`, `/invitar`, `/videos`) se queda con el portal de siempre
// — decisión del fundador, el portal se ve mezclado un tiempo. Son destinos
// navegables igualmente: el kit tiene que poder llevar ahí desde sus filas y
// sus bloques, aunque no los pinte él.
//
// ⚠️ `/perfil` estuvo FUERA por una razón que ya no aplica, y conviene dejar
// escrito por qué vuelve. Se sacó porque la `Profile` del kit era una maqueta:
// historial inventado, interruptores que solo escribían en el navegador, sin
// correo ni datos de la socia. La forma de Tentada (`profile_style: "header"`)
// sí lee datos reales, guarda por `updateSocio` esperando la respuesta del
// servidor, y CONSERVA lo que el prototipo no dibuja pero la socia ya tenía:
// «Aspecto» día/noche y el estado SEPA de Métodos de pago.
//
// Lo que sigue fuera, y no por descuido: `/preferencias` y `/progreso`. Las
// dos tienen MÁS de lo que dibuja el prototipo —control por canal y activación
// de push la primera; recompensas, canjes e historial de créditos la segunda—
// y el kit todavía no las cubre. Montar ahí el diseño le quitaría eso a la
// socia, que es exactamente lo que este comentario lleva evitando.
//
// ⚠️ TEMPORAL, con fecha de caducidad: vive detrás de `studios.portal_react`
// y desaparece —con el portal viejo— cuando termine el despliegue por fases.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { TabBar } from '@/components/portal-tema/components/layout/chrome';
import { Hojas } from '@/components/portal-tema/components/ui/hojas';
import { useDatosPortal } from './usar-datos-portal';
import { PortalProvider, usePortal, type AlCancelarPortal, type AlPagarPortal, type AlReservarPortal, type CompraPortalVuelta, type DestinoPortal, type ScreenId } from '@/components/portal-tema/store/PortalStore';
import { TemaProvider } from '@/components/portal-tema/store/TemaContext';
import { useViewModel } from '@/components/portal-tema/store/useViewModel';
import { Home } from '@/components/portal-tema/screens/Home';
import { Schedule } from '@/components/portal-tema/screens/Schedule';
import { Bookings } from '@/components/portal-tema/screens/Bookings';
import { Passes } from '@/components/portal-tema/screens/Passes';
import { ClassDetail } from '@/components/portal-tema/screens/ClassDetail';
import { Centro } from '@/components/portal-tema/screens/Centro';
import { Profile } from '@/components/portal-tema/screens/Profile';
import { Confirmed } from '@/components/portal-tema/screens/Confirmed';
import { Buy } from '@/components/portal-tema/screens/Buy';
import { Teachers } from '@/components/portal-tema/screens/Teachers';
import { Info } from '@/components/portal-tema/screens/Info';
import { MyData } from '@/components/portal-tema/screens/MyData';
import { BonoActivado } from '@/components/portal-tema/screens/BonoActivado';
import { Avisos } from '@/components/portal-tema/screens/Avisos';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { useModo } from '@/lib/portal-modo';
import { crearCheckoutPlan, fetchHistorialAsistidas, portalAuthHeader } from '@/lib/api-client';
import { fetchNotificaciones, accionNotificacion } from '@/lib/notifications/client';
import { selloTemporal } from '@/lib/avisos-portal';

/**
 * El rótulo de cada aviso, en palabras de la socia.
 *
 * `NotificationCategory` es vocabulario del motor (`reservas`, `sistema`,
 * `decisiones`…) y algunas de esas categorías no le dicen nada a quien lo lee.
 * Se traduce aquí, en el borde, y no en el motor: allí la categoría decide
 * canales y permisos, no cómo se titula en una pantalla.
 */
const CATEGORIA_AVISO: Record<string, string> = {
  reservas: 'Reserva',
  clases: 'Clase',
  sustituciones: 'Cambio de instructora',
  pagos: 'Pago',
  marketing: 'Del estudio',
  sistema: 'Aviso',
  // `decisiones` y `red` son de PANEL, no de socia (ver lib/notifications/
  // ambito.ts), así que no deberían llegar aquí; si llegaran, «Aviso» es
  // preferible a enseñarle la palabra interna.
};
import { diaDelMesHoy } from '@/lib/portal-tema/datos';
import { TEMAS_PORTAL, TEMA_PORTAL_POR_DEFECTO, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/** Última parte de la ruta → pantalla del kit. Lo que no esté aquí, no lo cubre. */
const RUTA_A_PANTALLA: Record<string, ScreenId> = {
  home: 'inicio',
  clases: 'clases',
  reservas: 'reservas',
  bonos: 'bonos',
  centro: 'centro',
  perfil: 'perfil',
  // La bandeja pasa a pintarla el kit, en la MISMA ruta de siempre: quien
  // tenga guardado `/notificaciones` sigue llegando a sus avisos.
  notificaciones: 'avisos',
};

const PANTALLA_A_RUTA: Partial<Record<ScreenId, string>> = {
  inicio: 'home', clases: 'clases', reservas: 'reservas', bonos: 'bonos', centro: 'centro',
  // Avisos y Progreso siguen siendo del portal de siempre: las dos tienen más
  // de lo que dibuja el prototipo (canales + push, recompensas + créditos).
  preferencias: 'preferencias', progreso: 'progreso',
  // Ruta propia: la bandeja se comparte por enlace desde los correos y los
  // push, y una pantalla sin URL rompería esos enlaces.
  avisos: 'notificaciones',
  // «Invitar a una amiga» es una fila del perfil en el prototipo y una HOJA
  // con un código inventado («LAURA-2026»). Aquí no: el portal ya tiene una
  // pantalla de invitación de verdad, con el enlace personal de la socia, las
  // amigas que ya se han unido y los créditos que da la regla de recompensas
  // del estudio. Un código que no canjea nada habría sido menos que eso.
  invitar: 'invitar',
  // Sigue siendo un destino navegable aunque el kit ya no la pinte: la píldora
  // "Perfil" de la barra tiene que llevar al perfil de verdad, no a ningún
  // sitio.
  perfil: 'perfil',
  // El kit tiene calendario propio; aquí la agenda es la de Clases.
  calendario: 'clases',
  // La sirve el portal de siempre, pero es una ruta de verdad: el bloque
  // «Pilates en casa» del Inicio tiene que llevar ahí.
  videos: 'videos',
  // ⚠️ Profesores YA NO va a la ruta vieja: el kit tiene su pantalla y
  // `queImparten` garantiza que la lista es la misma. Sin ruta aquí,
  // `navegar` devuelve false y el store la abre en sitio, como el detalle.
  // `/portal/<slug>/instructores` sigue existiendo para quien llegue por URL.
};

/**
 * Las que el kit pinta. `detalle` no tiene ruta propia y no está en
 * `RUTA_A_PANTALLA`: se abre desde dentro de Clases (o de Reservas, o del
 * Inicio) y es la ÚNICA pantalla desde la que se reserva.
 */
const PANTALLAS = {
  inicio: Home, clases: Schedule, reservas: Bookings, bonos: Passes, detalle: ClassDetail,
  centro: Centro,
  // Sin ruta propia, como el detalle: se llega reservando, y una URL de
  // «confirmada» compartida o recargada no tendría nada que confirmar.
  confirmada: Confirmed,
  comprar: Buy,
  // La vuelta de Stripe. No tiene ruta propia en `RUTA_A_PANTALLA` a propósito:
  // se llega a `/bonos?compra=…` y es la QUERY la que la elige, así que al
  // quitarla («Ver mis bonos») queda la pantalla de bonos de siempre.
  compra: BonoActivado,
  instructores: Teachers,
  info: Info,
  misdatos: MyData,
  perfil: Profile,
  avisos: Avisos,
} as const;

/** Las que sí manda la URL. */
const PANTALLAS_DE_RUTA = Object.values(RUTA_A_PANTALLA);

/**
 * Las que este kit pinta SIN ruta propia — el detalle de una clase y la
 * confirmación. Son las ÚNICAS que pueden quedarse por encima de la ruta.
 *
 * ⚠️ Se calcula restando, no a mano: una pantalla nueva sin ruta entra sola, y
 * —más importante— nada que no pinte este kit puede colarse. Cuando esto se
 * expresaba al revés (la lista de las que SÍ tienen ruta, y mandaba el store
 * para todo lo demás), el estado inicial `welcome` bloqueaba la ruta desde el
 * primer render y el portal se quedaba sin barra de pestañas y sin responder.
 */
const PANTALLAS_SIN_RUTA = (Object.keys(PANTALLAS) as ScreenId[])
  .filter((p) => !(PANTALLAS_DE_RUTA as string[]).includes(p));

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
  const { session, logout } = usePortalAuth();
  // El interruptor día/noche del portal de siempre. Se pasa al kit tal cual.
  const { noche, toggle } = useModo();
  const aspecto = useMemo(() => ({ noche, toggle }), [noche, toggle]);
  const {
    // Lo que hace falta para PINTAR lo arma `useDatosPortal`; aquí solo queda
    // lo que este marco usa por su cuenta: el tema, las escrituras y el
    // refresco.
    studio, themeIdPublicado,
    cancelarReserva, addReserva, updateSocio, recargarPublico,
  } = useStudio();

  const slug = studio?.slug ?? '';

  // La vuelta de Stripe tras comprar un bono (`lib/billing/origen-pago.ts`).
  // ⚠️ `compra=ok` es lo que dice STRIPE. Quien entrega el bono es el webhook,
  // así que la pantalla comprueba que esté antes de felicitar — de ahí que
  // viaje también el plan.
  const query = useSearchParams();
  const compraRaw = query?.get('compra');
  const compra = useMemo<CompraPortalVuelta | null>(
    () => (compraRaw === 'ok' || compraRaw === 'cancelada'
      ? { estado: compraRaw, planId: query?.get('plan') ?? null }
      : null),
    [compraRaw, query],
  );

  const pantalla = compra ? 'compra' : (pantallaDeRuta(pathname, slug) ?? 'inicio');

  // El webhook entrega el bono unos segundos DESPUÉS de que Stripe traiga aquí
  // al navegador. La carga del montaje ya se hace sola —esto es una navegación
  // completa, no un `push`—, así que lo único que falta es volver a preguntar
  // un par de veces: sin ello la pantalla se queda en «estamos confirmando»
  // hasta que la socia recargue a mano.
  //
  // ⚠️ `recargarPublico` NO puede ir en las dependencias: el contexto la crea
  // de nuevo en cada render (está documentado en `studio-context`), y el efecto
  // se dispararía en bucle. Va por `ref`, que siempre tiene la última.
  const recargarRef = useRef(recargarPublico);
  useEffect(() => { recargarRef.current = recargarPublico; });
  const compraOk = compra?.estado === 'ok';
  useEffect(() => {
    if (!compraOk) return;
    const relojes = [3000, 8000].map((ms) => setTimeout(() => recargarRef.current(), ms));
    return () => relojes.forEach(clearTimeout);
  }, [compraOk]);
  const tema = esTemaPortal(themeIdPublicado)
    ? TEMAS_PORTAL[themeIdPublicado]
    : TEMAS_PORTAL[TEMA_PORTAL_POR_DEFECTO];

  // El día de HOY en la zona del estudio. Sin esto sale el 4 de la demo, que
  // con datos reales es un día cualquiera del pasado.
  const hoy = useMemo(() => diaDelMesHoy(new Date()), []);

  const socioId = session?.socioId ?? null;
  // Los datos del kit los arma `useDatosPortal`, compartido con la
  // previsualización del editor: una sola forma de construirlos.
  const { datos, socia } = useDatosPortal(socioId);

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
  const alReservar: AlReservarPortal = useCallback(async (sesionId, spotId) => {
    if (!socioId) return { ok: false as const, error: 'Entra en tu cuenta para reservar.' };
    // ⚠️ `spotId` es la plaza que eligió en el detalle, y va tal cual: `null`
    // significa «que me la asignen», no «cualquiera». Es el mismo tercer
    // argumento que ya usa la hoja de reserva de siempre — la vía es una.
    const r = await addReserva(sesionId, socioId, spotId ?? null);
    if (!r.ok) return { ok: false as const, error: r.error };
    // El estado lo decide la base de datos bloqueando la fila de la sesión, no
    // lo que se viera al pulsar: con dos socias peleando por la última plaza,
    // la pantalla decía CONFIRMADA y la BD LISTA_ESPERA.
    return {
      ok: true as const,
      // El estado tal cual, para que la pantalla de confirmación no tenga que
      // deducirlo del texto. `ASISTIDA` no llega aquí: es un estado posterior.
      estado: (r.estado === 'LISTA_ESPERA' || r.estado === 'PENDIENTE_APROBACION'
        ? r.estado
        : 'CONFIRMADA') as 'CONFIRMADA' | 'LISTA_ESPERA' | 'PENDIENTE_APROBACION',
      // ⚠️ Si eligió sitio y el servidor no pudo dárselo, se DICE. Ese dato
      // llegaba al navegador y se tiraba: la socia leía «Reservada» y se
      // presentaba esperando el reformer 3 que era de otra. La reserva es
      // buena; lo que falló es la plaza, y son dos cosas distintas.
      mensaje: r.estado === 'LISTA_ESPERA'
        ? 'La clase estaba completa: te hemos puesto en la lista de espera.'
        : r.estado === 'PENDIENTE_APROBACION'
          ? 'Reserva enviada: queda pendiente de aprobación.'
          : spotId && !r.spotAsignado
            ? 'Reservada, pero el sitio que elegiste lo cogieron antes. Te lo asignamos al llegar.'
            : 'Reservada. Te esperamos.',
    };
  }, [addReserva, socioId]);

  // Guardar sus datos: la MISMA vía que el perfil de siempre (`updateSocio`),
  // esperando la respuesta del servidor antes de decir nada.
  const alGuardarDatos = useCallback(async (campos: {
    nombre: string; apellidos: string; email: string;
    telefono: string; fechaNacimiento: string; direccion: string;
  }): Promise<string | null> => {
    if (!socioId) return 'Entra en tu cuenta para guardar tus datos.';
    const r = await updateSocio(socioId, {
      nombre: campos.nombre.trim(),
      apellidos: campos.apellidos.trim(),
      email: campos.email.trim(),
      // Vacío se guarda como NULL, no como cadena vacía: es lo que distingue
      // «no lo ha puesto» de «lo ha borrado», y lo que ya hace el perfil viejo.
      telefono: campos.telefono.trim() || null,
      fechaNacimiento: campos.fechaNacimiento || null,
      direccion: campos.direccion.trim() || null,
    } as Parameters<typeof updateSocio>[1]);
    return r.ok ? null : r.error;
  }, [socioId, updateSocio]);

  // El historial de clases asistidas, para «Completadas». Va por un endpoint
  // propio y NO por el catálogo público: ese acota las sesiones a `fin >= ahora`
  // (para que el aforo no arrastre meses de historia en cada carga), y
  // ensancharlo habría penalizado a TODOS los portales, también los que no
  // enseñan historial. La identidad la deriva el servidor del JWT de la socia;
  // aquí no se manda ningún `socioId`.
  //
  // Sin estudio no se pide nada: devolver `[]` diría «no has asistido a
  // ninguna», y lo cierto es que no se sabe.
  const alPedirHistorial = useCallback(async () => {
    if (!studioId) return [];
    return fetchHistorialAsistidas(studioId);
  }, [studioId]);

  // La bandeja de avisos. MISMOS datos que ya servía `/notificaciones`
  // (`fetchNotificaciones`, tabla `notification`, acotada por el JWT de la
  // socia): cero backend nuevo, solo cambia quién lo pinta.
  const avisosRef = useRef<Map<string, string>>(new Map());
  const alPedirAvisos = useCallback(async () => {
    if (!studioId) return [];
    const { items } = await fetchNotificaciones(portalAuthHeader, { ambito: 'socia', studioId });
    // Al abrir la bandeja se marcan todas como leídas, igual que hacía la
    // pantalla de siempre — es lo que apaga el punto de la campana. El estado
    // local NO se toca: los puntos siguen mientras la pantalla está abierta,
    // que es justo lo que se ha venido a mirar.
    if (items.some((i) => i.readAt == null)) {
      void accionNotificacion(portalAuthHeader, { ambito: 'socia', studioId }, 'read-all');
    }
    // El destino de cada aviso se guarda aquí: el kit solo maneja ids, y así
    // no tiene que conocer las rutas del portal.
    avisosRef.current = new Map(items.filter((n) => n.deepLink).map((n) => [n.id, n.deepLink as string]));
    return items.map((n) => ({
      id: n.id,
      tipo: CATEGORIA_AVISO[n.category] ?? 'Aviso',
      texto: [n.title, n.body].filter(Boolean).join(' · '),
      cuando: selloTemporal(n.createdAt),
      leido: n.readAt != null,
      // Solo hay botón si el aviso lleva a algún sitio de verdad.
      accion: n.deepLink ? 'Ver' : null,
    }));
  }, [studioId]);

  const alAbrirAviso = useCallback((id: string) => {
    const destino = avisosRef.current.get(id);
    if (destino) router.push(destino);
  }, [router]);

  const alSalir = useCallback(() => {
    logout();
    router.replace(`/portal/${slug}/login`);
  }, [logout, router, slug]);

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
        alGuardarDatos={alGuardarDatos}
        alPedirHistorial={alPedirHistorial}
        alPedirAvisos={alPedirAvisos}
        alAbrirAviso={alAbrirAviso}
        alSalir={alSalir}
        // El día/noche del portal de siempre (`lib/portal-modo`), tal cual: el
        // kit no lo conoce, solo lo pinta. Sin esto la fila «Aspecto» no se
        // pinta, que es lo correcto en la previsualización.
        aspecto={aspecto}
        compra={compra}
        pantallasSinRuta={PANTALLAS_SIN_RUTA}
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
      {/* Al final del árbol: las hojas tapan también la barra. */}
      <Hojas vm={vm} />
    </div>
  );
}
