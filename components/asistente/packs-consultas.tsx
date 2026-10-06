'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import { cn, TZ_ESTUDIO } from '@/lib/utils';
import { PACKS_CONSULTAS, PACK_CADUCA_MESES, eurosDe, miles, precioPorConsulta, textoQuedan, type PackConsultas } from '@/lib/asistente/packs';

// Los packs de consultas de «Pregúntale a Tentare» en pantalla: la sección
// «Consultas de Tentare» de /suscripcion (uso del mes, packs vivos y comprar),
// la tarjeta que sale DENTRO del chat cuando se acaban, y el botón de comprar
// que comparten. Comprar solo abre el Checkout de Stripe: el pack lo crea el
// webhook cuando Stripe confirma el pago, y la vuelta solo LEE en qué quedó.
// Sin Tenti: es dinero.

export interface SaldoConPacks {
  enPrueba: boolean;
  cuota: number;
  usadas: number;
  disponibles: number;
  renuevaEl: string | null;
  packsQuedan?: number;
  packs?: { id: string; quedan: number; caducaEn: string }[];
  puedeComprar?: boolean;
}

type Desde = 'asistente' | 'suscripcion';

export async function comprarPack(unidades: PackConsultas['unidades'], desde: Desde): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/asistente/packs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ unidades, desde }),
    });
    const data = await res.json().catch(() => ({})) as { url?: string; error?: string };
    if (!res.ok || !data.url) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { url: data.url };
  } catch {
    return { error: 'No se ha podido conectar. Comprueba tu conexión y vuelve a intentarlo: no se ha cobrado nada.' };
  }
}

const fechaLarga = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ_ESTUDIO }) : null;
const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO }) : null;

/**
 * Los tres packs con su botón. Un clic abre Stripe (en la misma pestaña); si
 * algo falla, lo dice aquí mismo y no se cobra nada.
 */
