"use client";

import { PhoneFrame, TabBar } from "@/components/portal-tema/components/layout/chrome";
import { Toast } from "@/components/portal-tema/components/ui/overlays";
import { Hojas } from "@/components/portal-tema/components/ui/hojas";
import { AVISOS_DE_MUESTRA, HISTORIAL_DE_MUESTRA } from "@/components/portal-tema/data/studio";
import { PortalProvider, useCompra, type CompraPortalVuelta, type ScreenId } from "@/components/portal-tema/store/PortalStore";
import { TemaProvider } from "@/components/portal-tema/store/TemaContext";
import { useViewModel } from "@/components/portal-tema/store/useViewModel";
import type { ThemeConfig } from "@/components/portal-tema/tipos-tema";
import type { DatosPortal } from "@/lib/portal-tema/tipos";

import { Welcome } from "@/components/portal-tema/screens/Welcome";
import { Login, Register } from "@/components/portal-tema/screens/Auth";
import { Home } from "@/components/portal-tema/screens/Home";
import { Schedule } from "@/components/portal-tema/screens/Schedule";
import { Calendar } from "@/components/portal-tema/screens/Calendar";
import { Bookings } from "@/components/portal-tema/screens/Bookings";
import { Passes } from "@/components/portal-tema/screens/Passes";
import { Checkout } from "@/components/portal-tema/screens/Checkout";
import { Profile } from "@/components/portal-tema/screens/Profile";
import { Centro } from "@/components/portal-tema/screens/Centro";
import { Confirmed } from "@/components/portal-tema/screens/Confirmed";
import { Buy } from "@/components/portal-tema/screens/Buy";
import { Teachers } from "@/components/portal-tema/screens/Teachers";
import { Info } from "@/components/portal-tema/screens/Info";
import { MyData } from "@/components/portal-tema/screens/MyData";
import { ClassDetail } from "@/components/portal-tema/screens/ClassDetail";
import { GuidedSession } from "@/components/portal-tema/screens/GuidedSession";
import { BonoActivado } from "@/components/portal-tema/screens/BonoActivado";
import { Favoritas } from "@/components/portal-tema/screens/Favoritas";
import { Avisos } from "@/components/portal-tema/screens/Avisos";
import { Historial } from "@/components/portal-tema/screens/Historial";

const SCREENS = {
  welcome: Welcome,
  login: Login,
  registro: Register,
  inicio: Home,
  clases: Schedule,
  calendario: Calendar,
  reservas: Bookings,
  bonos: Passes,
  checkout: Checkout,
  perfil: Profile,
  centro: Centro,
  confirmada: Confirmed,
  comprar: Buy,
  instructores: Teachers,
  info: Info,
  misdatos: MyData,
  detalle: ClassDetail,
  sesion: GuidedSession,
  compra: BonoActivado,
  avisos: Avisos,
  historial: Historial,
  favoritas: Favoritas,
} as const;

function Portal() {
  const vm = useViewModel();
  // La vuelta de Stripe manda sobre la pantalla guardada: se llega aquí por un
  // redirect, no navegando. En el portal de verdad esta misma regla la aplica
  // `portal-tema-marco`, que tiene la URL; aquí la aplica la previsualización,
  // que recibe el desenlace por prop.
  const compra = useCompra();
  // `vm.screen` incluye destinos que son RUTA del portal pero no pantalla del
  // kit (`videos`): ahí cae al Inicio en vez de dejar la maqueta en blanco.
  const Screen = compra ? BonoActivado : (SCREENS[vm.screen as keyof typeof SCREENS] ?? Home);

  return (
    <>
      {/* La clave fuerza el remontaje: cada pantalla entra animada. */}
      <div className="screen is-enter" key={vm.screen} data-screen-label={vm.screen}>
        <Screen vm={vm} />
        {vm.showTabBar ? <TabBar tabs={vm.tabs} floating={vm.tabBarFloating} /> : null}
        {/* Al final del árbol: las hojas tapan también la barra. */}
        <Hojas vm={vm} />
      </div>
      <Toast text={vm.toast} id={vm.toastId} />
    </>
  );
}

/**
 * El portal completo.
 *   <PortalApp tema={…} />        marco de teléfono, para la demo y el editor.
 *   <PortalApp tema={…} bare />   sin marco, para la ruta real del portal.
 *
 * El tema entra como dato, no se importa: quien monta el portal es quien sabe
 * qué estudio es. Se resuelve el id contra `themes/registro.ts` FUERA de aquí,
 * para que este código compartido no dependa de los temas concretos — es lo
 * que permite que sea una sola copia y no tres.
 */
export function PortalApp({
  tema, datos, bare, compra, pantalla,
}: {
  tema: ThemeConfig;
  datos?: DatosPortal;
  bare?: boolean;
  /** Con qué pantalla abrir. La usa la vista previa del editor, que enseña una
   *  concreta según la pestaña que la propietaria esté mirando. */
  pantalla?: ScreenId;
  /** La vuelta de Stripe. En la previsualización entra por la URL de la propia
   *  página, que es la única forma de poder MIRAR esa pantalla sin pagar. */
  compra?: CompraPortalVuelta | null;
}) {
  return (
    <TemaProvider tema={tema}>
      {/* Sin `datos` se usan los de muestra: es lo que ve la previsualización
          cuando no se le pasa ningún estudio. */}
      {/* La previsualización recibe un historial de MUESTRA, como el resto de
          sus datos. Sin él, «Completadas» no se pintaría nunca aquí (no hay
          sesión de socia de la que pedirlo) y no habría forma de revisar esa
          sección al mirar temas — que es justo para lo que existe esta
          pantalla. En el portal real lo inyecta `PortalTemaMarco` con el
          endpoint de verdad. */}
      <PortalProvider datos={datos} compra={compra} pantalla={pantalla}
        alPedirHistorial={async () => HISTORIAL_DE_MUESTRA}
        alPedirAvisos={async () => AVISOS_DE_MUESTRA}>
        {bare ? <Portal /> : <PhoneFrame><Portal /></PhoneFrame>}
      </PortalProvider>
    </TemaProvider>
  );
}
