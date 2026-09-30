'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Inbox, Zap, Search, Eye, EyeOff } from 'lucide-react';
import { ProfileMenu } from '@/components/layout/profile-menu';
import { IconButton } from '@/components/ui/icon-button';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { PildoraPrueba } from '@/components/billing/pildora-prueba';
import { usePanelPrivacy } from '@/lib/panel-privacy';
import { useAtajoBuscar } from '@/lib/use-atajo-buscar';

// El buscador trae el índice de Configuración y de tareas (~15 KB con gzip) y
// esta barra va en TODAS las pantallas del panel — también en móvil y en el
// iPad en vertical, donde ni se ve. Se descarga aparte, al abrirlo o cuando el
// navegador queda libre, y el atajo ⌘K vive aquí para funcionar antes.
const cargarBuscador = () => import('@/components/search/global-search');
const GlobalSearch = dynamic(() => cargarBuscador().then(m => m.GlobalSearch), { ssr: false });

export function Topbar() {
  const { oculto, setOculto } = usePanelPrivacy();
  const atajo = useAtajoBuscar();
  // Un solo disparador para las dos cosas (antes había dos pills contiguos que
  // abrían el mismo modal: éste y el propio botón "Buscar" de GlobalSearch).
  // El buscador ya sabe resolver tareas; este botón solo lo abre. Existe porque
  // ⌘K no lo descubre quien no sabe que existe, y el objetivo es justamente que
  // alguien sin formación encuentre las cosas el primer día.
  const [lanzadorAbierto, setLanzadorAbierto] = useState(false);
  // Montado desde la primera apertura y para siempre: cerrarlo no lo desmonta
  // (y reabrirlo no vuelve a esperar a nada).
  const [buscadorMontado, setBuscadorMontado] = useState(false);
  const abrirBuscador = (v: boolean) => {
    if (v) setBuscadorMontado(true);
    setLanzadorAbierto(v);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setBuscadorMontado(true);
        setLanzadorAbierto(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    // Con el navegador libre se trae ya, para que la primera apertura no espere
    // a la red — pero solo donde esta barra se ve (`lg`): en el móvil y en el
    // iPad en vertical no hay botón que pulsar, y bajarlo ahí sería gastar su
    // datos en algo que no se usa (el atajo lo sigue cargando si hace falta).
    const seVe = window.matchMedia('(min-width: 1024px)').matches;
    const precarga = !seVe ? null : typeof window.requestIdleCallback === 'function'
      ? { idle: window.requestIdleCallback(() => { void cargarBuscador(); }, { timeout: 5000 }) }
      : { timeout: window.setTimeout(() => { void cargarBuscador(); }, 3000) };
    return () => {
      window.removeEventListener('keydown', onKey);
      if (precarga && 'idle' in precarga) window.cancelIdleCallback(precarga.idle);
      else if (precarga) window.clearTimeout(precarga.timeout);
    };
  }, []);

  return (
    // ⚠️ Con un desplegable abierto (perfil, cambio de sede, píldora de prueba) la
    // barra sube de z-30 a z-40. La pantalla de Equipo lleva su propia barra de
    // filtros `sticky z-30` y, con el MISMO z-index, la que va más abajo en el DOM
    // gana: el menú de perfil se quedaba DEBAJO de los filtros y tapaba «Cambiar
    // de sede» y el resto. Solo mientras hay algo abierto, para no cambiar cómo se
    // apila la barra el resto del tiempo (ventanas flotantes, ayuda de pantalla,
    // diálogos).
    //
    // z-30, no z-10: `position: sticky` + `z-index` crea un contexto de
    // apilamiento propio, así que el z-20 del dropdown de ProfileMenu solo
    // compite DENTRO de este contenedor — frente al resto de la página queda
    // limitado al z-index del propio contenedor. Las cabeceras sticky del
    // calendario (vista-semana.tsx/vista-dia-salas.tsx) usan z-10 y, al pintarse
    // más tarde en el DOM, ganaban el empate y tapaban el menú de usuario.
    //
    // ⚠️ `top-[var(--panel-sticky-top)]`, NUNCA `top-0`. Con el menú arriba
    // («superior») la barra del menú es `fixed` y ocupa la banda de arriba;
    // clavarse en y=0 metía esta barra DENTRO de ella al scrollear, y como
    // z-30 gana a su z-20, la tapaba: se veían las filas del menú por detrás
    // de este fondo translúcido. La variable la escribe el propio menú al
    // MEDIRSE (`aplicarHuecos`), que es lo único que no se queda desfasado
    // cuando la barra crece de dos filas a tres.
    <div data-panel-topbar className="hidden lg:flex sticky top-[var(--panel-sticky-top,0px)] z-30 has-[[aria-expanded=true]]:z-40 items-center justify-between h-14 px-4 -mx-4 mb-2 bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <button
          onClick={() => abrirBuscador(true)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-semibold hover:brightness-95 transition-all w-full"
        >
          <Zap size={14} aria-hidden="true" className="shrink-0" />
          <Search size={14} aria-hidden="true" className="shrink-0 opacity-70" />
          <span className="flex-1 text-left">¿Qué quieres hacer o buscar?</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono leading-none bg-white/15 text-white/70">{atajo}</kbd>
        </button>
        {buscadorMontado && (
          <GlobalSearch
            variant="light"
            renderTrigger={false}
            abierto={lanzadorAbierto}
            onAbiertoChange={abrirBuscador}
          />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <PildoraPrueba className="mr-1" />
        <IconButton
          label={oculto ? 'Mostrar cifras' : 'Ocultar cifras (modo privacidad)'}
          icon={oculto ? EyeOff : Eye}
          onClick={() => setOculto(!oculto)}
          className={oculto ? 'text-brand-medio' : 'text-muted-foreground'}
        />
        <Link
          href="/mensajeria"
          title="Mensajería"
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground transition-colors"
        >
          <Inbox size={16} />
        </Link>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </div>
  );
}
