'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { AvisoCambioDeSede } from '@/components/layout/sede-activa';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { usePermisos, nombreAppPorRol } from '@/lib/permisos';
import { PanelThemeProvider } from '@/lib/panel-theme';
import { PanelPrivacyProvider } from '@/lib/panel-privacy';
import { TourProvider } from '@/lib/tour-context';
import { Spotlight } from '@/components/tour/spotlight';
import { WhatsAppFab } from '@/components/layout/whatsapp-fab';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { PantallaBienvenida } from '@/components/onboarding/pantalla-bienvenida';
import { ReviewBoostModal } from '@/components/growth/review-boost-modal';
import { estadoBilling } from '@/lib/api-client';
import { navSections } from '@/lib/nav-config';

// Antes vivía todo esto directo en app/(dashboard)/layout.tsx, pero ese
// archivo necesita exportar `metadata` (manifest del panel instalable) y eso
// solo lo puede hacer un Server Component — 'use client' bloquea cualquier
// export de metadata. Se extrajo el cuerpo tal cual a este componente cliente;
// el layout ahora es un wrapper fino que solo pone la metadata y renderiza esto.
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  // useCore() y no useStudio(): esto es el marco de las 50 rutas del panel y
  // solo mira `studio`. Con useStudio() se re-renderizaba (y recreaba Sidebar,
  // Topbar y AvisoCambioDeSede) ante cualquier cambio del god-context.
  const { studio } = useCore();
  const { rol, puedeVer } = usePermisos();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  // El rol solo está resuelto cuando el ESTUDIO del usuario ya cargó (ver el
  // comentario largo más abajo, junto a `rolResuelto`). Se calcula aquí arriba
  // porque el título de pestaña lo necesita antes que el resto.
  const rolResuelto = studio !== null;

  // Título de la pestaña por sección. Por defecto heredaba el de la web comercial
  // (app/layout) en TODAS las pantallas del panel → con varias pestañas abiertas
  // ninguna se distinguía (P4). Lo derivamos del propio menú.
  //
  // Mientras el rol no está resuelto, `useRol()` cae al mínimo (INSTRUCTOR,
  // fail-closed de A-2) — con el rebranding por rol eso se veía como un
  // parpadeo real ("Tentare Core" un instante, luego "Tentare Manager" al
  // cargar el estudio de una propietaria). Con "Tentare" a secas mientras
  // carga no se afirma un rol que aún no se conoce.
  useEffect(() => {
    const item = navSections
      .flatMap(s => s.items)
      .filter(i => pathname === i.href || pathname.startsWith(i.href + '/'))
      .sort((a, b) => b.href.length - a.href.length)[0];
    const marca = rolResuelto ? nombreAppPorRol(rol) : 'Tentare';
    document.title = item ? `${marca} · ${item.label}` : marca;
  }, [pathname, rol, rolResuelto]);

  // Gate de suscripción. `estadoBilling` es fail-open: solo devuelve bloqueado=true
  // cuando BILLING_ENFORCED=true Y Stripe está configurado Y no hay suscripción
  // activa. Con la enforcement apagada (por defecto) nunca redirige.
  // `null` = todavía no resuelto: mientras tanto NO se pinta el dashboard real
  // (antes se veía un flash del contenido del panel antes del redirect a
  // /suscripcion en estudios bloqueados).
  const [billingBloqueado, setBillingBloqueado] = useState<boolean | null>(null);
  useEffect(() => {
    if (loading || !session) return;
    let vivo = true;
    estadoBilling().then((e) => {
      if (!vivo) return;
      setBillingBloqueado(!!e?.bloqueado);
      if (e?.bloqueado) router.replace('/suscripcion');
    });
    return () => { vivo = false; };
  }, [loading, session, router]);

  // `rolResuelto` (arriba, junto al título de pestaña): no vale `dataLoaded`,
  // porque el provider hace un primer fetch con la sesión aún sin resolver
  // (authUserId nulo) que deja `studio` a null pero `dataLoaded` a true;
  // decidir ahí vería el rol mínimo (fail-closed de A-2) y rebotaría a
  // /dashboard al REFRESCAR una página solo-PROPIETARIO. Con `studio !== null`
  // esperamos a que useRol tenga el dato del dueño. El servidor ya protege cada
  // endpoint, así que renderizar el marco mientras carga no expone datos.
  const autorizado = puedeVer(pathname);
  // I3: mientras el estudio (y con él todos los slices de datos, que se setean a la
  // vez que `studio` al terminar fetchCriticalStudioData) aún no ha cargado,
  // mostramos un skeleton en lugar de las páginas —que si no pintarían estados
  // vacíos falsos ("Sin recibos", "No hay resultados") en cada carga en frío.
  // `studio !== null` es la señal fiable (no `dataLoaded`, que se pone true antes
  // con el fetch temprano de sesión sin resolver, como explica el bloque de rol).
  // I3 (desactualizado, ver docs/NETWORK-AUDIT-2.md §2): se asumía que
  // `/login` solo dejaba llegar aquí a cuentas con estudio — falso para una
  // cuenta de Tentare Network sin studio_id, que se quedaba en un skeleton
  // perpetuo (`studio` nunca deja de ser `null`). El origen ya se corrigió
  // (`/api/auth/destino-post-login`), pero esta pantalla necesita su PROPIA
  // red de seguridad: un enlace viejo, un bookmark o un `?destino=`
  // manipulado pueden seguir aterrizando aquí sin estudio.
  const cargandoDatos = !!session && (studio === null || billingBloqueado !== false);
  // `&& studio === null` en el uso de abajo, no un reset síncrono aquí: así
  // el flag se invalida solo en cuanto `studio` resuelve, sin un segundo
  // setState en el cuerpo del efecto (react-hooks/set-state-in-effect).
  const [estudioTardaDemasiado, setEstudioTardaDemasiado] = useState(false);
  useEffect(() => {
    if (!session || studio !== null) return;
    const t = setTimeout(() => setEstudioTardaDemasiado(true), 6000);
    return () => clearTimeout(t);
  }, [session, studio]);
  const estudioNuncaResuelve = estudioTardaDemasiado && studio === null;
  useEffect(() => {
    if (!loading && session && rolResuelto && !autorizado) router.replace('/dashboard');
  }, [loading, session, rolResuelto, autorizado, router]);

  // Antes era `return null`: pantalla en BLANCO mientras se resuelve la sesión.
  // Sumado a que el panel son ~2,3 MB de JS que hay que descargar y ejecutar
  // antes de llegar aquí, en carga fría eso son muchos segundos de nada — y una
  // pantalla vacía no se lee como "cargando", se lee como "se ha roto". El marco
  // + skeleton ya existen para el caso de datos; se reutilizan también aquí.
  if (loading) {
    return (
      <PanelPrivacyProvider>
        <PanelThemeProvider className="min-h-dvh bg-background">
          <main className="lg:pl-[var(--sidebar-w)] min-h-dvh">
            <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
              <PanelSkeleton />
            </div>
          </main>
        </PanelThemeProvider>
      </PanelPrivacyProvider>
    );
  }

  // Nunca un skeleton para siempre: si a los 6 s la cuenta sigue sin estudio,
  // no es una carga lenta — es una cuenta que no pertenece a este panel (p.
  // ej. una de Tentare Network sin studio_id). Salida explícita, no un
  // callejón sin salida.
  if (estudioNuncaResuelve) {
    return (
      <PanelPrivacyProvider>
        <PanelThemeProvider className="min-h-dvh bg-background">
          <main className="min-h-dvh flex items-center justify-center px-4">
            <div className="max-w-sm text-center space-y-3">
              <p className="text-[14px] text-foreground font-medium">Esta cuenta no tiene ningún estudio de Tentare.</p>
              <p className="text-[13px] text-muted-foreground">
                Si te has registrado para Tentare Network, tu perfil está en otro sitio.
              </p>
              <Link href="/network/mi-perfil" className="inline-block px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium">
                Ir a mi perfil de Network
              </Link>
            </div>
          </main>
        </PanelThemeProvider>
      </PanelPrivacyProvider>
    );
  }

  if (rolResuelto && !autorizado) {
    return (
      <PanelPrivacyProvider>
        <PanelThemeProvider className="min-h-dvh bg-background">
          <Sidebar />
          <main className="lg:pl-[var(--sidebar-w)] min-h-dvh transition-[padding] duration-200" />
        </PanelThemeProvider>
      </PanelPrivacyProvider>
    );
  }

  // Pantalla de bienvenida a pantalla completa tras crear el estudio (una sola
  // vez): se evalúa aquí, con el estudio ya cargado y el billing ya resuelto,
  // y ANTES de montar Sidebar/Topbar — no es un overlay, sustituye el layout
  // entero mientras esté activa. "Salir" de ella no navega a ningún sitio:
  // updateStudio actualiza el estado local de forma optimista, así que el
  // siguiente render de este mismo layout deja de cumplir la condición.
  //
  // Solo a la PROPIETARIA, y `rolResuelto` para no decidirlo con el rol mínimo
  // de A-2 mientras carga. Antes no miraba el rol, y eso tenía dos
  // consecuencias: (1) quien primero entrara al panel —una recepcionista, una
  // instructora que acaba de vincular su ficha— se comía el asistente, y como
  // al terminarlo se sella `bienvenida_vista_en` del ESTUDIO, la propietaria no
  // lo veía nunca; (2) desde que el asistente configura el estudio de verdad
  // (§8: crea salas, tipos de clase y borradores de bono), ese camino además
  // preguntaba cosas que no se iban a poder aplicar — /api/onboarding/configurar
  // exige PROPIETARIO, así que habría respondido 403 y el estudio se quedaría
  // sin montar después de que el asistente dijera "las creamos por ti".
  if (studio && !cargandoDatos && !studio.bienvenidaVistaEn && rolResuelto && rol === 'PROPIETARIO') {
    return <PantallaBienvenida studio={studio} />;
  }

  // Editor de Apariencia a pantalla completa: mismo patrón que
  // PantallaBienvenida arriba (sustituye el layout entero en vez de vivir
  // dentro de él), pero por RUTA en vez de por estado del estudio. Sigue
  // dentro de los providers (auth/tema/privacidad ya resueltos arriba) — solo
  // se salta Sidebar/Topbar y el `max-w-[1320px]` pensado para contenido de
  // panel normal, que aquí solo recortaría las 3 columnas del editor.
  if (pathname === '/configuracion/apariencia/editor' || pathname.startsWith('/configuracion/apariencia/editor-zip/')) {
    return (
      <PanelPrivacyProvider>
        <PanelThemeProvider className="min-h-dvh bg-background">
          {/* ⚠️ Esta ruta NO espera a los datos, a diferencia del resto del panel.
              El `PanelSkeleton` existe para que una página no pinte estados
              vacíos falsos ("Sin recibos", "No hay resultados") en carga fría.
              El editor de temas no tiene ese problema: enseña una vista previa
              y un rail, y los dos traen su propio estado de carga.
              Lo que sí tenía era el problema contrario — MEDIDO en producción:
              el editor no se montaba hasta 2,6 s después del `load`, porque
              `cargandoDatos` espera a `studio` Y al estado de facturación. Y
              detrás de ese `?` estaba la vista previa entera, que ni pedía su
              token. Dos intentos de arreglarlo por dentro del editor no
              movieron el número: el componente no llegaba a ejecutarse. */}
          {children}
        </PanelThemeProvider>
      </PanelPrivacyProvider>
    );
  }

  return (
    <PanelPrivacyProvider>
      <PanelThemeProvider className="min-h-dvh bg-background">
        <TourProvider>
          <Sidebar />
          {/* Cambiar de sede recarga el panel entero y aterrizas en un dashboard
              idéntico salvo por los datos: esto es lo único que confirma el salto. */}
          <AvisoCambioDeSede />
          {/* Montado una vez, fuera del árbol de cada página — solo lee el
              estado del tour y localiza el data-tour="..." real de la ruta
              actual (ver lib/tour-pasos.ts). */}
          <Spotlight />
          {/* Overlay, NO pantalla completa (a diferencia de PantallaBienvenida
              arriba): no debe bloquear el panel. Se autogobierna con
              debeMostrarModal() — el componente decide si se muestra. */}
          <ReviewBoostModal studio={studio} rol={rolResuelto ? rol : null} />
          <main className="lg:pl-[var(--sidebar-w)] min-h-dvh transition-[padding] duration-200">
            <div className="pt-14 lg:pt-2 pb-20 lg:pb-0 max-w-[1320px] mx-auto px-4 lg:px-6 py-6 lg:py-6">
              <Topbar />
              {cargandoDatos ? <PanelSkeleton /> : children}
            </div>
          </main>
          <WhatsAppFab />
        </TourProvider>
      </PanelThemeProvider>
    </PanelPrivacyProvider>
  );
}
