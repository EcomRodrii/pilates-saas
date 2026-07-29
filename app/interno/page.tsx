'use client';

// Resumen ejecutivo. La regla que gobierna esta pantalla: **ningún número sin
// procedencia**. Cuando algo vale 0 se dice por qué, y cuando es una estimación
// se marca como tal. Un panel que enseña un MRR inventado es peor que no tener
// panel: tomas decisiones con él.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchFacturacion, fetchKpis, type Facturacion, type Kpis } from '@/lib/interno/client';

function Tarjeta({ titulo, valor, pie, acento }: {
  titulo: string; valor: string; pie?: string; acento?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-[26px] font-bold tabular-nums leading-none ${acento ? 'text-brand-medio' : 'text-foreground'}`}>{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>}
    </div>
  );
}

const eur = (n: number) => `${n.toLocaleString('es-ES')} €`;

export default function ResumenInterno() {
  const [k, setK] = useState<Kpis | null>(null);
  // El dinero se pide aparte, a Stripe. Si esa llamada falla, el resto de la
  // pantalla sigue sirviendo: lo que NO se hace es rellenar el hueco con el
  // precio de lista, que es lo que hacía antes y por eso mentía.
  const [f, setF] = useState<Facturacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [kpis, fact] = await Promise.all([fetchKpis(), fetchFacturacion().catch(() => null)]);
      setK(kpis);
      setF(fact);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!k) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  const maxAltas = Math.max(1, ...k.altasPorMes.map(a => a.altas));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Negocio</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Estas dos tarjetas salen de Stripe (ver /interno/facturacion). Si
              Stripe no contesta se enseña «—», nunca 0 €: un cero se lee como
              «no cobras nada» y eso es una afirmación que no podemos hacer. */}
          <Tarjeta
            titulo="MRR" valor={f?.stripeDisponible ? eur(f.mrrEuros) : '—'} acento
            pie={!f ? 'No se ha podido preguntar a Stripe.'
              : !f.stripeDisponible ? (f.avisoStripe ?? 'Sin respuesta de Stripe.')
              : f.pagando === 0
                ? `Ninguna suscripción activa en Stripe${f.descuadres > 0 ? ` · ${f.descuadres} cuenta(s) no cuadran` : ''}.`
                : `${f.pagando} suscripción(es) cobrando de verdad.`} />
          <Tarjeta
            titulo="ARR" valor={f?.stripeDisponible ? eur(f.mrrEuros * 12) : '—'}
            pie="MRR × 12, con el importe que Stripe cobra de verdad." />
          <Tarjeta
            titulo="Estudios con actividad" valor={String(k.estudios.conActividad)}
            pie={`${k.estudios.vacios} altas más sin ninguna socia ni clase.`} />
          <Tarjeta
            titulo="Altas (30 días)" valor={String(k.estudios.altasUltimos30d)}
            pie={`${k.estudios.total} estudios en total${k.estudios.suspendidos > 0 ? ` · ${k.estudios.suspendidos} suspendido(s)` : ''}.`} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Uso de la plataforma</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta titulo="Reservas hoy" valor={String(k.actividad.reservasHoy)} />
          <Tarjeta titulo="Reservas (7 días)" valor={String(k.actividad.reservas7d)} />
          <Tarjeta titulo="Socias" valor={String(k.actividad.socias)} pie="Sumando todos los estudios." />
          <Tarjeta titulo="Clases creadas" valor={String(k.actividad.clases)} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Altas por mes</h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          {k.altasPorMes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Todavía no hay altas que dibujar.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {k.altasPorMes.map(a => (
                <div key={a.mes} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{a.altas}</span>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${(a.altas / maxAltas) * 100}%` }} />
                  <span className="text-[10.5px] text-muted-foreground truncate w-full text-center">{a.mes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Honestidad sobre lo que este panel todavía NO sabe. Sin esto, la
          ausencia de una métrica se lee como "vale cero". */}
      <section className="rounded-2xl border border-border bg-muted/30 px-4 py-3.5">
        <p className="text-[12.5px] font-bold text-foreground">Lo que aquí no se puede saber (todavía)</p>
        <ul className="mt-1.5 text-[12.5px] text-muted-foreground leading-relaxed list-disc pl-4">
          <li><strong>Churn, cancelaciones y renovaciones:</strong> no se guarda localmente el estado de la suscripción de cada estudio. Vive en Stripe.</li>
          <li><strong>Pruebas y conversión:</strong> no existe el concepto de periodo de prueba en la base de datos.</li>
          <li><strong>Tickets, incidentes y leads:</strong> no hay soporte ni CRM construidos. Cuando los haya, sus KPIs entran aquí.</li>
        </ul>
        <p className="mt-2 text-[12px] text-muted-foreground">
          Estado de servidores, errores y cobros: <Link href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-medio">Stripe</Link>,{' '}
          <Link href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-medio">Vercel</Link> y{' '}
          <Link href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-medio">Sentry</Link> ya lo hacen mejor de lo que lo haríamos aquí.
        </p>
      </section>
    </div>
  );
}
