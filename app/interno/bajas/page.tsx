'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Bajas (en seco): en qué situación está cada estudio según la máquina de bajas,
// sin que nada se aplique. Solo lectura: esta pantalla no tiene ningún botón que
// cambie algo.
//
//   · Hoy: el recuento por estado y cada estudio, con lo que limitaría su estado,
//     sus días sin actividad real, la previsión «si nadie hace nada» y los casos
//     dudosos. Se puede mirar otro día (`?hoy=`) con los datos de hoy.
//   · Evolución: el informe diario (solo existe con BAJAS_AUTOMATICAS=informe),
//     día a día, y los estudios que cambian de estado de un día a otro.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchBajas } from '@/lib/interno/client';
import {
  ESTADOS_CON_ERROR, ETIQUETA_ESTADO, textoAviso, type EstudioBajas, type RespuestaBajas,
} from '@/lib/interno/bajas';
import type { EstadoEstudio } from '@/lib/retencion/situacion-estudio';

const fecha = (ymd: string | null) => (ymd
  ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' })
  : '—');
const fechaHora = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
  : 'nunca');

const TONO: Record<EstadoEstudio | 'ERROR', string> = {
  ACTIVO_PAGO: 'bg-success/15 text-success',
  PAGO_PENDIENTE: 'bg-warning/15 text-warning',
  GRATIS: 'bg-muted text-foreground',
  GRATIS_EN_MARGEN: 'bg-warning/15 text-warning',
  INACTIVO: 'bg-warning/15 text-warning',
  SUSPENDIDO: 'bg-destructive/10 text-destructive',
  EN_BAJA: 'bg-destructive/10 text-destructive',
  ELIMINADO: 'bg-destructive/10 text-destructive',
  ERROR: 'bg-destructive/10 text-destructive',
};

/** Qué limitaría el estado, en una frase. */
function queLimita(e: EstudioBajas): string {
  if (e.paga) return 'Nada: paga.';
  const partes: string[] = [];
  if (e.gestionLimitada) partes.push('panel de la propietaria limitado');
  partes.push(e.servicioAlumnasSuspendido ? 'alumnas solo consultan' : 'alumnas como siempre');
  if (e.cobrosAutomaticosPausados) partes.push('cobros automáticos en pausa');
  return `${partes.join(' · ')}.`;
}

