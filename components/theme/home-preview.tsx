'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHomePreviewToken } from '@/lib/api-client';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';

const PANTALLAS: { id: PantallaId; ruta: string; etiqueta: string }[] = [
  { id: 'home', ruta: '', etiqueta: 'Inicio' },
  { id: 'clases', ruta: 'clases', etiqueta: 'Clases' },
  { id: 'bonos', ruta: 'bonos', etiqueta: 'Bonos' },
];

// Pantallas SIN constructor de bloques (Fase 4 del Theme Builder): navegables
// en este mismo marco, pero no editables por bloques — no forman parte del
// `pantalla`/`onPantallaChange` que controla el padre (PortalBloquesEditor),
// solo de la navegación interna de este widget. Compras queda fuera a
// propósito (dinero real) — ver PortalPreviewReservasClient/PerfilClient.
const PANTALLAS_SOLO_NAVEGABLES: { id: 'perfil' | 'reservas'; ruta: string; etiqueta: string }[] = [
  { id: 'reservas', ruta: 'reservas', etiqueta: 'Reservas' },
  { id: 'perfil', ruta: 'perfil', etiqueta: 'Perfil' },
];
type VistaId = PantallaId | (typeof PANTALLAS_SOLO_NAVEGABLES)[number]['id'];
const TODAS_LAS_VISTAS: { id: VistaId; ruta: string; etiqueta: string }[] = [...PANTALLAS, ...PANTALLAS_SOLO_NAVEGABLES];

// Preview en vivo REAL de la app de socias (Fase 4 del editor de temas, su
// ampliación de Fase 5, y la generalización a un constructor de bloques por
// pantalla de la Fase 1 del Theme Builder): un solo marco de móvil con un
// iframe apuntando a /portal-preview/[slug][/pantalla] (sin sesión, token
// firmado) que sincroniza el borrador de BLOQUES de LAS TRES pantallas por
// postMessage — así, sea cual sea la pantalla que se esté mirando, se ve el
// borrador correcto aunque el editor esté editando otra. El color/tipografía
// en borrador llega solo YA aplicado en el HTML servido por
// ThemePreviewListener (montado en app/portal-preview/[slug]/layout.tsx), así
// que cambiar de pantalla aquí no pierde el tema que se está probando en la
// pestaña "Marca y colores" si el editor sigue abierto en la misma sesión de
// navegador (ambos leen/mandan al mismo studio_theme en borrador).
//
// `pantalla` es controlada por el padre (el editor de bloques): así, al
// cambiar de pestaña de pantalla en el editor, el preview salta a esa misma
// pantalla sin que la propietaria tenga que buscarla ella misma. La
// propietaria también puede navegar libremente a Reservas/Perfil desde aquí
// (Fase 4): eso NO se avisa al padre, que solo sabe de pantallas con bloques.
export function HomePreview({
  bloquesPorPantalla, pantalla, onPantallaChange, slug,
}: {
  bloquesPorPantalla: Record<PantallaId, BloqueHome[]>;
  pantalla: PantallaId;
  onPantallaChange: (p: PantallaId) => void;
  slug?: string | null;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaId>(pantalla);
  // Ajuste de estado derivado DURANTE el render (no en un efecto — patrón
  // recomendado por React para "resetear estado cuando cambia una prop", ver
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-a-prop):
  // si la propietaria cambia de pestaña en el editor de bloques, el preview la
  // sigue — pero solo mientras esté en una de las pantallas con bloques; si se
  // fue a Reservas/Perfil por su cuenta, un cambio de `pantalla` (que sigue
  // pasando entre Inicio/Clases/Bonos por debajo) no la saca de ahí.
  const [pantallaVista, setPantallaVista] = useState(pantalla);
  if (pantalla !== pantallaVista) {
    setPantallaVista(pantalla);
    if (PANTALLAS.some((p) => p.id === vista)) setVista(pantalla);
  }

  function elegirVista(id: VistaId) {
    setVista(id);
    if (id === 'home' || id === 'clases' || id === 'bonos') onPantallaChange(id);
  }

  useEffect(() => {
    let vivo = true;
    fetchHomePreviewToken().then((t) => { if (vivo) setToken(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  function enviar() {
    for (const p of PANTALLAS) {
      ref.current?.contentWindow?.postMessage(
        { type: 'tentare-bloques-preview', pantalla: p.id, bloques: bloquesPorPantalla[p.id] },
        window.location.origin,
      );
    }
  }

  // Reenvía el borrador en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  if (!slug || !token) {
    return (
      <div className="mx-auto w-full max-w-[320px] aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 bg-muted flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">La vista previa aparecerá en un momento.</p>
      </div>
    );
  }

  const ruta = TODAS_LAS_VISTAS.find((p) => p.id === vista)?.ruta ?? '';

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="flex flex-wrap justify-center gap-1 mb-3" role="tablist" aria-label="Pantalla a previsualizar">
        {TODAS_LAS_VISTAS.map(p => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={vista === p.id}
            onClick={() => elegirVista(p.id)}
            className={`px-3 py-1 rounded-full text-xs border ${vista === p.id ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground'}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="aspect-[9/19] rounded-[2rem] border-[6px] border-black/85 shadow-xl overflow-hidden bg-white">
        <iframe
          ref={ref}
          src={`/portal-preview/${slug}${ruta ? `/${ruta}` : ''}?t=${token}`}
          title="Vista previa de la app de socias"
          onLoad={enviar}
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
