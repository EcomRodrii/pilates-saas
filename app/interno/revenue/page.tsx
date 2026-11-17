'use client';

// «Revenue & Subscriptions» — las cifras del SaaS, con cada una diciendo QUÉ mide.
//
// Cuatro cosas distintas que se confunden y aquí no se mezclan:
//   · MRR / ARR  lo que se cobraría cada mes con lo vivo AHORA (Stripe en vivo). No es dinero recibido.
//   · Facturado  facturas emitidas en el periodo. Un anual cuenta UNA vez, entero, el día que se factura.
//   · Cobrado    lo que entró de verdad en el periodo (por fecha de pago). Bruto y neto de IVA.
//   · Movimientos de MRR  el «puente» entre dos MRR (nuevo, ampliación, reducción, baja): no son ingresos.
// Ninguna cifra sin procedencia: si Stripe no contesta, el MRR sale «—», nunca un 0.

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchRevenue, type RevenueInterno } from '@/lib/interno/client';

const eur = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`);
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' });

const PERIODOS = [
  { id: 'este_mes', texto: 'Este mes' }, { id: 'mes_pasado', texto: 'Mes pasado' }, { id: 'ultimos_3', texto: 'Últimos 3 meses' },
  { id: 'ultimos_12', texto: 'Últimos 12 meses' }, { id: 'este_ano', texto: 'Este año' }, { id: 'rango', texto: 'Personalizado' },
] as const;
const PLANES = [{ id: 'TODOS', texto: 'Todos los planes' }, { id: 'BASE', texto: 'Founding Studio' }, { id: 'ESTUDIO', texto: 'Estudio' }, { id: 'CADENA', texto: 'Cadena' }];
const NOMBRE_PLAN: Record<string, string> = { BASE: 'Founding Studio', ESTUDIO: 'Estudio', CADENA: 'Cadena', DESCONOCIDO: 'Plan desconocido', SIN_SUSCRIPCION: 'Sin suscripción' };

function Tarjeta({ titulo, valor, pie, acento }: { titulo: string; valor: string; pie: string; acento?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-[22px] sm:text-[26px] font-bold tabular-nums leading-none ${acento ? 'text-brand-medio' : 'text-foreground'}`}>{valor}</p>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>
    </div>
  );
}

function Fila({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px] last:border-0">
      <span className="text-foreground">{etiqueta}{nota ? <span className="text-muted-foreground"> · {nota}</span> : null}</span>
      <span className="tabular-nums font-semibold text-foreground">{valor}</span>
    </div>
  );
}

