'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchHomePreviewToken } from '@/lib/api-client';
import { themeToCssVars } from '@/lib/theme-runtime';
import { MENSAJE_TEMA_PREVIEW, resolveTemaJs } from '@/lib/theme-preview-puente';
import type { ThemeConfig } from '@/lib/theme-schema';
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
export const PANTALLAS_SOLO_NAVEGABLES: { id: 'perfil' | 'reservas'; ruta: string; etiqueta: string }[] = [
  { id: 'reservas', ruta: 'reservas', etiqueta: 'Reservas' },
  { id: 'perfil', ruta: 'perfil', etiqueta: 'Perfil' },
];
export type VistaId = PantallaId | (typeof PANTALLAS_SOLO_NAVEGABLES)[number]['id'];
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
  bloquesPorPantalla, pantalla, onPantallaChange, slug, seleccionId, onBloqueSeleccionado, temaBorrador, irA,
}: {
  bloquesPorPantalla: Record<PantallaId, BloqueHome[]>;
  pantalla: PantallaId;
  onPantallaChange: (p: PantallaId) => void;
  slug?: string | null;
  // Click directo sobre el preview (Fase C del "constructor totalmente
  // libre"): `seleccionId` se manda AL iframe para que resalte el bloque
  // activo; `onBloqueSeleccionado` recibe el aviso EN SENTIDO CONTRARIO
  // cuando la propietaria clica un bloque dentro del iframe, para sincronizar
  // la fila seleccionada en el panel izquierdo del editor. Ambos opcionales:
  // el preview de "Ajustes" (ThemePreview) no los usa.
  seleccionId?: string | null;
  onBloqueSeleccionado?: (id: string) => void;
  // Tema en BORRADOR. Los bloques ya viajaban en vivo por postMessage, pero el
  // color/tipografía solo llegaba ya aplicado en el HTML que sirve la ruta, así
  // que tocar un color en "Ajustes" no se veía aquí hasta recargar. Se manda por
  // el MISMO canal que ya usa ThemePreview en /reservar
  // (`tentare-theme-preview`), que ThemePreviewListener ya escucha en esta ruta
  // — no hay listener ni whitelist nuevos, solo un emisor más.
  temaBorrador?: ThemeConfig | null;
  // Comando imperativo para saltar a una vista concreta, incluidas Reservas/
  // Perfil — que `pantalla` no cubre (ver comentario de `PANTALLAS_SOLO_NAVEGABLES`
  // arriba: no forman parte de ese prop). Cambiar `nonce` dispara el salto
  // aunque `vista` sea la misma string que la última vez (ej. volver a pedir
  // Reservas tras haber navegado a Perfil a mano dentro del propio widget).
  irA?: { vista: VistaId; nonce: number } | null;
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

  // Mismo patrón que `pantallaVista` arriba (ajuste de estado DURANTE el
  // render, no en un efecto): un `nonce` nuevo es "cambió la prop", aunque
  // `irA.vista` sea el mismo string que la última vez.
  const [nonceVisto, setNonceVisto] = useState(irA?.nonce ?? 0);
  if (irA && irA.nonce !== nonceVisto) {
    setNonceVisto(irA.nonce);
    setVista(irA.vista);
    if (irA.vista === 'home' || irA.vista === 'clases' || irA.vista === 'bonos') onPantallaChange(irA.vista);
  }

  useEffect(() => {
    let vivo = true;
    fetchHomePreviewToken().then((t) => { if (vivo) setToken(t); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  function enviar() {
    for (const p of PANTALLAS) {
      ref.current?.contentWindow?.postMessage(
        {
          type: 'tentare-bloques-preview', pantalla: p.id, bloques: bloquesPorPantalla[p.id],
          seleccionId: p.id === pantalla ? (seleccionId ?? null) : null,
        },
        window.location.origin,
      );
    }
    if (temaBorrador) {
      ref.current?.contentWindow?.postMessage(
        {
          type: MENSAJE_TEMA_PREVIEW,
          vars: themeToCssVars(temaBorrador) as Record<string, string>,
          // La mitad JS del tema (variantes de FORMA, barra) — ver
          // lib/theme-preview-puente.ts. Sin esto, el iframe pintaba la paleta
          // del borrador con la forma del tema PUBLICADO: la cabecera seguía en
          // 'clasica' y los retos salían blancos aunque el borrador dijera otra
          // cosa. Lo aplica StudioProvider, que es donde vive `variantes`.
          temaJs: resolveTemaJs(temaBorrador),
        },
        window.location.origin,
      );
    }
  }

  // Reenvía el borrador en cada cambio (el componente se re-renderiza al editar).
  useEffect(() => {
    enviar();
  });

  // Canal inverso: clicar un bloque DENTRO del iframe manda su id aquí (ver
  // components/portal/portal-preview-bridge.ts, usePreviewClickToSelect). Se
  // valida origin (mismo criterio que el resto de listeners de este puente) Y
  // source (que el mensaje venga REALMENTE de este iframe, no de otro
  // same-origin) — el canal padre→hijo de arriba solo validaba origin; este,
  // al ser nuevo, cierra ese hueco menor de paso.
  useEffect(() => {
    if (!onBloqueSeleccionado) return;
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { type?: string; bloqueId?: string } | null;
      if (!d || d.type !== 'tentare-bloques-preview-click' || !d.bloqueId) return;
      onBloqueSeleccionado?.(d.bloqueId);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onBloqueSeleccionado]);

  if (!slug || !token) {
    return (
      <div className="mx-auto w-full max-w-[390px] aspect-[390/844] rounded-[2rem] border-[6px] border-black/85 bg-muted flex items-center justify-center text-center px-6">
        <p className="text-[12px] text-muted-foreground">La vista previa aparecerá en un momento.</p>
      </div>
    );
  }

  const ruta = TODAS_LAS_VISTAS.find((p) => p.id === vista)?.ruta ?? '';

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="aspect-[390/844] rounded-[2rem] border-[6px] border-black/85 shadow-xl overflow-hidden bg-white">
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
