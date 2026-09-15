'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { cn } from '@/lib/utils';
import { Toast, useToast } from '@/components/ui/toast';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { ReanimarAlCambiar } from '@/components/ui/reanimar-al-cambiar';
import { hrefDeSeccion, resolverDestino, type TabConfiguracion } from '@/lib/configuracion/destino';

// Cada pestaña solo se ve una a la vez (activeTab) pero antes se importaban
// las 10 de golpe: visitar "Planes" descargaba también el JS de
// Integraciones (735 líneas), Backups, Gamificación... aunque no se abrieran
// en esa visita. `next/dynamic` parte cada pestaña en su propio chunk,
// cargado solo cuando activeTab la selecciona.
const TabCamposPersonalizados = dynamic(() => import('@/components/configuracion/tab-campos-personalizados').then(m => m.TabCamposPersonalizados), { loading: () => <PanelSkeleton /> });
const TabPlantillasEmail = dynamic(() => import('@/components/configuracion/tab-plantillas-email').then(m => m.TabPlantillasEmail), { loading: () => <PanelSkeleton /> });
const TabIntegraciones = dynamic(() => import('@/components/configuracion/tab-integraciones').then(m => m.TabIntegraciones), { loading: () => <PanelSkeleton /> });
const TabEstudio = dynamic(() => import('@/components/configuracion/tab-estudio').then(m => m.TabEstudio), { loading: () => <PanelSkeleton /> });
const TabPerfil = dynamic(() => import('@/components/configuracion/tab-perfil').then(m => m.TabPerfil), { loading: () => <PanelSkeleton /> });
const TabGamificacion = dynamic(() => import('@/components/configuracion/tab-gamificacion').then(m => m.TabGamificacion), { loading: () => <PanelSkeleton /> });
const TabBackups = dynamic(() => import('@/components/configuracion/tab-backups').then(m => m.TabBackups), { loading: () => <PanelSkeleton /> });
const TabClasesSalas = dynamic(() => import('@/components/configuracion/tab-clases-salas').then(m => m.TabClasesSalas), { loading: () => <PanelSkeleton /> });
const TabCitas = dynamic(() => import('@/components/configuracion/tab-citas').then(m => m.TabCitas), { loading: () => <PanelSkeleton /> });
const TabApi = dynamic(() => import('@/components/configuracion/tab-api').then(m => m.TabApi), { loading: () => <PanelSkeleton /> });
const TabCuestionarioSalud = dynamic(() => import('@/components/configuracion/tab-cuestionario-salud').then(m => m.TabCuestionarioSalud), { loading: () => <PanelSkeleton /> });
const TabDescubre = dynamic(() => import('@/components/configuracion/tab-descubre').then(m => m.TabDescubre), { loading: () => <PanelSkeleton /> });

// ─── Tab definition ───────────────────────────────────────────────────────────

// Los ids, sus sub-pestañas y los enlaces antiguos (`?tab=salas`, `?tab=planes`,
// `?tab=emails`...) viven en lib/configuracion/destino.ts: esta página solo
// pinta. Aquí se quedan las etiquetas, en el orden en que se ven.
const TABS: { id: TabConfiguracion; label: string }[] = [
  { id: 'clases-salas', label: 'Clases y salas' },
  { id: 'citas',       label: 'Citas' },
  { id: 'gamificacion', label: 'Logros y motivación' },
  { id: 'integraciones', label: 'Integraciones' },
  { id: 'estudio',     label: 'Estudio' },
  { id: 'descubre',    label: 'Descubre y tablón' },
  { id: 'api',         label: 'API' },
  { id: 'campos',      label: 'Campos de clienta' },
  { id: 'cuestionario-salud', label: 'Cuestionario de salud' },
  { id: 'plantillas',  label: 'Emails' },
  { id: 'backups',     label: 'Copias de seguridad' },
  { id: 'perfil',      label: 'Mi perfil' },
];

// ─── Main page ────────────────────────────────────────────────────────────────

// Lo que está abierto. `vista` solo cambia cuando el destino llega DE FUERA (la
// carga, un enlace a esta misma página, Atrás): forma parte de la `key` de la
// pestaña para que se monte otra vez y lea su `sub` inicial. Elegir a mano una
// sub-pestaña no la toca, así que no desmonta nada.
type Abierto = { tab: TabConfiguracion; sub?: string; ancla?: string; vista: number };