export function PacksEnVenta({ desde, compacto = false, claseBoton }: { desde: Desde; compacto?: boolean; claseBoton: string }) {
  const [comprando, setComprando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const comprar = async (p: PackConsultas) => {
    if (comprando !== null) return;
    setError(null);
    setComprando(p.unidades);
    const r = await comprarPack(p.unidades, desde);
    if ('url' in r) { window.location.assign(r.url); return; }
    setError(r.error);
    setComprando(null);
  };
  return (
    <div data-packs-en-venta="">
      <ul className={cn('grid gap-2', compacto ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3 sm:gap-3')}>
        {PACKS_CONSULTAS.map(p => {
          const este = comprando === p.unidades;
          const etiqueta = `Comprar ${miles(p.unidades)} consultas por ${eurosDe(p)}`;
          return (
            <li key={p.unidades} data-pack={p.unidades}
              className={cn(
                'flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3',
                // En /suscripcion, a partir de tableta, tres tarjetas con el precio grande.
                !compacto && 'sm:flex-col sm:items-stretch sm:justify-start sm:p-4',
              )}
            >
              <div className="min-w-0">
                <p className="text-[14.5px] font-bold text-foreground">{miles(p.unidades)} consultas</p>
                <p className={cn('text-[12.5px] text-muted-foreground', !compacto && 'sm:hidden')}>{eurosDe(p)} · {precioPorConsulta(p)}</p>
                {!compacto && (
                  <div className="hidden sm:block">
                    <p className="mt-1 text-[24px] font-extrabold leading-none tracking-tight text-foreground">{eurosDe(p)}</p>
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">{precioPorConsulta(p)}</p>
                  </div>
                )}
              </div>
              <button
                type="button" onClick={() => void comprar(p)} disabled={comprando !== null}
                aria-label={etiqueta} aria-busy={este || undefined}
                className={cn(
                  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-bold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  !compacto && 'sm:mt-4 sm:w-full',
                  claseBoton,
                )}
              >
                {este && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                {este ? 'Abriendo el pago…' : 'Comprar'}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[12.5px] leading-snug text-muted-foreground text-pretty">
        Pago único con IVA incluido. Se gastan después de las de tu plan, mientras tengas un plan de Tentare, y caducan a los {PACK_CADUCA_MESES} meses.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13.5px] font-medium text-destructive" data-error-compra="">
          {error}
        </p>
      )}
    </div>
  );
}

/** Dentro del chat, cuando se acaban: comprar (propietaria) o pedírselo a ella (gerente). */
export function TarjetaSinConsultas({ puedeComprar }: { puedeComprar: boolean }) {
  return (
    <div data-testid="sin-consultas" className="mt-3 rounded-2xl bg-card p-4 ring-1 ring-black/[0.06] dark:ring-white/[0.08] sm:p-5">
      <p className="text-[15px] font-semibold text-foreground">¿Necesitas más consultas?</p>
      {puedeComprar ? (
        <>
          <p className="mt-1 text-[13.5px] text-muted-foreground text-pretty">Con un pack sigues preguntando ahora mismo.</p>
          <div className="mt-3.5">
            <PacksEnVenta desde="asistente" compacto claseBoton="bg-primary text-primary-foreground" />
          </div>
        </>
      ) : (
        <p className="mt-1 text-[13.5px] text-muted-foreground text-pretty">
          Pídeselo a la propietaria: puede comprar un pack de consultas desde Suscripción, y sirve para todo el equipo que usa Tentare.
        </p>
      )}
    </div>
  );
}

// ── /suscripcion · «Consultas de Tentare» ────────────────────────────────────

type EstadoCompra =
  | { estado: 'ACREDITADO'; unidades: number; caducaEn: string }
  | { estado: 'REEMBOLSADO'; unidades: number }
  | { estado: 'CONFIRMANDO' | 'PROCESANDO' | 'SIN_PAGAR' | 'DESCONOCIDO' };

const REINTENTOS = 10;
const ESPERA_MS = 3000;

/** Lo que trajo Stripe en la URL de vuelta (se lee una vez y se quita de la URL). */
function leerVuelta(): { pack: 'ok' | 'cancel'; sessionId: string | null; desde: string | null } | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const pack = q.get('pack');
  if (pack !== 'ok' && pack !== 'cancel') return null;
  return { pack, sessionId: q.get('session_id'), desde: q.get('desde') };
}

async function leerSaldoConPacks(): Promise<SaldoConPacks | 'no'> {
  try {
    const res = await fetch('/api/asistente/saldo', { headers: await authHeader(), cache: 'no-store' });
    const s = res.ok ? await res.json() as SaldoConPacks : null;
    return s && typeof s.disponibles === 'number' ? s : 'no';
  } catch { return 'no'; }
}

export function ConsultasDeTentare({ className }: { className?: string }) {
  const [saldo, setSaldo] = useState<SaldoConPacks | null | 'no'>(null);
  const [vuelta] = useState(leerVuelta);
  const [compra, setCompra] = useState<EstadoCompra | null>(null);
  const [agotado, setAgotado] = useState(false);
  const raiz = useRef<HTMLElement>(null);

  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    void leerSaldoConPacks().then(x => { if (vivo) setSaldo(x); });
    return () => { vivo = false; };
  }, [recarga]);

  // La vuelta del Checkout: se quita de la URL (recargar mañana no debe repetir
  // «confirmando tu pago») y se pregunta en qué quedó, un rato, sin felicitar a ciegas.
  useEffect(() => {
    if (!vuelta) return;
    window.history.replaceState(null, '', '/suscripcion#consultas');
    if (vuelta.pack !== 'ok' || !vuelta.sessionId) return;
    let vivo = true;
    let intentos = 0;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const preguntar = async () => {
      let e: EstadoCompra = { estado: 'DESCONOCIDO' };
      try {
        const res = await fetch(`/api/asistente/packs/estado?session_id=${encodeURIComponent(vuelta.sessionId!)}`, { headers: await authHeader(), cache: 'no-store' });
        if (res.ok) e = await res.json() as EstadoCompra;
      } catch { /* se queda en DESCONOCIDO */ }
      if (!vivo) return;
      setCompra(e);
      if (e.estado === 'ACREDITADO') { setRecarga(n => n + 1); return; }
      if (e.estado !== 'CONFIRMANDO') return;
      if (++intentos >= REINTENTOS) { setAgotado(true); return; }
      espera = setTimeout(preguntar, ESPERA_MS);
    };
    void preguntar();
    return () => { vivo = false; clearTimeout(espera); };
  }, [vuelta]);

  useEffect(() => {
    if (vuelta && saldo && saldo !== 'no') raiz.current?.scrollIntoView({ block: 'start' });
  }, [vuelta, saldo]);

  // Sin asistente (rol, interruptor, plan): la sección no existe.
  if (!saldo || saldo === 'no') return null;

  const pct = saldo.cuota > 0 ? Math.min(100, Math.round((saldo.usadas / saldo.cuota) * 100)) : 0;
  const packs = saldo.packs ?? [];
  const quedan = textoQuedan(saldo.disponibles, saldo);
  const volverAlChat = vuelta?.desde === 'asistente';

  return (
    <section id="consultas" ref={raiz} data-testid="consultas-tentare" aria-labelledby="consultas-titulo" className={cn('scroll-mt-6', className)}>
      <h2 id="consultas-titulo" className="text-[19px] font-extrabold tracking-tight text-foreground">Consultas de Tentare</h2>
      <p className="mt-1 max-w-xl text-[13.5px] text-muted-foreground text-pretty">
        Cada pregunta a «Pregúntale a Tentare» que mira los datos de tu estudio gasta una consulta. Charlar con él no gasta.
      </p>

      <div aria-live="polite">
        {vuelta?.pack === 'cancel' && (
          <Aviso>Has salido del pago sin terminarlo: no se ha cobrado nada.</Aviso>
        )}
        {vuelta?.pack === 'ok' && <AvisoCompra compra={compra} agotado={agotado} volverAlChat={volverAlChat} />}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[15px] font-bold text-foreground" data-testid="consultas-uso">
            {miles(saldo.usadas)} de {miles(saldo.cuota)} {saldo.enPrueba ? 'de tu prueba gratuita' : 'este mes'}
          </p>
          {quedan && <p className="text-[13.5px] text-muted-foreground" data-testid="consultas-quedan">{quedan}</p>}
        </div>
        <div
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-label="Consultas del plan usadas" aria-valuemin={0} aria-valuemax={saldo.cuota} aria-valuenow={Math.min(saldo.usadas, saldo.cuota)}
        >
          <div className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
        {saldo.renuevaEl && !saldo.enPrueba && (
          <p className="mt-2 text-[12.5px] text-muted-foreground">Las de tu plan vuelven el {fechaCorta(saldo.renuevaEl)}.</p>
        )}

        {packs.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tus packs</p>
            <ul className="mt-2 divide-y divide-border" data-testid="packs-vivos">
              {packs.map(p => (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-[13.5px]" data-pack-vivo="">
                  <span className="font-semibold text-foreground">Quedan {miles(p.quedan)} {p.quedan === 1 ? 'consulta' : 'consultas'}</span>
                  <span className="text-muted-foreground">caduca el {fechaLarga(p.caducaEn)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 border-t border-border pt-5">
          <p className="mb-3 text-[14px] font-bold text-foreground">Comprar más consultas</p>
          {saldo.puedeComprar ? (
            <PacksEnVenta desde="suscripcion" claseBoton="bg-brand text-brand-foreground hover:brightness-110" />
          ) : (
            <p className="rounded-xl bg-muted px-4 py-3 text-[13.5px] text-muted-foreground">
              Solo la propietaria puede comprar packs de consultas. Pídeselo a ella.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Aviso({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'bien' | 'atencion' }) {
  return (
    <div
      data-aviso-compra={tono}
      className={cn(
        'mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-[13.5px]',
        tono === 'bien' && 'border-success/25 bg-success/10 font-medium text-success',
        tono === 'atencion' && 'border-warning/25 bg-warning/10 text-warning',
        tono === 'neutro' && 'border-border bg-card text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}

function AvisoCompra({ compra, agotado, volverAlChat }: { compra: EstadoCompra | null; agotado: boolean; volverAlChat: boolean }) {
  const chat = volverAlChat ? <Link href="/asistente" className="ml-auto shrink-0 font-semibold underline underline-offset-2">Volver al chat</Link> : null;
  if (!compra || compra.estado === 'CONFIRMANDO') {
    if (agotado) {
      return (
        <Aviso tono="atencion">
          Stripe ha aceptado el pago, pero su confirmación todavía no nos ha llegado. Tus consultas aparecerán aquí en cuanto llegue; si en unos minutos no están, escríbenos a soporte@tentare.app.
        </Aviso>
      );
    }
    return (
      <Aviso>
        <Loader2 size={15} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Estamos confirmando tu pago con Stripe…
      </Aviso>
    );
  }
  if (compra.estado === 'ACREDITADO') {
    return (
      <Aviso tono="bien">
        <span>Listo: {miles(compra.unidades)} consultas más. Caducan el {fechaLarga(compra.caducaEn)}.</span>
        {chat}
      </Aviso>
    );
  }
  if (compra.estado === 'PROCESANDO') {
    return <Aviso>Tu pago se está procesando. Con algunos métodos (como el adeudo bancario) tarda unos días; las consultas aparecerán aquí cuando se confirme.</Aviso>;
  }
  if (compra.estado === 'SIN_PAGAR') return <Aviso>El pago no se completó: no se ha cobrado nada.</Aviso>;
  if (compra.estado === 'REEMBOLSADO') return <Aviso>Ese pack se ha reembolsado y ya no se puede usar.</Aviso>;
  return <Aviso tono="atencion">No hemos podido comprobar tu pago ahora. Si se ha cobrado, tus consultas aparecerán aquí en unos minutos.</Aviso>;
}
