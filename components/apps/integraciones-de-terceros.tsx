'use client';

// «Integraciones de terceros» (12-nov-2026, con el listón de la de Momence): a la
// izquierda cada herramienta con su estado de un vistazo; a la derecha su ficha,
// con lo que hace y su configuración dentro, sin cajones.
//
// No hay lógica nueva de conexión: cada ficha pinta los MISMOS componentes de
// Configuración › Integraciones (`conexiones.tsx`, `cobro-con-tarjeta.tsx`…) con
// el mismo hook (`useConexiones`), así que hay una sola lectura de cada estado y
// un solo sitio donde se cambia. Configuración sigue enseñándolas en filas.
//
// Quién lo ve: propietaria y gerencia. Pero `integraciones` (con las credenciales
// cifradas) solo la lee la propietaria: la gerencia ve el ESTADO de cada conexión
// —que le llega aparte (`integracionActiva`)— y nada que configurar. El servidor
// vuelve a exigirlo en cada ruta; esto solo evita enseñar un botón que no puede
// pulsar ni un «no conectada» falso por no poder leer la fila.

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Info } from 'lucide-react';
import { useRol } from '@/lib/permisos';
import { useStudio } from '@/lib/studio-context';
import { useToast, Toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils';
import { PESTANAS_INTEGRACION, esPestanaIntegracion, type PestanaIntegracion } from '@/lib/apps/catalogo';
import type { TipoIntegracion } from '@/lib/types';
import { useConexiones } from '@/components/configuracion/secciones/seccion-conexiones';
import { GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import {
  AccionesZoom, DetalleConexionConClave, DetalleConexionOAuth, DetalleZapier, FilaConexionConClave,
  FilaConexionOAuth, FilaZapier, SincronizarGoogleCalendar, SincronizarKlaviyo,
} from '@/components/configuracion/conexiones';
import { DetalleCobroConTarjeta, FilaCobroConTarjeta } from '@/components/configuracion/cobro-con-tarjeta';
import { DetalleDatafono, FilaDatafono } from '@/components/configuracion/datafono';
import { ConectarDatafono } from '@/components/pos/conectar-datafono';
import { DetalleWhatsapp, FilaWhatsapp } from '@/components/configuracion/canales-comunicacion';
import { DetallePlataformasExternas, FilasPlataformas } from '@/components/configuracion/plataformas-externas';
import {
  GoogleCalendarIcon, KisiIcon, KlaviyoIcon, MailchimpIcon, ZapierIcon, ZoomIcon,
} from '@/components/icons/brand-icons';
import { IconoApp } from './icono-app';
import { VISUAL, VISUAL_POR_DEFECTO } from './visual-apps';

const TIPO: Partial<Record<PestanaIntegracion, TipoIntegracion>> = {
  stripe: 'STRIPE', whatsapp: 'WHATSAPP', 'google-calendar': 'GOOGLE_CALENDAR', zoom: 'ZOOM', kisi: 'KISI',
  klaviyo: 'KLAVIYO', mailchimp: 'MAILCHIMP', zapier: 'ZAPIER', classpass: 'CLASSPASS',
  'urban-sports-club': 'URBAN_SPORTS_CLUB', wellhub: 'WELLHUB',
};

const PLATAFORMA_DE = {
  classpass: 'CLASSPASS', 'urban-sports-club': 'URBAN_SPORTS_CLUB', wellhub: 'WELLHUB',
} as const;

const QUE_HACE: Record<PestanaIntegracion, string> = {
  stripe: 'Cobra bonos y cuotas con tarjeta en tu propia cuenta de Stripe: el dinero entra directo en ella.',
  datafono: 'Mandas el importe desde la Caja y la venta queda cobrada sola. Hoy, el lector de Stripe; el de tu banco, más adelante.',
  whatsapp: 'Recordatorios y avisos desde tu número de WhatsApp Business.',
  'google-calendar': 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.',
  zoom: 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.',
  kisi: 'Abre la puerta de tu estudio sola con cada check-in de tus clientes.',
  klaviyo: 'Lleva a Klaviyo los clientes que aceptaron recibir marketing, cada vez que pulsas «Sincronizar ahora».',
  mailchimp: 'Lleva a tu audiencia de Mailchimp los clientes que aceptaron recibir marketing, al pulsar «Sincronizar ahora».',
  classpass: 'Si vendes plazas en ClassPass, apunta sus reservas en la clase para no vender dos veces el mismo hueco.',
  'urban-sports-club': 'Si vendes plazas en Urban Sports Club, apunta sus reservas en la clase para no vender dos veces el mismo hueco.',
  wellhub: 'Si vendes plazas en Wellhub, apunta sus reservas en la clase para no vender dos veces el mismo hueco.',
  zapier: 'Conecta Tentare con miles de apps. La conexión se autoriza desde Zapier, no desde aquí.',
};

export function IntegracionesDeTerceros() {
  const rol = useRol();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { integracionActiva } = useStudio();
  const pedida = params.get('pestana');
  const pestana: PestanaIntegracion = esPestanaIntegracion(pedida) ? pedida : 'stripe';
  const toast = useToast();
  const actual = PESTANAS_INTEGRACION.find(p => p.id === pestana)!;
  const v = VISUAL[pestana] ?? VISUAL_POR_DEFECTO;
  const tipo = TIPO[pestana];
  const conectada = tipo ? integracionActiva(tipo) : null;

  function elegir(id: PestanaIntegracion) {
    router.replace(`${pathname}?pestana=${id}`, { scroll: false });
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-5" data-testid="integraciones-de-terceros">
      <PageHeader title="Integraciones de terceros" />
      <p className="flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13.5px] text-muted-foreground">
        <Info size={16} className="mt-px shrink-0" aria-hidden />
        <span className="text-pretty">Cualquier cambio en una integración afecta a todo tu estudio, no solo a tu usuario.</span>
      </p>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-label="Integraciones"
          aria-orientation="vertical"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {PESTANAS_INTEGRACION.map((p, i) => {
            const vp = VISUAL[p.id] ?? VISUAL_POR_DEFECTO;
            const t = TIPO[p.id];
            const on = pestana === p.id;
            const estado = t ? integracionActiva(t) : null;
            const rotulo = i === 0 || PESTANAS_INTEGRACION[i - 1].grupo !== p.grupo ? p.grupo : null;
            return (
              <div key={p.id} className="contents">
                {rotulo && <p className="hidden px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground first:pt-0 lg:block">{rotulo}</p>}
                <button
                  role="tab"
                  type="button"
                  id={`pestana-${p.id}`}
                  aria-selected={on}
                  aria-controls="panel-integracion"
                  onClick={() => elegir(p.id)}
                  className={cn(
                    'zona-tactil flex shrink-0 items-center gap-3 rounded-2xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full',
                    on ? 'border-[color:color-mix(in_srgb,var(--t-blue-500)_35%,var(--border))] bg-card shadow-t-card' : 'border-transparent hover:bg-muted/70',
                  )}
                >
                  <IconoApp tamano="sm" tono={vp.tono} glifo={vp.glifo} logo={vp.logo} />
                  <span className="min-w-0 flex-1 whitespace-nowrap lg:whitespace-normal">
                    <span className={cn('block text-[14px] font-medium leading-tight', on ? 'text-foreground' : 'text-foreground/85')}>{p.label}</span>
                    {estado !== null && (
                      <span className="mt-0.5 hidden items-center gap-1.5 text-[12px] text-muted-foreground lg:flex">
                        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: estado ? 'var(--success)' : 'var(--border)' }} />
                        {estado ? 'Conectada' : 'Sin conectar'}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <section id="panel-integracion" role="tabpanel" aria-labelledby={`pestana-${pestana}`} className="min-w-0 space-y-5">
          <header className="flex items-start gap-4 rounded-[22px] border border-border bg-card p-5 sm:p-6">
            <IconoApp tamano="lg" tono={v.tono} glifo={v.glifo} logo={v.logo} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.01em] text-foreground">{actual.label}</h2>
                {conectada !== null && (
                  <span
                    className="inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold"
                    style={conectada
                      ? { color: 'var(--success)', backgroundColor: 'color-mix(in srgb, var(--success) 13%, var(--card))' }
                      : { color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)' }}
                  >
                    {conectada ? 'Conectada' : 'Sin conectar'}
                  </span>
                )}
              </div>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-[1.55] text-muted-foreground text-pretty" data-testid="que-hace">{QUE_HACE[pestana]}</p>
            </div>
          </header>
          {rol === 'PROPIETARIO'
            ? <ContenidoDePropietaria pestana={pestana} showToast={toast.show} />
            : <SoloEstado conectada={conectada} />}
        </section>
      </div>

      {toast.message && <Toast message={toast.message} action={toast.action} variant={toast.variant} onDismiss={toast.dismiss} />}
    </div>
  );
}

/** Gerencia: el estado de cada conexión, sin credenciales ni botones que el servidor le negaría. */
function SoloEstado({ conectada }: { conectada: boolean | null }) {
  return (
    <div className="rounded-[22px] border border-dashed border-border bg-card px-5 py-5" data-testid="solo-estado">
      {conectada !== null && (
        <p className="text-[14px] font-semibold text-foreground">{conectada ? 'Conectada' : 'Sin conectar'}</p>
      )}
      <p className={cn('text-[13.5px] text-muted-foreground text-pretty', conectada !== null && 'mt-1')}>
        Conectar, cambiar o quitar una integración es cosa de la propietaria: guarda claves y permisos de tu estudio.
      </p>
    </div>
  );
}

function ContenidoDePropietaria({ pestana, showToast }: { pestana: PestanaIntegracion; showToast: (m: string) => void }) {
  const c = useConexiones(showToast);
  const { stripe, datafono, whatsapp, google, zoom, klaviyo, kisi, mailchimp, apps, zapier } = c;
  const props = { showToast, onGuardado: (t: string) => showToast(t) };
  const sinAccion = () => {};

  switch (pestana) {
    case 'stripe':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaCobroConTarjeta c={stripe} onAbrir={sinAccion} /></GrupoFilas>
          {stripe.conectado && <DetalleCobroConTarjeta c={stripe} onGuardado={props.onGuardado} />}
        </>
      );
    case 'datafono':
      return (
        <>
          <GrupoFilas titulo="Estado">
            <FilaDatafono d={datafono} stripeConectado={stripe.conectado} onAbrir={sinAccion} onConectar={() => c.setConectandoDatafono('inicio')} />
          </GrupoFilas>
          {c.datafonoConectado && (
            <DetalleDatafono d={datafono} onCambiar={() => c.setConectandoDatafono('inicio')} onGuardado={props.onGuardado} />
          )}
          {c.conectandoDatafono && (
            <ConectarDatafono
              direccionEstudio={datafono.estado?.direccion ?? null}
              esTest={datafono.estado?.test ?? false}
              textoVolver="Volver"
              textoFinal="Hecho"
              stripeConectado={stripe.conectado}
              sumup={datafono.estado?.sumup}
              pasoInicial={c.conectandoDatafono === 'codigo-sumup' ? 'codigo-sumup' : undefined}
              onConectado={datafono.ponerLector}
              onCerrar={() => c.setConectandoDatafono(false)}
            />
          )}
        </>
      );
    case 'whatsapp':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaWhatsapp w={whatsapp} onAbrir={sinAccion} /></GrupoFilas>
          {(whatsapp.conectado || !whatsapp.conMeta) && <DetalleWhatsapp w={whatsapp} {...props} />}
          {whatsapp.script}
        </>
      );
    case 'google-calendar':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaConexionOAuth c={google} logo={<GoogleCalendarIcon size={20} />} onAbrir={sinAccion} /></GrupoFilas>
          {google.conectado && <DetalleConexionOAuth c={google} onGuardado={props.onGuardado}><SincronizarGoogleCalendar /></DetalleConexionOAuth>}
        </>
      );
    case 'zoom':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaConexionOAuth c={zoom} logo={<ZoomIcon size={36} />} onAbrir={sinAccion} /></GrupoFilas>
          {zoom.conectado && <DetalleConexionOAuth c={zoom} onGuardado={props.onGuardado}><AccionesZoom /></DetalleConexionOAuth>}
        </>
      );
    case 'klaviyo':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaConexionOAuth c={klaviyo} logo={<KlaviyoIcon size={20} />} onAbrir={sinAccion} /></GrupoFilas>
          {klaviyo.conectado && <DetalleConexionOAuth c={klaviyo} onGuardado={props.onGuardado}><SincronizarKlaviyo /></DetalleConexionOAuth>}
        </>
      );
    // Las de clave se conectan pegándola: su configuración se enseña siempre.
    case 'kisi':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaConexionConClave c={kisi} logo={<KisiIcon size={36} />} onAbrir={sinAccion} /></GrupoFilas>
          <DetalleConexionConClave c={kisi} onGuardado={props.onGuardado} />
        </>
      );
    case 'mailchimp':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaConexionConClave c={mailchimp} logo={<MailchimpIcon size={36} />} onAbrir={sinAccion} /></GrupoFilas>
          <DetalleConexionConClave c={mailchimp} onGuardado={props.onGuardado} />
        </>
      );
    case 'zapier':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilaZapier z={zapier} logo={<ZapierIcon size={36} />} onAbrir={sinAccion} /></GrupoFilas>
          {zapier.acceso && <DetalleZapier z={zapier} a={apps} onGuardado={props.onGuardado} />}
          <p className="text-[13.5px] text-muted-foreground">
            Las claves de API y las apps con acceso a tus datos se ven en{' '}
            <Link href="/apps/api" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
              la API de desarrollador <ArrowRight size={12} className="inline" aria-hidden />
            </Link>.
          </p>
        </>
      );
    case 'classpass':
    case 'urban-sports-club':
    case 'wellhub':
      return (
        <>
          <GrupoFilas titulo="Estado"><FilasPlataformas solo={PLATAFORMA_DE[pestana]} /></GrupoFilas>
          <DetallePlataformasExternas showToast={showToast} solo={PLATAFORMA_DE[pestana]} />
        </>
      );
  }
}
