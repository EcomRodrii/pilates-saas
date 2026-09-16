'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentType } from 'react';
import { Calendar as CalendarLinkIcon, Check, ChevronRight, Copy, ExternalLink, Globe, Link2, Smartphone } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { normalizarSlug, motivoSlugInvalido } from '@/lib/slug';
import { resumenDireccion } from '@/lib/configuracion/resumenes';
import { tarjetaPorId } from '@/lib/configuracion/secciones';
import { hrefCanal } from '@/lib/canales-estudio';
import type { DestinoQr } from '@/lib/qr/escaparate';
import { btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BotonQr } from '@/components/configuracion/dialogo-qr';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { IconoFila } from '@/components/configuracion/shell/fila-herramienta';
import { TituloFila, ValorFila } from '@/components/configuracion/shell/fila-ajuste';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

// ─────────────────────────────────────────────────────────────────────────────
// «Dirección y enlaces», en Mi app y mi web (15-sep, v2): una fila con la
// dirección corta de tu página y «Copiar», y un cajón con la dirección, que se
// cambia con «Guardar», y los enlaces que se comparten, cada uno con su código
// QR para imprimir (dialogo-qr.tsx).
//
// Son dos cosas DISTINTAS que se confundían bajo «portal»: la página de reservas
// (sin cuenta, para captar) y la app de tus alumnas (con cuenta, instalable).
//
// Aparecer en Tentare Network es un sí/no de su sección (FilaInterruptor).
// Los widgets tienen su pantalla (tab-api.tsx).
// ─────────────────────────────────────────────────────────────────────────────

const sinSuscripcion = () => () => {};

/** El origen de la app: `''` al pintar en el servidor y el de verdad en el navegador. */
export function useOrigen(): string {
  return useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => '');
}

/**
 * Copia y SOLO entonces dice «Copiado». `writeText` rechaza en Safari sin gesto
 * o sin permiso, y tres pantallas decían «Copiado» con el portapapeles vacío
 * (#994): `copiarAlPortapapeles` devuelve si de verdad se escribió. También lo
 * usa «La app de tus instructoras», en Mi equipo.
 */