export default function RevenueInterno() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]['id']>('este_mes');
  const [plan, setPlan] = useState('TODOS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [d, setD] = useState<RevenueInterno | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (periodo === 'rango' && (!desde || !hasta)) return;
    setCargando(true);
    const consulta = new URLSearchParams({ plan, ...(periodo === 'rango' ? { desde, hasta } : { periodo }) }).toString();
    try { setD(await fetchRevenue(consulta)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setCargando(false); }
  }, [periodo, plan, desde, hasta]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!d) return <p className="text-[13.5px] text-muted-foreground">Leyendo el libro de billing y preguntando a Stripe…</p>;

  const { metricas: m, enVivo: v } = d;
  const mov = m.movimientosMrr;
  const control = 'rounded-xl border border-border bg-card px-3 py-1.5 text-[12.5px] font-semibold text-foreground';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Revenue y suscripciones</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Del {fecha(`${m.periodo.desde}T12:00:00Z`)} al {fecha(`${m.periodo.hasta}T12:00:00Z`)} · {m.plan === 'TODOS' ? 'todos los planes' : NOMBRE_PLAN[m.plan]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Periodo" className={control} value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)}>
            {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
          {periodo === 'rango' && (
            <>
              <input aria-label="Desde" type="date" className={control} value={desde} max={hasta || d.hoy} onChange={(e) => setDesde(e.target.value)} />
              <input aria-label="Hasta" type="date" className={control} value={hasta} min={desde} max={d.hoy} onChange={(e) => setHasta(e.target.value)} />
            </>
          )}
          <select aria-label="Plan" className={control} value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANES.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}
          </select>
          <button type="button" onClick={() => void cargar()} disabled={cargando} className={`${control} flex items-center gap-1.5 disabled:opacity-50`}>
            <RefreshCw className={`size-3.5 ${cargando ? 'animate-spin' : ''}`} aria-hidden /> Actualizar
          </button>
        </div>
      </div>

      {!v.stripeDisponible && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] px-4 py-3.5 text-[12.5px] text-muted-foreground">
          <p className="flex items-center gap-1.5 font-bold text-foreground"><AlertTriangle className="size-3.5" aria-hidden />Stripe no ha contestado</p>
          <p className="mt-1">{v.avisoStripe} El MRR y las renovaciones salen «—» a propósito: un 0 se leería como «no cobras nada».</p>
        </div>
      )}

      <section aria-labelledby="ahora">
        <h2 id="ahora" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Ahora mismo · Stripe en vivo</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta titulo="MRR" acento valor={v.mrrEuros === null ? '—' : eur(v.mrrEuros * 100)} pie="Lo que se cobraría cada mes con lo vivo hoy (un anual cuenta entre 12). No es dinero recibido." />
          <Tarjeta titulo="ARR" valor={v.arrEuros === null ? '—' : eur(v.arrEuros * 100)} pie="MRR × 12. Una proyección, no lo facturado del año." />
          <Tarjeta titulo="Estudios de pago" valor={v.pagando === null ? '—' : String(v.pagando)} pie="Suscripciones cobrando de verdad en Stripe." />
          <Tarjeta titulo="Activas al final" valor={String(m.activasAlFinal)} pie="Según el libro, al cierre del periodo." />
        </div>
      </section>

      <section aria-labelledby="periodo">
        <h2 id="periodo" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">En el periodo · libro de billing</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta titulo="Facturado" valor={eur(m.facturado.brutoCents)} pie={`${m.facturado.facturas} factura(s) emitidas · ${eur(m.facturado.netoIvaCents)} sin IVA. Un anual cuenta una vez, entero.`} />
          <Tarjeta titulo="Cobrado" acento valor={eur(m.cobrado.brutoCents)} pie={`${m.cobrado.facturas} cobro(s) por fecha de pago · ${eur(m.cobrado.netoIvaCents)} sin IVA.`} />
          <Tarjeta titulo="Churn de estudios" valor={pct(m.churn.logosPct)} pie={m.churn.activasAlInicio === 0 ? 'Nadie vivo al empezar el periodo.' : `${m.churn.bajasDeEsaCohorte} de ${m.churn.activasAlInicio} que estaban al empezar.`} />
          <Tarjeta titulo="Churn de MRR" valor={pct(m.churn.mrrPct)} pie={m.churn.mrrAlInicioCents === 0 ? 'Sin MRR al empezar.' : `${eur(m.churn.mrrPerdidoCents)} de ${eur(m.churn.mrrAlInicioCents)}.`} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card px-4 py-3.5" aria-labelledby="mov">
          <h2 id="mov" className="text-[13px] font-bold text-foreground">Movimientos de MRR</h2>
          <p className="mb-1 text-[11.5px] text-muted-foreground">El puente entre dos MRR, a precio de lista. No son ingresos.</p>
          <Fila etiqueta="Nuevo" nota={`${mov.altas} alta(s)`} valor={eur(mov.nuevoCents)} />
          <Fila etiqueta="Ampliación" nota={`${mov.upgrades} upgrade(s)`} valor={eur(mov.ampliacionCents)} />
          <Fila etiqueta="Reducción" nota={`${mov.downgrades} downgrade(s)`} valor={`−${eur(mov.reduccionCents)}`} />
          <Fila etiqueta="Bajas" nota={`${mov.bajas} cancelación(es)`} valor={`−${eur(mov.bajaCents)}`} />
          <Fila etiqueta="Neto" valor={`${mov.netoCents < 0 ? '−' : ''}${eur(Math.abs(mov.netoCents))}`} />
        </section>

        <section className="rounded-2xl border border-border bg-card px-4 py-3.5" aria-labelledby="plan">
          <h2 id="plan" className="text-[13px] font-bold text-foreground">Ingresos por plan</h2>
          <p className="mb-1 text-[11.5px] text-muted-foreground">Cada factura, al plan que tenía la suscripción ese día. Bruto, con IVA.</p>
          {m.porPlan.length === 0 ? <p className="py-2 text-[13px] text-muted-foreground">Sin facturas en el periodo.</p> : m.porPlan.map((p) => (
            <Fila key={p.plan} etiqueta={NOMBRE_PLAN[p.plan] ?? p.plan} nota={`facturado ${eur(p.facturadoBrutoCents)}`} valor={`cobrado ${eur(p.cobradoBrutoCents)}`} />
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card px-4 py-3.5" aria-labelledby="fallidos">
          <h2 id="fallidos" className="text-[13px] font-bold text-foreground">Pagos fallidos</h2>
          <Fila etiqueta="Sin resolver ahora" nota={eur(m.pagosFallidos.importeAbiertoCents)} valor={String(m.pagosFallidos.abiertosAhora)} />
          <Fila etiqueta="Abiertos en el periodo" valor={String(m.pagosFallidos.abiertosEnElPeriodo)} />
          <Fila etiqueta="Recuperados en el periodo" valor={String(m.pagosFallidos.recuperadosEnElPeriodo)} />
          <p className="mt-2 text-[11.5px] text-muted-foreground">El detalle por estudio, con motivo y avisos, está en «Cobros a estudios».</p>
        </section>

        <section className="rounded-2xl border border-border bg-card px-4 py-3.5" aria-labelledby="renov">
          <h2 id="renov" className="text-[13px] font-bold text-foreground">Próximas renovaciones (30 días)</h2>
          <p className="mb-1 text-[11.5px] text-muted-foreground">Importe mensual equivalente, de lo que Stripe cobra hoy.</p>
          {v.renovaciones.length === 0
            ? <p className="py-2 text-[13px] text-muted-foreground">{v.stripeDisponible ? 'Ninguna en los próximos 30 días.' : '—'}</p>
            : v.renovaciones.map((r) => <Fila key={`${r.nombre}${r.renuevaEl}`} etiqueta={r.nombre} nota={`${fecha(r.renuevaEl)} · ${NOMBRE_PLAN[r.plan ?? ''] ?? r.plan ?? '—'}`} valor={eur(r.eurosMes * 100)} />)}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-muted/40 px-4 py-3.5" aria-labelledby="ojo">
        <h2 id="ojo" className="text-[13px] font-bold text-foreground">Qué NO dicen estas cifras</h2>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] text-muted-foreground">
          {m.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      </section>
    </div>
  );
}
