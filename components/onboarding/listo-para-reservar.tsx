'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu estudio ya puede recibir reservas» — el momento de valor del onboarding.
//
// ⚠️ POR QUÉ EXISTE. El onboarding terminaba diciendo «listo» y soltando a la
// propietaria en el panel. Nunca le enseñaba LO QUE ACABA DE CONSEGUIR: que su
// página existe, que funciona y qué ve su alumna al entrar. Y eso no es un
// adorno — es el paso que separa «he configurado un software» de «mi estudio
// está abierto».
//
// El caso que lo justifica está en producción: un estudio con 208 clases
// programadas, 1 plan creado… y CERO alumnas y CERO reservas. Montó el
// horario entero y nunca llegó a compartir su enlace. Tener la página lista y
// no saberlo es exactamente el mismo resultado que no tenerla.
//
// Tres cosas, en este orden:
//   1. Lo que ha conseguido, dicho en una frase.
//   2. Su APP DE VERDAD, dentro de un móvil. No una ilustración: el iframe
//      carga `/portal/[slug]`, el mismo sitio al que va a entrar su alumna, y
//      se puede tocar pero no escribe nada (`AppEnVivo`, el marco «solo
//      mirar»). Si algo no está bien, lo ve aquí y no cuando ya lo ha mandado.
//   3. El enlace de esa app, listo para pegar donde ella ya habla con sus
//      alumnas.
//
// ⚠️ El enlace es el de LA APP (`/portal/[slug]`), no el de la página de
// reservas (`/reservar/[slug]`): esa es para integrarla en su web, no para
// repartirla (decisión del fundador, 22-oct-2026; lib/enlaces-estudio.ts).
//
// Y es el paso 7 del alta nueva (PR-4, «¡Listo! Tu clase … ya está
// publicada»), con props opcionales que el Calendario no pasa (y no ve):
// `nombreClase` cambia el titular, `veredicto` trae la respuesta del servidor
// que acaba de publicar (no se vuelve a preguntar), y con el SÍ salen
// «Comprobado: una alumna nueva puede reservar» y el aviso del correo. El QR,
// con `conQr`.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Check, CircleCheck, Copy, ExternalLink, MessageCircle, Share2 } from 'lucide-react';
import { BotonQr } from '@/components/configuracion/dialogo-qr';
import { copiarAlPortapapeles } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { avisoVentaOnline } from '@/lib/onboarding';
import {
  avisoListo, finalDelParrafo, leerRespuestaPuedeReservar, type RespuestaPuedeReservar,
} from '@/lib/onboarding/puede-reservar';
import { authHeader } from '@/lib/api-client';
import { anfitrionPortal } from '@/lib/panel-portal';
import { rutaApp } from '@/lib/enlaces-estudio';
import { AppEnVivo } from '@/components/alta-nueva/app-en-vivo';
import { capturarEvento } from '@/lib/posthog-cliente';
import { apuntarEnlaceCompartido } from '@/lib/alta/embudo-cliente';
import { useRol } from '@/lib/permisos';
// ⚠️ TentiDiferido y NUNCA '@/components/tenti/tenti': este componente lo
// importa sin diferir /calendario, y un import directo metería
// el motor de la mascota en cada carga del calendario, para todos los roles.
import { TentiDiferido } from '@/components/tenti/tenti-diferido';

// El móvil de la vista previa: el iPhone de `AppEnVivo` (402 × 874 pt) encogido
// para caber en la columna de 260 px.
const ESCALA_MOVIL = 0.6;

