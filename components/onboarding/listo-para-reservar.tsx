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
//   2. Su página DE VERDAD, dentro de un móvil. No una ilustración: el
//      iframe carga `/reservar/[slug]`, el mismo sitio al que va a entrar su
//      alumna. Si algo no está bien, lo ve aquí y no cuando ya lo ha mandado.
//   3. El enlace, listo para pegar donde ella ya habla con sus alumnas.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowRight, Check, Copy, ExternalLink, MessageCircle } from 'lucide-react';
import { copiarAlPortapapeles } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { avisoVentaOnline } from '@/lib/onboarding';

// El móvil de la vista previa. Se dibuja a tamaño de teléfono de verdad
// (iPhone 14/15, el más común entre las alumnas) y se encoge para caber.
const ANCHO_MOVIL = 390;
const ALTO_MOVIL = 720;
const ESCALA = 0.62;
const ANCHO_MARCO = Math.round(ANCHO_MOVIL * ESCALA);
const ALTO_MARCO = Math.round(ALTO_MOVIL * ESCALA);

export function ListoParaReservar({
  slug,
  nombreEstudio,
  clasesCreadas,
  onSeguir,
}: {
  slug: string;
  nombreEstudio: string;
  clasesCreadas: number;
  onSeguir: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [cargada, setCargada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La frase grande dice «ya puede recibir reservas». Si una alumna nueva no va
  // a poder (exige bono, hay tarifas activas y no hay Stripe), se dice aquí
  // mismo, antes de que copie el enlace y lo mande (evaluación del 13-sep).
  const { studio, planesTarifa } = useStudio();
  const aviso = studio ? avisoVentaOnline({
    stripeAccountId: studio.stripeAccountId,
    reservaExigirPlan: studio.reservaExigirPlan ?? true,
    numPlanesActivos: planesTarifa.filter(p => p.activo).length,
  }) : null;
  // Cierra con Escape, como cualquier pantalla que tapa el panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSeguir(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSeguir]);

  // `window.location.origin` y no una variable de entorno: el enlace que se
  // copia tiene que ser el del sitio donde ESTÁ, no el de producción cuando
  // alguien lo prueba en otro dominio.
  const url = typeof window === 'undefined' ? `/reservar/${slug}` : `${window.location.origin}/reservar/${slug}`;

  const copiar = useCallback(async () => {
    setError(null);
    if (await copiarAlPortapapeles(url)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
      return;
    }
    // ⚠️ Sin feedback falso de éxito: el portapapeles falla de verdad en
    // Safari fuera de un gesto y en contextos no seguros, y decir «Copiado»
    // con el portapapeles vacío es peor que no decir nada.
    setError('No hemos podido copiar. Selecciona el enlace y cópialo a mano.');
  }, [url]);

  const textoWhatsApp = encodeURIComponent(
    `¡Ya puedes reservar tus clases en ${nombreEstudio}! Entra aquí y elige la que quieras: ${url}`,
  );

  return (
    // ⚠️ A PANTALLA COMPLETA, y por PORTAL a <body>.
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
    createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[820px] px-5 py-10 sm:py-14">
      <div className="text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand text-brand-foreground">
          <Check size={24} strokeWidth={3} aria-hidden />
        </span>
        <h2 className="text-[24px] font-bold tracking-tight text-foreground sm:text-[28px]">
          Tu estudio ya puede recibir reservas
        </h2>
        <p className="mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
          {clasesCreadas > 0
            ? <>Has dejado <strong className="text-foreground">{clasesCreadas} clases</strong> programadas. Tu página está abierta: cualquiera con este enlace puede reservar.</>
            : <>Tu página está abierta: cualquiera con este enlace puede reservar.</>}
        </p>
        {aviso && (
          <p className="mx-auto mt-3 flex max-w-[560px] items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-left text-[13px] leading-snug text-foreground">
            <AlertTriangle size={15} className="mt-[1px] shrink-0 text-warning" aria-hidden />
            <span>{aviso}</span>
          </p>
        )}
      </div>

      <div className="mt-7 grid gap-6 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-start">
        {/* El enlace, primero: es lo único que tiene que hacer ahora. */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Tu enlace de reservas
          </p>
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
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
            >
              <MessageCircle size={14} aria-hidden />
              Mandarlo por WhatsApp
            </a>
            <a
              href={`/reservar/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-medio hover:underline"
            >
              <ExternalLink size={14} aria-hidden />
              Abrirla en grande
            </a>
          </div>

          <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
            Pégalo en tu Instagram, en el grupo de WhatsApp o donde ya hablas con tus alumnas.
            No hace falta que se descarguen nada.
          </p>

          <button
            type="button"
            onClick={onSeguir}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-[14.5px] font-bold text-brand-foreground transition-all hover:brightness-95"
          >
            Ver mi calendario
            <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        {/* Su página DE VERDAD, no una ilustración. */}
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Así lo ve tu alumna
          </p>
          <div className="relative mx-auto overflow-hidden rounded-[26px] border-[6px] border-foreground/85 bg-card shadow-xl"
               style={{ width: ANCHO_MARCO, height: ALTO_MARCO }}>
            {/* Mientras carga, un esqueleto — nunca un rectángulo vacío, que es
                justo lo que parece «no funciona». */}
            {!cargada && (
              <div className="absolute inset-0 animate-pulse bg-muted/50" aria-hidden />
            )}
            <iframe
              src={`/reservar/${slug}`}
              title={`Página de reservas de ${nombreEstudio}`}
              onLoad={() => setCargada(true)}
              // `loading="lazy"` no: esto es lo que se ha venido a ver.
              //
              // ⚠️ Se renderiza a ANCHO DE MÓVIL REAL y se encoge con `scale`,
              // en vez de darle un iframe de 240 px. Un iframe de 240 px es un
              // viewport de 240 px: la página de reservas entra en su layout
              // más estrecho, que no existe en ningún teléfono, y lo que se
              // enseña como «así lo ve tu alumna» no es lo que ve nadie.
              style={{
                width: ANCHO_MOVIL,
                height: ALTO_MOVIL,
                transform: `scale(${ESCALA})`,
                transformOrigin: 'top left',
              }}
              className="absolute left-0 top-0 border-0"
            />
          </div>
          <p className="mt-2 text-center text-[11.5px] text-muted-foreground">
            Es tu página real, no un ejemplo.
          </p>
        </div>
        </div>
      </div>
    </div>,
    document.body,
    )
  );
}
