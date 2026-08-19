'use client';

import { useEffect, useRef, useState } from 'react';
import { MarcoDispositivo } from './marco-dispositivo';
import type { DispositivoId } from '@/lib/theme/dispositivos';
import { fetchHomePreviewToken } from '@/lib/api-client';
import { varsKitMap, themeToCssVars } from '@/lib/theme-runtime';
import { MENSAJE_TEMA_PREVIEW, resolveTemaJs } from '@/lib/theme-preview-puente';
import type { ThemeConfig } from '@/lib/theme-schema';
import type { BloqueHome, PantallaId } from '@/lib/portal-home-bloques';
import type { ModoPreview } from '@/components/portal/portal-preview-bridge';
import { escalaMedida, huecosDeInsercion, type BloqueMedido, type Caja } from '@/lib/theme/overlay-preview';

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
export const PANTALLAS_SOLO_NAVEGABLES: { id: 'perfil' | 'reservas' | 'bienvenida'; ruta: string; etiqueta: string }[] = [
  // ⚠️ La bienvenida va PRIMERA porque es lo primero que ve una socia — y
  // porque hasta ahora no estaba: la única forma de comprobarla era
  // publicarla, o sea enseñársela antes a las clientas que a la propietaria.
  { id: 'bienvenida', ruta: 'bienvenida', etiqueta: 'Bienvenida' },
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
  dispositivo = 'movil', zoom = 1, modo = 'editar', onInsertar,
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
  dispositivo?: DispositivoId;
  zoom?: number;
  // Qué hace un click DENTRO del iframe. Viaja por el mismo mensaje que los
  // bloques (no hay canal nuevo) y se manda a las tres pantallas, no solo a
  // la mirada: es un ajuste del editor, no de una pantalla.
  modo?: ModoPreview;
  // Insertar una sección DESDE el preview, en el hueco donde se pulsó. Sin
  // esto no se pintan los "+": el overlay solo aparece si alguien lo escucha.
  onInsertar?: (indice: number) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const envoltorio = useRef<HTMLDivElement>(null);
  const [medidas, setMedidas] = useState<BloqueMedido[]>([]);
  const [caja, setCaja] = useState<{ iframe: Caja; escala: number } | null>(null);
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

  // El token trae el slug consigo, y por eso la vista previa ya no espera al
  // contexto del panel: antes el iframe no podía componer su URL hasta que
  // `useStudio()` resolvía —63 peticiones más tarde— y se veía un hueco vacío
  // entre 4 y 7 segundos. El slug de la prop se sigue aceptando como respaldo.
  const [slugToken, setSlugToken] = useState<string | null>(null);
  // ⚠️ El token dura 20 min (`lib/theme/home-preview-token.ts`) y antes se
  // pedía UNA sola vez, al montar. En una sesión de edición normal —más larga
  // que eso— cualquier cambio de pantalla pasado ese tiempo mandaba un token
  // ya caducado y la vista previa se quedaba muda ("Recarga la vista previa
  // desde el editor."), sin que nada en la barra superior avisara de por qué.
  // Se renueva aquí abajo (efecto de `vista`, no un timer aparte) SOLO
  // cuando toca: renovar en un timer independiente cambiaría `token` —y por
  // tanto el `src` del iframe— MIENTRAS la propietaria mira algo, recargando
  // el iframe de golpe y perdiendo cualquier navegación que hubiera hecho a
  // mano dentro de él. Enganchado al cambio de `vista` no añade ningún
  // recargo: ese cambio YA fuerza un `src` nuevo (por la ruta), así que de
  // paso se aprovecha para que lleve un token fresco.
  const tokenObtenidoEn = useRef(0);
  useEffect(() => {
    let vivo = true;
    fetchHomePreviewToken()
      .then(({ token: t, slug: s }) => { if (vivo) { setToken(t); setSlugToken(s); tokenObtenidoEn.current = Date.now(); } })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  // La renovación de verdad: si han pasado más de 10 min desde el último
  // token (la mitad del TTL de 20, con margen de sobra) y la vista acaba de
  // cambiar, se pide uno nuevo ANTES de que `src` se recomponga con la ruta
  // nueva — así el salto de pantalla que la propietaria ya estaba haciendo
  // lleva un token fresco en vez de arrastrar el viejo hasta que caduque de
  // verdad. Sin el `if`, esto pediría un token en cada cambio de pantalla,
  // aunque acabara de pedirse uno hace un segundo.
  useEffect(() => {
    if (Date.now() - tokenObtenidoEn.current < 10 * 60 * 1000) return;
    let vivo = true;
    fetchHomePreviewToken()
      .then(({ token: t, slug: s }) => { if (vivo) { setToken(t); setSlugToken(s); tokenObtenidoEn.current = Date.now(); } })
      .catch(() => {});
    return () => { vivo = false; };
    // Se dispara con CADA cambio de vista a propósito (es la señal de "va a
    // haber un `src` nuevo igualmente"); el guard de arriba decide si hace
    // falta pedir un token o no.
  }, [vista]);
  const slugEfectivo = slugToken ?? slug ?? null;

  function enviar() {
    for (const p of PANTALLAS) {
      ref.current?.contentWindow?.postMessage(
        {
          type: 'tentare-bloques-preview', pantalla: p.id, bloques: bloquesPorPantalla[p.id],
          seleccionId: p.id === pantalla ? (seleccionId ?? null) : null,
          modo,
        },
        window.location.origin,
      );
    }
    if (temaBorrador) {
      ref.current?.contentWindow?.postMessage(
        {
          type: MENSAJE_TEMA_PREVIEW,
          // Los DOS vocabularios en el mismo mensaje: el portal de siempre lee
          // `--portal-*` y el kit lee `--brand`/`--radius-card`/`--size-*`. El
          // listener los aplica en línea, que gana a `html[data-theme="…"]`, así
          // que tocar un color se ve al momento en los dos.
          vars: { ...themeToCssVars(temaBorrador), ...varsKitMap(temaBorrador) } as Record<string, string>,
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

  // Dónde está el iframe DENTRO del panel, y a qué escala se ve.
  //
  // ⚠️ La escala se MIDE (ancho pintado / ancho declarado) en vez de
  // recomponerse desde `zoom`: el encogido automático lo decide un
  // ResizeObserver dentro de MarcoDispositivo, así que rehacer la cuenta aquí
  // sería duplicar esa lógica y desincronizarse en cuanto cambie el hueco.
  useEffect(() => {
    if (!onInsertar) return;
    const el = ref.current;
    const cont = envoltorio.current;
    if (!el || !cont) return;
    function remedir() {
      const i = el!.getBoundingClientRect();
      const c = cont!.getBoundingClientRect();
      setCaja({
        // Relativas al envoltorio, que es quien lleva el `position: relative`.
        iframe: { x: i.left - c.left, y: i.top - c.top, ancho: i.width, alto: i.height },
        escala: escalaMedida(i.width, el!.offsetWidth),
      });
    }
    remedir();
    const ro = new ResizeObserver(remedir);
    ro.observe(el);
    ro.observe(cont);
    return () => ro.disconnect();
  }, [onInsertar, dispositivo, zoom, token]);

  useEffect(() => {
    if (!onInsertar) return;
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data as { type?: string; bloques?: BloqueMedido[] } | null;
      if (!d || d.type !== 'tentare-bloques-preview-medidas' || !Array.isArray(d.bloques)) return;
      setMedidas(d.bloques);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onInsertar]);

  if (!slugEfectivo || !token) {
    return <MarcoDispositivo dispositivo={dispositivo} zoom={zoom} vacio="La vista previa aparecerá en un momento." />;
  }

  const ruta = TODAS_LAS_VISTAS.find((p) => p.id === vista)?.ruta ?? '';

  return (
    <div ref={envoltorio} className="relative">
      <MarcoDispositivo dispositivo={dispositivo} zoom={zoom}>
        <iframe
          ref={ref}
          src={`/portal-preview/${slugEfectivo}${ruta ? `/${ruta}` : ''}?t=${token}`}
          title="Vista previa de la app de socias"
          onLoad={enviar}
          className="w-full h-full border-0"
        />
      </MarcoDispositivo>
      {/* El "+" entre secciones. Va FUERA del iframe a propósito: dentro lo
          recortaría el marco y lo encogería el mismo `scale()` que encoge el
          portal, así que en un móvil al 45 % mediría 14 px. */}
      {onInsertar && caja && huecosDeInsercion(medidas, caja.iframe, caja.escala).map((h) => (
        <button
          key={h.indice}
          type="button"
          onClick={() => onInsertar(h.indice)}
          aria-label={`Añadir una sección en la posición ${h.indice + 1}`}
          data-hueco={h.indice}
          className="absolute z-10 -translate-y-1/2 flex items-center justify-center group"
          style={{ left: h.x, top: h.y, width: h.ancho, height: 22 }}
        >
          <span className="h-px w-full bg-brand/0 group-hover:bg-brand transition-colors" />
          <span className="absolute w-5 h-5 rounded-full bg-background border border-border text-muted-foreground text-[13px] leading-none flex items-center justify-center opacity-40 group-hover:opacity-100 group-hover:bg-brand group-hover:text-brand-foreground group-hover:border-brand transition-all">
            +
          </span>
        </button>
      ))}
    </div>
  );
}
