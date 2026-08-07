"use client";

import { PhoneFrame, TabBar } from "@/components/portal-tema/components/layout/chrome";
import { Toast } from "@/components/portal-tema/components/ui/overlays";
import { PortalProvider } from "@/components/portal-tema/store/PortalStore";
import { useViewModel } from "@/components/portal-tema/store/useViewModel";

import { Welcome } from "@/components/portal-tema/screens/Welcome";
import { Login, Register } from "@/components/portal-tema/screens/Auth";
import { Home } from "@/components/portal-tema/screens/Home";
import { Schedule } from "@/components/portal-tema/screens/Schedule";
import { Calendar } from "@/components/portal-tema/screens/Calendar";
import { Bookings } from "@/components/portal-tema/screens/Bookings";
import { Passes } from "@/components/portal-tema/screens/Passes";
import { Checkout } from "@/components/portal-tema/screens/Checkout";
import { Profile } from "@/components/portal-tema/screens/Profile";
import { ClassDetail } from "@/components/portal-tema/screens/ClassDetail";
import { GuidedSession } from "@/components/portal-tema/screens/GuidedSession";

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
  detalle: ClassDetail,
  sesion: GuidedSession,
} as const;

function Portal() {
  const vm = useViewModel();
  const Screen = SCREENS[vm.screen] ?? Home;

  return (
    <>
      {/* La clave fuerza el remontaje: cada pantalla entra animada. */}
      <div className="screen is-enter" key={vm.screen} data-screen-label={vm.screen}>
        <Screen vm={vm} />
        {vm.showTabBar ? <TabBar tabs={vm.tabs} /> : null}
      </div>
      <Toast text={vm.toast} id={vm.toastId} />
    </>
  );
}

/**
 * El portal completo.
 *   <PortalApp />        marco de teléfono, para la demo y el editor de temas.
 *   <PortalApp bare />   sin marco, para montarlo en la ruta real del portal.
 */
export function PortalApp({ bare }: { bare?: boolean }) {
  return (
    <PortalProvider>
      {bare ? <Portal /> : <PhoneFrame><Portal /></PhoneFrame>}
    </PortalProvider>
  );
}
