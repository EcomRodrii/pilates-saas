'use client';

// Facturación del SaaS — quién paga, quién no, y qué no cuadra.
//
// Misma regla que el Resumen, llevada más lejos: **ningún número sin
// procedencia**. Aquí la procedencia es Stripe, y cuando Stripe no contesta la
// pantalla lo dice en vez de enseñar 0 € (que se leería como «no cobras nada»).
//
// El orden de la página es el orden en que un founder necesita mirarlo:
// primero lo que hay que hacer HOY (pruebas que caducan, impagos, descuadres),
// y solo después la tabla completa.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchFacturacion, type Facturacion, type LineaFacturacionCliente } from '@/lib/interno/client';

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ESTADO: Record<LineaFacturacionCliente['estado'], { texto: string; clase: string }> = {
  pagando:   { texto: 'Paga',          clase: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' },
  en_prueba: { texto: 'En prueba',     clase: 'bg-sky-500/12 text-sky-700 dark:text-sky-400' },
  impago:    { texto: 'Impago',        clase: 'bg-red-500/12 text-red-700 dark:text-red-400' },
  cancelado: { texto: 'Cancelado',     clase: 'bg-muted text-muted-foreground' },
  manual:    { texto: 'Sin cobro',     clase: 'bg-muted text-muted-foreground' },
  descuadre: { texto: 'No cuadra',     clase: 'bg-amber-500/14 text-amber-700 dark:text-amber-400' },
};

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

/** Bloque de "esto hay que mirarlo hoy". No se pinta si no hay nada. */
function Atencion({ titulo, tono, children }: {
  titulo: string; tono: 'ambar' | 'rojo'; children: React.ReactNode;
}) {
  const borde = tono === 'rojo' ? 'border-red-500/30 bg-red-500/[0.04]' : 'border-amber-500/30 bg-amber-500/[0.04]';
  return (
    <div className={`rounded-2xl border ${borde} px-4 py-3.5`}>
      <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-foreground">
        <AlertTriangle className="size-3.5" aria-hidden />{titulo}
      </p>
      <div className="mt-2 flex flex-col gap-1.5 text-[12.5px] text-muted-foreground">{children}</div>
    </div>
  );
}

export default function FacturacionInterna() {
  const [f, setF] = useState<Facturacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setF(await fetchFacturacion()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setCargando(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!f) return <p className="text-[13.5px] text-muted-foreground">Preguntando a Stripe…</p>;

  const descuadres = f.lineas.filter(l => l.estado === 'descuadre');
  const impagos = f.lineas.filter(l => l.estado === 'impago');
  // Las líneas sin nada que contar (paradas, canceladas) van al final: no son
  // noticia, pero tampoco se esconden.
  const orden: Record<LineaFacturacionCliente['estado'], number> = {
    impago: 0, descuadre: 1, pagando: 2, en_prueba: 3, cancelado: 4, manual: 5,
  };
  const lineas = [...f.lineas].sort(
    (a, b) => orden[a.estado] - orden[b.estado] || b.eurosMes - a.eurosMes || a.nombre.localeCompare(b.nombre),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Facturación</h1>
          <p className="text-[12.5px] text-muted-foreground">
            {f.stripeDisponible
              ? `Leído de Stripe ahora mismo · ${f.suscripcionesEnStripe} suscripción(es) en la cuenta.`
              : 'No se ha podido preguntar a Stripe.'}
          </p>
        </div>
        <button
          type="button" onClick={() => void cargar()} disabled={cargando}
          className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${cargando ? 'animate-spin' : ''}`} aria-hidden />
          Actualizar
        </button>
      </div>

      {/* Si Stripe no contesta, el resto de la página no es de fiar. Se dice
          arriba del todo y con el motivo exacto, no con un «error». */}
      {!f.stripeDisponible && (
        <Atencion titulo="Estos números no vienen de Stripe" tono="rojo">
          <p>{f.avisoStripe}</p>
          <p>
            Lo de abajo es solo lo que dice nuestra base de datos, que puede estar
            desactualizada si algún webhook se perdió. No lo uses para decidir.
          </p>
        </Atencion>
      )}

      <section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta
            titulo="MRR real" valor={f.stripeDisponible ? eur(f.mrrEuros) : '—'} acento
            pie={!f.stripeDisponible ? 'Sin respuesta de Stripe.'
              : f.pagando === 0 ? 'Ninguna suscripción activa en Stripe todavía.'
              : `${f.pagando} suscripción(es) cobrando de verdad.`} />
          <Tarjeta
            titulo="ARR" valor={f.stripeDisponible ? eur(f.mrrEuros * 12) : '—'}
            pie="MRR × 12, con el importe que Stripe cobra de verdad (no la tarifa de lista)." />
          <Tarjeta
            titulo="En prueba" valor={String(f.enPrueba)}
            pie={f.enPrueba > 0 ? `${eur(f.mrrEnPruebaEuros)}/mes si convierten todas. No suma al MRR.` : 'Ninguna prueba en curso.'} />
          <Tarjeta
            titulo="Sin cobro" valor={String(f.manuales)}
            pie="Cuentas sin suscripción y sin acceso concedido. Ni clientes ni problema." />
        </div>
      </section>

      {f.pruebasQueAcaban.length > 0 && (
        <Atencion titulo={`${f.pruebasQueAcaban.length} prueba(s) acaban esta semana`} tono="ambar">
          {f.pruebasQueAcaban.map(l => (
            <p key={l.id}>
              <strong className="text-foreground">{l.nombre}</strong> —{' '}
              {l.diasDePrueba !== null && l.diasDePrueba <= 0 ? 'acaba hoy' : `quedan ${l.diasDePrueba} día(s)`}
              {l.eurosMes > 0 && ` · pasaría a ${eur(l.eurosMes)}/mes`}
            </p>
          ))}
        </Atencion>
      )}

      {impagos.length > 0 && (
        <Atencion titulo={`${impagos.length} impago(s)`} tono="rojo">
          {impagos.map(l => (
            <p key={l.id}>
              <strong className="text-foreground">{l.nombre}</strong> — {l.motivoDescuadre}
            </p>
          ))}
        </Atencion>
      )}

      {descuadres.length > 0 && (
        <Atencion titulo={`${descuadres.length} cuenta(s) no cuadran`} tono="ambar">
          <p className="text-[12px]">
            Les estamos dando el producto y Stripe no lo respalda. Puede ser
            deliberado (cortesía, piloto) o un cobro que se perdió — esto no lo
            adivina el panel.
          </p>
          {descuadres.map(l => (
            <p key={l.id}>
              <strong className="text-foreground">{l.nombre}</strong> — {l.motivoDescuadre}
            </p>
          ))}
        </Atencion>
      )}

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
          Cuenta por cuenta
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left font-bold">Cuenta</th>
                <th className="px-3 py-2 text-left font-bold">Estado</th>
                <th className="px-3 py-2 text-right font-bold">€/mes</th>
                <th className="px-3 py-2 text-left font-bold">Renueva</th>
                <th className="px-3 py-2 text-left font-bold">Plan en la base</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map(l => {
                const e = ESTADO[l.estado];
                return (
                  <tr key={`${l.tipo}-${l.id}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      {l.tipo === 'estudio' ? (
                        <Link href={`/interno/estudios/${l.id}`} className="font-semibold text-foreground hover:underline">
                          {l.nombre}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">{l.nombre}</span>
                      )}
                      {l.tipo === 'cadena' && (
                        <span className="ml-1.5 text-[11.5px] text-muted-foreground">
                          cadena · {l.sedes} sede(s)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded-lg px-2 py-0.5 text-[11.5px] font-bold ${e.clase}`}>
                        {e.texto}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {l.eurosMes > 0 ? eur(l.eurosMes) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fecha(l.renuevaEl)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.planEnBd ?? '—'}
                      {l.estadoEnBd && <span className="text-[11.5px]"> · {l.estadoEnBd}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground leading-snug">
          Una cadena aparece una sola vez aunque tenga varias sedes: su suscripción
          las cubre todas. Contarla por sede multiplicaría el MRR.
        </p>
      </section>
    </div>
  );
}