export function BotonCopiar({ texto, que, showToast, compacto, className }: {
  texto: string;
  /** Lo que se copia, para el aviso y el nombre del botón: «El enlace de tu página». */
  que: string;
  showToast: (m: string) => void;
  /** En una fila estrecha, solo el icono: con la palabra, a 375 px la dirección se quedaba en «localhost:3217/r…». */
  compacto?: boolean;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  async function copiar() {
    if (!(await copiarAlPortapapeles(texto))) {
      showToast('No se ha podido copiar. Selecciona el enlace y cópialo a mano.');
      return;
    }
    setCopiado(true);
    showToast(`${que} copiado`);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => { void copiar(); }}
      aria-label={`Copiar ${que.charAt(0).toLowerCase()}${que.slice(1)}`}
      className={cn(btnSecondary, 'inline-flex shrink-0 items-center justify-center gap-1.5', compacto && 'px-3 @md/config:px-4', className)}
    >
      {copiado ? <Check size={14} className="text-success" aria-hidden /> : <Copy size={14} aria-hidden />}
      <span className={compacto ? 'hidden @md/config:inline' : undefined}>{copiado ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

/**
 * La fila: toca y abre su cajón; «Copiar», encima, copia la dirección. Son dos
 * botones hermanos —el de la fila ocupa todo el fondo— y no uno dentro de otro,
 * que un lector de pantalla no sabe anunciar.
 */
export function FilaDireccionYEnlaces({ onAbrir, showToast }: { onAbrir: () => void; showToast: (m: string) => void }) {
  const { studio, dataLoaded } = useStudio();
  const origen = useOrigen();
  const textoId = useId();
  const tarjeta = tarjetaPorId('direccion-y-enlaces');
  const slug = dataLoaded ? studio?.slug ?? null : null;
  return (
    <li className="relative flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
      <button
        id="direccion-y-enlaces"
        type="button"
        aria-haspopup="dialog"
        aria-labelledby={textoId}
        onClick={onAbrir}
        className="absolute inset-0 size-full scroll-mt-32 scroll-mb-32 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      />
      <span className="pointer-events-none shrink-0"><IconoFila icono={Link2} /></span>
      <span id={textoId} className="pointer-events-none min-w-0 flex-1">
        <TituloFila titulo={tarjeta.titulo} />
        <ValorFila valor={resumenDireccion({ slug, origen })} descripcion={tarjeta.frase} />
      </span>
      {slug && <BotonCopiar texto={`${origen}/reservar/${slug}`} que="El enlace de tu página" showToast={showToast} compacto className="relative z-10" />}
      <ChevronRight size={18} className="pointer-events-none shrink-0 text-muted-foreground" aria-hidden />
    </li>
  );
}

function EnlacePublico({ icono: Icono, titulo, detalle, url, que, abrir, qr, showToast }: {
  icono: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  titulo: string;
  detalle: string;
  url: string;
  que: string;
  abrir?: boolean;
  /** Su código QR para imprimir: a qué lleva, el nombre del estudio y la dirección para el archivo. */
  qr: { destino: DestinoQr; estudio: string; slug: string };
  showToast: (m: string) => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <span className="flex items-start gap-2.5">
        <Icono size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{titulo}</span>
          <span className="block text-sm text-muted-foreground text-pretty">{detalle}</span>
          <span className="mt-1 block select-all break-all text-sm text-foreground">{url}</span>
        </span>
      </span>
      <span className="flex flex-wrap gap-2 pl-[26px]">
        <BotonCopiar texto={url} que={que} showToast={showToast} />
        <BotonQr destino={qr.destino} url={url} slug={qr.slug} estudio={qr.estudio} nombreEnlace={titulo} />
        {abrir && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, 'inline-flex items-center gap-1.5')}>
            Abrir <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </span>
    </li>
  );
}

/**
 * El cajón. La dirección se generaba con el nombre al crear el estudio y no se
 * podía cambiar nunca más; ahora sí, y ANTES de guardar se dice que la anterior
 * sigue funcionando (0115): sin esa frase nadie con el QR ya impreso se atreve.
 */
export function DetalleDireccionYEnlaces({ showToast }: Pick<PropsFormularioCajon, 'showToast'>) {
  const { studio } = useStudio();
  const origen = useOrigen();
  const slug = studio?.slug ?? '';
  const estudio = studio?.nombre ?? '';
  // La MISMA normalización que el pie de su página pública: «miestudio.com» vale,
  // y lo que no resuelve a http(s) no se convierte en un QR que no lleva a nada.
  const web = hrefCanal('web', studio?.sitioWeb);
  const [valor, setValor] = useState(slug);
  // Si llega la dirección después de abrir, se pone si no se había tocado.
  const [slugVisto, setSlugVisto] = useState(slug);
  if (slug !== slugVisto) {
    setSlugVisto(slug);
    if (valor === slugVisto) setValor(slug);
  }
  const [redirigir, setRedirigir] = useState<string | null>(null);

  // Se recarga en vez de tocar el estado a mano: el enlace de la página se
  // deriva de `studio.slug` en todo el panel, y verlo con la dirección vieja
  // después de cambiarla es justo la confusión que esto venía a quitar. Va en un
  // efecto y no en el guardado: así la barra ya se ha ido y no pregunta
  // «¿salir sin guardar?» por algo que sí se ha guardado.
  useEffect(() => {
    if (redirigir) window.location.href = redirigir;
  }, [redirigir]);

  // La confirmación viaja en la URL: sobrevive a la recarga sin guardar nada.
  const hecho = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('direccion-anterior');

  if (!slug) {
    return <p className="pb-6 text-sm text-muted-foreground text-pretty">Tu estudio todavía no tiene dirección de reservas.</p>;
  }

  const propuesto = normalizarSlug(valor);
  // El aviso sale mientras se escribe y con la MISMA función que valida el
  // servidor: si no, se ve algo válido que luego se rechaza al guardar.
  const motivo = valor ? motivoSlugInvalido(propuesto) : null;
  const cambia = !!propuesto && propuesto !== slug && !redirigir;

  async function alGuardar(): Promise<string | null> {
    const res = await fetch('/api/estudio/direccion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ slug: propuesto }),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { error?: string; anterior?: string };
    if (!res.ok) return cuerpo.error ?? 'No se ha podido cambiar la dirección.';
    const anterior = encodeURIComponent(cuerpo.anterior ?? '');
    setRedirigir(`/configuracion?tab=web&direccion-anterior=${anterior}#direccion-y-enlaces`);
    return null;
  }

  return (
    <>
      <div className="flex flex-col gap-6 pb-6">
        {hecho && (
          <p role="status" className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground text-pretty">
            Hecho. <b>/reservar/{hecho}</b> sigue llevando aquí, así que lo que ya habías compartido sigue funcionando.
          </p>
        )}
        <Campo
          label="Dirección de tu página de reservas"
          error={motivo}
          ayuda={(
            <>
              {propuesto && propuesto !== valor && <>Quedará así: <b>/reservar/{propuesto}</b>. </>}
              La de ahora, <b>/reservar/{slug}</b>, seguirá funcionando: lo que ya has compartido no deja de servir.
            </>
          )}
        >
          {id => (
            <span className="flex items-center gap-1.5">
              <span className="shrink-0 text-sm text-muted-foreground">/reservar/</span>
              <input
                id={id}
                className={inputCls}
                value={valor}
                placeholder="mi-estudio"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!motivo}
                onChange={e => setValor(e.target.value)}
              />
            </span>
          )}
        </Campo>

        <div>
          <h3 className="text-sm font-semibold text-foreground">Tus enlaces</h3>
          <ul className="mt-1 flex flex-col divide-y divide-border">
            <EnlacePublico
              icono={CalendarLinkIcon}
              titulo="Página de reservas"
              detalle="Sin cuenta: cualquiera reserva una clase suelta. Para Instagram, la puerta o tus folletos."
              url={`${origen}/reservar/${slug}`}
              que="El enlace de tu página"
              abrir
              qr={{ destino: 'reservas', estudio, slug }}
              showToast={showToast}
            />
            {/* Sin sesión de alumna no lleva a nada útil: se copia para pasarlo, no se abre. */}
            <EnlacePublico
              icono={Smartphone}
              titulo="App de tus alumnas"
              detalle="Para alumnas ya dadas de alta: reservan, ven su bono y su progreso. Se instala en el móvil."
              url={`${origen}/portal/${slug}`}
              que="El enlace de la app"
              qr={{ destino: 'app', estudio, slug }}
              showToast={showToast}
            />
            {web ? (
              <EnlacePublico
                icono={Globe}
                titulo="Tu web"
                detalle="La que tienes en Contacto. Para quien quiere conocer el estudio antes de venir."
                url={web}
                que="El enlace de tu web"
                abrir
                qr={{ destino: 'web', estudio, slug }}
                showToast={showToast}
              />
            ) : (
              <li className="flex items-start gap-2.5 py-3">
                <Globe size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Tu web</span>
                  <span className="block text-sm text-muted-foreground text-pretty">
                    Si tienes web propia, añádela en Mi estudio → Contacto y aquí tendrás también su enlace y su código QR.
                  </span>
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
      <BarraGuardar
        seccion="web"
        cambios={cambia ? [tarjetaPorId('direccion-y-enlaces').titulo] : []}
        bloqueo={motivo ? 'Corrige la dirección para poder guardar.' : null}
        onGuardar={alGuardar}
        onDescartar={() => setValor(slug)}
      />
    </>
  );
}