export default function BajasEnSeco() {
  const [datos, setDatos] = useState<RespuestaBajas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dia, setDia] = useState('');
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async (hoy?: string) => {
    setCargando(true);
    try { setDatos(await fetchBajas(hoy)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido cargar.'); }
    finally { setCargando(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  const estadosHoy = useMemo(
    () => ESTADOS_CON_ERROR.filter(e => e !== 'ERROR' || (datos?.vivo.recuento.ERROR ?? 0) > 0),
    [datos],
  );

  if (!datos && !error) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[20px] font-extrabold tracking-tight text-foreground">Bajas (en seco)</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
          En qué situación está cada estudio según la máquina de bajas. Solo lectura: nada de esto cambia el estado de un
          estudio, para un cobro ni manda un correo. Quien paga está siempre en «Paga»; pasarse del gratis limita el panel de la
          propietaria, nunca a sus alumnas.
        </p>
        {datos && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${datos.modo === 'informe' ? 'bg-brand/15 text-brand-medio' : 'bg-muted text-muted-foreground'}`}>
              BAJAS_AUTOMATICAS: {datos.modo}
            </span>
            <span className="text-muted-foreground">
              {datos.modo === 'informe'
                ? 'se escriben las marcas de uso y el informe de cada día.'
                : 'no se escribe nada; la evolución por días empieza al pasarlo a «informe».'}
            </span>
          </p>
        )}
      </header>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">{error}</p>}
      {datos && datos.noLeidos.length > 0 && (
        <p role="alert" className="rounded-xl bg-warning/10 px-4 py-2.5 text-[13px] text-foreground">
          No se ha podido leer: {datos.noLeidos.join(', ')}. Lo que falta no sale como cero.
        </p>
      )}

      {datos && (
        <>
          <section className="rounded-2xl border border-border bg-card px-4 py-4" aria-labelledby="bajas-hoy">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="bajas-hoy" className="text-[14px] font-bold text-foreground">Situación el {fecha(datos.hoy)}</h2>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {datos.umbrales.inactivo} días sin actividad real → inactivo; {datos.umbrales.suspendido} → suspendido. Los días de
                  «Cierre del centro» no cuentan, y las demos no se mueven por falta de uso.
                </p>
              </div>
              <form className="flex flex-wrap items-center gap-2" onSubmit={ev => { ev.preventDefault(); void cargar(dia || undefined); }}>
                <label className="text-[12.5px] text-muted-foreground" htmlFor="bajas-dia">Mirar otro día</label>
                <input id="bajas-dia" type="date" value={dia} onChange={ev => setDia(ev.target.value)}
                  className="min-h-9 rounded-lg border border-border bg-card px-2 text-[13px] text-foreground" />
                <button type="submit" disabled={cargando}
                  className="min-h-9 rounded-lg border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                  {cargando ? 'Calculando…' : 'Ver'}
                </button>
              </form>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {estadosHoy.map(e => (
                <li key={e} className="rounded-xl border border-border/70 px-3 py-2">
                  <p className="text-[11.5px] font-medium text-muted-foreground">{ETIQUETA_ESTADO[e]}</p>
                  <p className="text-[20px] font-bold tabular-nums text-foreground">{datos.vivo.recuento[e]}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="bajas-evolucion">
            <h2 id="bajas-evolucion" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Evolución por días</h2>
            {datos.historial.dias.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground">
                Todavía no hay informe diario. Lo escribe el cron horario con BAJAS_AUTOMATICAS=informe, una fila por estudio y día.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border bg-card">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-semibold">Día</th>
                      {ESTADOS_CON_ERROR.map(e => <th key={e} scope="col" className="px-2 py-2 text-right font-semibold">{ETIQUETA_ESTADO[e]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...datos.historial.dias].reverse().map(d => (
                      <tr key={d.dia} className="border-b border-border/60 last:border-0">
                        <th scope="row" className="px-3 py-1.5 text-left font-medium text-foreground">{fecha(d.dia)}</th>
                        {ESTADOS_CON_ERROR.map(e => (
                          <td key={e} className={`px-2 py-1.5 text-right tabular-nums ${d.recuento[e] ? 'text-foreground' : 'text-muted-foreground/60'}`}>{d.recuento[e]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="bajas-cambios">
            <h2 id="bajas-cambios" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              Cambios de un día a otro ({datos.historial.cambios.length})
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {datos.historial.cambios.length === 0 && (
                <li className="px-4 py-3 text-[13px] text-muted-foreground">Ningún estudio ha cambiado de estado en el informe.</li>
              )}
              {datos.historial.cambios.map(c => (
                <li key={`${c.dia}-${c.studioId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-4 py-2.5 text-[13px] last:border-0">
                  <span className="tabular-nums text-muted-foreground">{fecha(c.dia)}</span>
                  <span className="font-semibold text-foreground">{c.nombre}</span>
                  <span className="text-muted-foreground">{c.de ? ETIQUETA_ESTADO[c.de] : 'nuevo'} →</span>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${TONO[c.a]}`}>{ETIQUETA_ESTADO[c.a]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="bajas-estudios">
            <h2 id="bajas-estudios" className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
              Estudios ({datos.vivo.estudios.length})
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {datos.vivo.estudios.map(e => (
                <li key={e.id} data-testid={`baja-${e.id}`} className="flex flex-col gap-1 border-b border-border/60 px-4 py-3 last:border-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] font-semibold text-foreground">
                    <span className="min-w-0 truncate">{e.nombre}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${TONO[e.estado]}`}>
                      {ETIQUETA_ESTADO[e.estado]}{e.variante === 'funciona' ? ' · funciona' : e.variante === 'sin_senales' ? ' · sin señales' : ''}
                    </span>
                    {e.esDemo && <Etiqueta>demo</Etiqueta>}
                    {e.suspendidoAMano && <Etiqueta>suspendido a mano</Etiqueta>}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground">{queLimita(e)}</p>
                  <p className="text-[12px] text-muted-foreground">
                    Última actividad real: {fechaHora(e.ultimaActividad)} · {e.diasSinActividad} días sin actividad
                    {e.diasDeCierre > 0 ? ` (sin contar ${e.diasDeCierre} de cierre)` : ''}
                    {e.entraInactivoEl ? ` · inactivo el ${fecha(e.entraInactivoEl)}` : ''}
                    {e.entraSuspendidoEl ? ` · suspendido el ${fecha(e.entraSuspendidoEl)}` : ''}
                    {e.faseGratis !== 'SIN_MEDIR' && !e.paga ? ` · gratis: ${e.faseGratis.toLowerCase()}` : ''}
                  </p>
                  {e.avisos.length > 0 && (
                    <ul className="mt-0.5 flex flex-wrap gap-1.5">
                      {e.avisos.map(a => <li key={a}><Etiqueta>{textoAviso(a)}</Etiqueta></li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">{children}</span>;
}