export default function ConfiguracionPage() {
  const { studio } = useStudio();
  const router = useRouter();
  // `null` hasta leer la URL: pintar antes la pestaña por defecto y cambiarla
  // un render después era el parpadeo de «Clases y salas» en cada enlace.
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const searchParams = useSearchParams();

  // ⚠️ #2008: tras cambiar la URL, `useSearchParams()` no se entera en el mismo
  // render. Si la pestaña se derivara de él, cada clic volvería un instante a la
  // URL de antes. Así que la URL se lee solo cuando cambia por algo que NO ha
  // escrito esta página: `escritas` guarda lo que se pidió con router.replace y
  // `vista` lo último que se sabe que hay en la barra.
  const escritas = useRef<string[]>([]);
  const urlVista = useRef<string | null>(null);

  useEffect(() => {
    const query = searchParams.toString();
    if (query === urlVista.current) return;
    urlVista.current = query;
    const pos = escritas.current.indexOf(query);
    if (pos !== -1) {
      // Es la nuestra (o una intermedia de dos clics seguidos): el estado ya va
      // por delante.
      escritas.current.splice(0, pos + 1);
      return;
    }
    escritas.current = [];
    const destino = resolverDestino({
      tab: searchParams.get('tab'),
      sub: searchParams.get('sub'),
      hash: window.location.hash,
      params: new URLSearchParams(query),
    });
    if ('redirect' in destino) {
      router.replace(destino.redirect);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Sincroniza con un sistema externo (la barra de direcciones) solo cuando cambia desde fuera; ver el comentario de `escritas`.
    setAbierto(prev => {
      // Mismo sitio que ya está abierto (p. ej. Integraciones limpiando el
      // `?stripe_connected=1` de la URL): no se remonta la pestaña.
      if (prev && prev.tab === destino.tab && prev.sub === destino.sub && !destino.ancla) return prev;
      return { ...destino, vista: (prev?.vista ?? 0) + 1 };
    });
  }, [searchParams, router]);

  // El ancla (`#datos-fiscales`) apunta a algo que aún no existe al cargar: la
  // pestaña se descarga aparte y pinta un esqueleto hasta tener los datos del
  // estudio. Se espera a que aparezca, se baja una vez y se deja de mirar.
  const ancla = abierto?.ancla;
  const vistaAncla = abierto?.vista;
  useEffect(() => {
    if (!ancla) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      const el = document.getElementById(ancla);
      if (el) el.scrollIntoView({ block: 'start' });
      if (el || ++intentos > 100) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [ancla, vistaAncla]);

  if (!abierto) return null;
  const activeTab = abierto.tab;

  function irA(tab: TabConfiguracion, sub?: string) {
    setAbierto(prev => ({ tab, sub, vista: prev?.vista ?? 0 }));
    // La URL dice lo que se ve, para que recargar, volver o compartir el
    // enlace abra lo mismo. `replace` y no `push`: cambiar de pestaña no llena
    // el historial de entradas por las que haya que retroceder una a una.
    const href = hrefDeSeccion(tab, sub);
    const query = href.slice(href.indexOf('?') + 1);
    if (query === urlVista.current || escritas.current.at(-1) === query) return;
    escritas.current.push(query);
    router.replace(href, { scroll: false });
  }

  const alCambiarSub = (sub: string) => irA(activeTab, sub);
  const clave = `${activeTab}-${abierto.vista}`;

  return (
    <div data-tour="configuracion-vista" className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Clases, salas, integraciones y ajustes de tu estudio. Las tarifas están en Paquetes."
      />

      {/* Tab nav
          Doce pestañas no caben en una línea, y con solo `overflow-x-auto` la
          última quedaba cortada A MEDIA PALABRA sin nada que indicara que se
          podía desplazar: se leía como rota, no como desplazable.
          A partir de `sm` envuelven —hay sitio de sobra en dos filas y así todo
          está a la vista—; por debajo se mantiene el desplazamiento, porque en
          un móvil doce pestañas envueltas se comerían la pantalla. */}
      <div className="flex gap-1 p-1 bg-card border border-border rounded-xl overflow-x-auto sm:overflow-x-visible sm:flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => irA(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-brand text-brand-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-background'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <ReanimarAlCambiar clave={activeTab} animClassName="tab-content-in">
        {activeTab === 'clases-salas' && <TabClasesSalas key={clave} showToast={showToast} sub={abierto.sub} onSubChange={alCambiarSub} />}
        {activeTab === 'citas'       && <TabCitas       key={clave} showToast={showToast} sub={abierto.sub} onSubChange={alCambiarSub} />}
        {activeTab === 'gamificacion' && <TabGamificacion key={clave} showToast={showToast} sub={abierto.sub} onSubChange={alCambiarSub} studio={studio} />}
        {activeTab === 'backups'     && <TabBackups      showToast={showToast} />}
        {activeTab === 'integraciones' && <TabIntegraciones showToast={showToast} />}
        {activeTab === 'estudio'     && <TabEstudio      key={clave} showToast={showToast} sub={abierto.sub} onSubChange={alCambiarSub} />}
        {activeTab === 'descubre'    && <TabDescubre />}
        {activeTab === 'api'         && <TabApi          key={clave} showToast={showToast} sub={abierto.sub} onSubChange={alCambiarSub} />}
        {activeTab === 'campos'      && <TabCamposPersonalizados showToast={showToast} />}
        {activeTab === 'cuestionario-salud' && <TabCuestionarioSalud showToast={showToast} />}
        {activeTab === 'plantillas'  && <TabPlantillasEmail showToast={showToast} />}
        {activeTab === 'perfil'      && <TabPerfil       showToast={showToast} />}
      </ReanimarAlCambiar>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}