export function ListoParaReservar({
  slug,
  nombreEstudio,
  clasesCreadas,
  onSeguir,
  nombreClase,
  veredicto,
  correoEnviado = false,
  conQr = false,
  textoSeguir = 'Ver mi calendario',
  errorSeguir = null,
}: {
  slug: string;
  nombreEstudio: string;
  clasesCreadas: number;
  onSeguir: () => void;
  /** Paso 7 del alta nueva: «¡Listo! Tu clase «…» ya está publicada». */
  nombreClase?: string | null;
  /**
   * La respuesta de `puedeReservarEnServidor` que ya trae quien publicó la
   * clase. Con ella no se vuelve a preguntar; sin ella (`undefined`), se
   * pregunta como siempre.
   */
  veredicto?: RespuestaPuedeReservar;
  /** El servidor ha mandado (o está mandando) «Ya puedes recibir reservas». */
  correoEnviado?: boolean;
  /** «Descargar el QR» de su página, para recepción. */
  conQr?: boolean;
  textoSeguir?: string;
  /** Si seguir ha fallado (sellar el alta), qué ha pasado: esta pantalla tapa todo lo demás. */
  errorSeguir?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const [cargada, setCargada] = useState(false);
  const alCargar = useCallback(() => setCargada(true), []);
  const [error, setError] = useState<string | null>(null);
  // La frase grande dice «ya puede recibir reservas». Si una alumna nueva no va
  // a poder (exige bono, hay tarifas activas y no hay Stripe), se dice aquí
  // mismo, antes de que copie el enlace y lo mande (evaluación del 13-sep).
  const { studio, planesTarifa } = useStudio();
  // El embudo del alta es el de la propietaria (app/api/alta/paso solo la
  // admite a ella): quien no lo es no manda nada que se vaya a rechazar.
  const esPropietaria = useRol() === 'PROPIETARIO';
  const aviso = studio ? avisoVentaOnline({
    stripeAccountId: studio.stripeAccountId,
    reservaExigirPlan: studio.reservaExigirPlan ?? true,
    numPlanesActivos: planesTarifa.filter(p => p.activo).length,
  }) : null;

  // ⚠️ Pero ese aviso es una heurística del cliente, y se equivocaba justo en el
  // caso que más duele: con Stripe conectado y la verificación a medias
  // (`charges_enabled` en false) callaba, y la pantalla prometía «cualquiera con
  // este enlace puede reservar» mientras el «¿Lista para abrir?» de Inicio decía
  // que Stripe aún no cobra. Quien lo decide ahora es el servidor, con las mismas
  // reglas que la reserva de verdad; el aviso del cliente solo se queda mientras
  // contesta, o si no ha podido comprobarlo.
  const [srv, setSrv] = useState<RespuestaPuedeReservar | null>(veredicto ?? null);
  const traeVeredicto = veredicto !== undefined;
  useEffect(() => {
    if (traeVeredicto) return;
    const ctrl = new AbortController();
    authHeader()
      .then(headers => fetch('/api/onboarding/puede-reservar', { headers, signal: ctrl.signal }))
      .then(async res => leerRespuestaPuedeReservar(res.ok ? await res.json().catch(() => null) : null))
      .catch(() => leerRespuestaPuedeReservar(null))
      .then(r => { if (!ctrl.signal.aborted) setSrv(r); });
    return () => ctrl.abort();
  }, [traeVeredicto]);
  const avisoFinal = avisoListo(srv, aviso);
  const finalParrafo = finalDelParrafo(srv, aviso);
  // El paso 7 del alta: el titular nombra la clase. «Publicada» salvo con la
  // página oculta, donde no la ve nadie de fuera (lo explica el aviso).
  const comprobado = srv?.estado === 'SI';
  const oculta = srv?.estado === 'NO' && srv.motivo === 'PAGINA_OCULTA';
  const titular = nombreClase
    ? `¡Listo! Tu clase «${nombreClase}» ya está ${oculta ? 'creada' : 'publicada'}`
    : 'Tu estudio ya puede recibir reservas';

  // Tenti celebra ('hecho') con TRES condiciones y ninguna menos: que el
  // servidor haya dicho que una alumna nueva puede reservar (la MISMA respuesta
  // que pinta la promesa de al lado), que su app ya se vea dentro del móvil
  // y que haya pasado un momento, para que primero se lea el titular. Con 'NO',
  // sin comprobar o con la red caída se queda en reposo: lo que no se ha podido
  // confirmar no se celebra.
  const [maduro, setMaduro] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMaduro(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const estadoTenti = srv?.estado === 'SI' && cargada && maduro ? 'hecho' : 'reposo';

  // Cierra con Escape, como cualquier pantalla que tapa el panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSeguir(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSeguir]);

  // `window.location.origin` y no una variable de entorno: el enlace que se
  // copia tiene que ser el del sitio donde ESTÁ, no el de producción cuando
  // alguien lo prueba en otro dominio.
  const url = typeof window === 'undefined' ? rutaApp(slug) : `${window.location.origin}${rutaApp(slug)}`;

  const copiar = useCallback(async () => {
    setError(null);
    if (await copiarAlPortapapeles(url)) {
      capturarEvento('enlace_compartido', { via: 'copiar' });
      if (esPropietaria) apuntarEnlaceCompartido('copiar');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
      return;
    }
    // ⚠️ Sin feedback falso de éxito: el portapapeles falla de verdad en
    // Safari fuera de un gesto y en contextos no seguros, y decir «Copiado»
    // con el portapapeles vacío es peor que no decir nada.
    setError('No hemos podido copiar. Selecciona el enlace y cópialo a mano.');
  }, [url, esPropietaria]);

  // La hoja nativa de compartir (WhatsApp, Instagram, Mensajes…) solo donde es
  // lo natural: un móvil o una tableta. En escritorio existe a medias y un
  // botón «Compartir» que abre un menú raro es peor que copiar. Este componente
  // solo se pinta en el navegador (va por portal), así que no hay SSR aquí.
  const puedeCompartirNativo = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const compartir = useCallback(async () => {
    setError(null);
    try {
      await navigator.share({
        title: nombreEstudio,
        text: `¡Ya tienes la app de ${nombreEstudio}! Entra con tu email y reserva tus clases.`,
        url,
      });
      capturarEvento('enlace_compartido', { via: 'nativo' });
      if (esPropietaria) apuntarEnlaceCompartido('compartir');
    } catch (e) {
      // Cerrar la hoja sin elegir nada NO es un fallo, y no cuenta como compartido.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('No hemos podido abrir el menú de compartir. Copia el enlace y pégalo donde quieras.');
    }
  }, [url, nombreEstudio, esPropietaria]);

  const textoWhatsApp = encodeURIComponent(
    `¡Ya tienes la app de ${nombreEstudio}! Entra aquí con tu email y reserva tus clases: ${url}`,
  );

  return (
    // ⚠️ A PANTALLA COMPLETA, y por PORTAL al anfitrión del panel.
    //
    // Primero se montó como un bloque más de la rejilla, y en el navegador se
    // veía por qué está mal: el titular «Tu estudio ya puede recibir reservas»
    // quedaba fuera de vista porque el contenedor conservaba el scroll de la
    // pantalla anterior, y justo encima seguían las tarjetas del calendario
    // diciendo «CLASES 0 · OCUPACIÓN MEDIA 0 %». La frase más importante del
    // onboarding, escondida y contradicha por los números de al lado.
    //
    // Esto es un momento, no un panel: ocupa la pantalla como las de valor, y
    // se sale al calendario cuando ella quiere.
    //
    // ⚠️ Y va por PORTAL, no con `position: fixed` a secas. La animación de
    // entrada del panel (`.panel-page-in`) aplica un `transform` al contenedor
    // de la página, y un ancestro con `transform` convierte a cualquier
    // descendiente `fixed` en relativo A ÉL: la pantalla «completa» se quedaba
    // dibujada dentro del hueco del calendario, debajo de los KPIs, con su
    // titular fuera de vista. Ya pasó con los drawers del panel.
    //
    // ⚠️ Al anfitrión del panel (`anfitrionPortal()`), NUNCA a <body>: <body>
    // queda fuera del contenedor que lleva `.dark`, y en modo oscuro este
    // momento se pintaba en claro. Era el único componente del panel que lo
    // hacía, y la guardia (lib/panel-portal.test.ts) no lo veía porque su regex
    // se cortaba en el primer `)`. El marco del móvil sigue el tema; lo de dentro
    // es la app de la alumna, que es marca blanca y va en claro.
    //
    // ⚠️ `grid-cols-[minmax(0,1fr)]`, aquí y en la rejilla de abajo, y no un
    // `grid` a secas: la columna implícita es `auto` y crece hasta el ancho
    // mínimo de su contenido, que es el enlace entero sin cortar. En un móvil de
    // 390 px la pantalla medía 444: el titular salía cortado y el enlace no se
    // truncaba — justo en el móvil, que es donde sale «Compartir mi enlace».
    createPortal(
    // ⚠️ Con el QR (`conQr`, el paso 7 del alta), z-50 y no z-[60]: el diálogo
    // del cartel (`BotonQr`) es un Dialog de z-50 que se monta DESPUÉS en el
    // mismo anfitrión, y a z-[60] se abría por debajo de esta pantalla, sin
    // verse. El Calendario no pasa `conQr` y sigue como estaba.
    <div className={`fixed inset-0 ${conQr ? 'z-50' : 'z-[60]'} grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-background`}>
      <div className="mx-auto w-full max-w-[820px] px-5 py-10 sm:py-14">
      <div className="text-center">
        {/* Caja FIJA de 80×80, con Tenti o con el Check: que llegue el chunk, o
            que no llegue, no mueve el titular. Para otros roles, el Check de
            siempre (lo decide TentiDiferido, no esta pantalla). */}
        <div className="mx-auto mb-2 grid size-20 place-items-center">
          <TentiDiferido estado={estadoTenti} tamano={80} sigueCursor reserva={<CuadroListo />} />
        </div>
        <h2 className="text-[24px] font-bold tracking-tight text-foreground sm:text-[28px]">
          {titular}
        </h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
          {clasesCreadas > 0 && (
            <>Has dejado <strong className="text-foreground">{clasesCreadas === 1 ? '1 clase' : `${clasesCreadas} clases`}</strong> {clasesCreadas === 1 ? 'programada' : 'programadas'}. </>
          )}
          {/* La promesa, solo cuando es verdad (`finalDelParrafo`): con un no se
              queda en «abierta», salvo con la página oculta, que lo cuenta el
              aviso; y mientras el servidor contesta, ni lo uno ni lo otro. En el
              paso 7 del alta, con el SÍ, la frase de la maqueta. */}
          {nombreClase && comprobado
            ? 'Tus alumnas entran con su email, sin descargarse nada, y la reservan desde el móvil. Mándales el enlace de tu app: así llega tu primera reserva.'
            : finalParrafo}
        </p>
        {nombreClase && comprobado && (
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground" data-testid="comprobado-reservar">
            <CircleCheck size={16} className="text-success" aria-hidden />
            Comprobado: una alumna nueva puede reservar
          </p>
        )}
        {avisoFinal && (
          <p className="mx-auto mt-3 flex max-w-[560px] items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-left text-[13px] leading-snug text-foreground">
            <AlertTriangle size={15} className="mt-[1px] shrink-0 text-warning" aria-hidden />
            <span>{avisoFinal}</span>
          </p>
        )}
      </div>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-start">
        {/* El enlace, primero: es lo único que tiene que hacer ahora. */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            El enlace de tu app
          </p>
          {puedeCompartirNativo && (
            <button
              type="button"
              onClick={() => void compartir()}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[14.5px] font-bold text-brand-foreground transition-all hover:brightness-95"
            >
              <Share2 size={16} aria-hidden />
              Compartir mi enlace
            </button>
          )}
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={url}>{url}</span>
            <button
              type="button"
              onClick={copiar}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-bold text-brand-foreground transition-all hover:brightness-95"
            >
              {copiado ? <Check size={13} strokeWidth={3} aria-hidden /> : <Copy size={13} aria-hidden />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12px] leading-snug text-destructive">{error}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* wa.me y no la Web Share API: en escritorio no existe en medio
                navegador, y WhatsApp es donde una propietaria de estudio ya
                tiene el grupo de sus alumnas. */}
            <a
              href={`https://wa.me/?text=${textoWhatsApp}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                capturarEvento('enlace_compartido', { via: 'whatsapp' });
                if (esPropietaria) apuntarEnlaceCompartido('whatsapp');
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
            >
              <MessageCircle size={14} aria-hidden />
              Mandarlo por WhatsApp
            </a>
            <a
              href={rutaApp(slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
            >
              <ExternalLink size={14} aria-hidden />
              Abrir mi app
            </a>
          </div>

          {conQr && (
            <div className="mt-3">
              <BotonQr
                destino="app"
                url={url}
                slug={slug}
                estudio={nombreEstudio}
                nombreEnlace="App de tus alumnas"
                onDescargado={() => { if (esPropietaria) apuntarEnlaceCompartido('qr'); }}
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground">Imprímelo para recepción: al escanearlo, se abre la app de tus alumnas.</p>
            </div>
          )}

          <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
            Pégalo en tu Instagram, en el grupo de WhatsApp o donde ya hablas con tus alumnas.
            Entran con su email y un código, sin descargarse nada.
          </p>
          {/* Solo si el servidor lo ha mandado de verdad: sale una vez y con el SÍ. */}
          {correoEnviado && comprobado && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground" data-testid="aviso-correo-reservas">
              Te lo mandamos también por correo, con el QR, para tenerlo a mano.
            </p>
          )}

          <button
            type="button"
            onClick={onSeguir}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[14.5px] font-bold text-brand-foreground transition-all hover:brightness-95"
          >
            {textoSeguir}
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
          </button>
          {errorSeguir && (
            <p role="alert" className="mt-2 text-[12.5px] leading-snug text-destructive">{errorSeguir}</p>
          )}
        </div>

        {/* Su app DE VERDAD, no una ilustración. */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Así lo ve tu alumna
          </p>
          {/* ⚠️ A ancho de móvil real (402 pt) y encogida con `scale`: un iframe de
              240 px sería un viewport que no existe en ningún teléfono. Es el marco
              «solo mirar»: se toca, pero no reserva ni crea ninguna cuenta. */}
          <AppEnVivo
            slug={slug}
            css=""
            recarga={0}
            escala={ESCALA_MOVIL}
            onCargada={alCargar}
            pie={{ cargando: 'Cargando tu app…', cargada: 'Es tu app real, no un ejemplo. Tócala: aquí no se reserva nada.' }}
          />
        </div>
        </div>
      </div>
    </div>,
    anfitrionPortal(),
    )
  );
}

// El icono de siempre: lo que ve quien no es la propietaria, y lo que queda si
// Tenti no se puede pintar (el chunk no llega o no hay canvas 2D).
function CuadroListo() {
  return (
    <span className="grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
      <Check size={24} strokeWidth={3} aria-hidden />
    </span>
  );
}
