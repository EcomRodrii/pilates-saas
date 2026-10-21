'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { authHeader } from '@/lib/api-client';
// Solo TIPOS del módulo de servidor (lleva `node:crypto`): nada de él llega al navegador.
import type { VistaPrevia } from '@/lib/billing/alineacion-dia1';

// «¿Y las alumnas que ya tienes?» — dentro de «Cobrar todas las cuotas el día 1».
// Dos tarjetas con la cuenta hecha, una vista previa REAL (calculada en el servidor
// sobre las cuotas de este estudio, sin cobrar nada) y una confirmación con el
// total. La opción proporcional no se puede activar sin haber visto esa lista: la
// ruta pide la huella de la lista que hoy sale.

type Respuesta = VistaPrevia & { dia1Activo: boolean; modo: 'ENTERA' | 'PROPORCIONAL' };

const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const fechaCorta = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function AlineacionAlumnasActuales() {
  const { studio, reflejarStudioGuardado } = useStudio();
  const rol = useRol();
  const modoActivo = studio?.cobroDia1Modo ?? 'ENTERA';
  const [elegido, setElegido] = useState<'ENTERA' | 'PROPORCIONAL'>(modoActivo);
  const [vista, setVista] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);

  const soloPropietaria = rol === 'PROPIETARIO';

  // Foco: al abrir la confirmación pasa a ella; al cancelar vuelve al botón que la abrió.
  const dialogoRef = useRef<HTMLDivElement>(null);
  const botonRevisarRef = useRef<HTMLButtonElement>(null);
  const vieneDeConfirmar = useRef(false);
  useEffect(() => {
    if (confirmando) { vieneDeConfirmar.current = true; dialogoRef.current?.focus(); }
    else if (vieneDeConfirmar.current) { vieneDeConfirmar.current = false; botonRevisarRef.current?.focus(); }
  }, [confirmando]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/cobros/alineacion-dia1', { headers: await authHeader() });
      const data = await res.json().catch(() => null) as (Respuesta & { error?: string }) | null;
      if (!res.ok || !data || !Array.isArray(data.filas)) setError(data?.error ?? 'No se ha podido calcular la vista previa.');
      else setVista(data);
    } catch {
      setError('No se ha podido calcular la vista previa. Comprueba la conexión.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga de la vista previa: el estado viene de la red.
    if (soloPropietaria) void cargar();
  }, [soloPropietaria, cargar]);

  async function cambiarModo(modo: 'ENTERA' | 'PROPORCIONAL') {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch('/api/cobros/alineacion-dia1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(modo === 'PROPORCIONAL' ? { modo, huella: vista?.huella } : { modo }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; codigo?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'No se ha podido guardar. No se ha cambiado nada.');
        if (data?.codigo === 'LISTA_CAMBIADA') { setConfirmando(false); void cargar(); }
        return;
      }
      reflejarStudioGuardado({ cobroDia1Modo: modo });
      setConfirmando(false);
      setHecho(modo === 'PROPORCIONAL' ? 'Activado: las alumnas pagarán la parte proporcional en su próxima renovación.' : 'Vuelves a la cuota entera en la renovación.');
      void cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (!soloPropietaria) {
    return (
      <p className="mt-4 text-sm text-muted-foreground text-pretty">
        Cómo se alinean al día 1 las alumnas que ya tienes lo cambia la propietaria. Ahora: {modoActivo === 'PROPORCIONAL' ? 'parte proporcional en la renovación' : 'cuota entera en la renovación'}.
      </p>
    );
  }

  const ejemploA = vista?.filas[0];
  const sumaCuotas = vista ? Math.round(vista.filas.reduce((s, f) => s + f.cuota, 0) * 100) / 100 : 0;
  const alumnasQuePagan = vista ? vista.alumnas - vista.alumnasEnCortesia : 0;
  const primeraFecha = vista?.filas[0]?.fechaRenovacion;
  const ultimaFecha = vista?.filas[vista.filas.length - 1]?.fechaRenovacion;
  // Ejemplo del recibo con una alumna REAL de la lista (no con cifras inventadas).
  const filaRecibo = vista?.filas.find(f => !f.cortesia);
  const textoRecibo = (() => {
    if (!filaRecibo) return '«Parte proporcional del mes: N de M días (desde el día 1 del mes siguiente, cuota entera)»';
    const d = new Date(`${filaRecibo.fechaRenovacion}T00:00:00Z`);
    const mes = d.toLocaleDateString('es-ES', { month: 'long', timeZone: 'UTC' });
    const dia1 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `«Parte proporcional de ${mes}: ${filaRecibo.diasRestantes} de ${filaRecibo.diasDelMes} días (desde el ${dia1}, ${eur(filaRecibo.cuota)}/mes)»`;
  })();
  const cambiaAB = elegido === 'PROPORCIONAL' && modoActivo !== 'PROPORCIONAL';

  return (
    <section className="mt-6 rounded-xl border border-border p-4" aria-labelledby="titulo-alineacion">
      <h3 id="titulo-alineacion" className="text-sm font-semibold text-foreground">¿Y las alumnas que ya tienes?</h3>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Pasan al día 1 en su próxima renovación. Elige cómo. Solo afecta a cuotas mensuales de Tentare que aún no acaban a fin de mes; cada alumna cambia una sola vez, en su renovación.
      </p>

      {/* Región viva siempre presente: un role="status" que aparece de golpe muchas veces no se anuncia. */}
      <div className="mt-3 empty:hidden text-sm text-muted-foreground" aria-live="polite">
        {cargando && !vista ? 'Calculando con tus alumnas reales…' : null}
        {hecho && !error ? <span className="text-foreground">{hecho}</span> : null}
      </div>
      {!vista && !cargando && error && (
        <button type="button" onClick={() => void cargar()} className="mt-2 h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          Reintentar
        </button>
      )}
      {vista?.ejemplo && (
        <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-foreground text-pretty">{vista.ejemplo}</p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Cómo alinear a las alumnas actuales">
        <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand', elegido === 'ENTERA' ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted')}>
          <input type="radio" name="modo-alineacion" className="mt-1 accent-[var(--brand)]" checked={elegido === 'ENTERA'} onChange={() => { setElegido('ENTERA'); setConfirmando(false); }} />
          <span>
            <span className="block text-sm font-medium text-foreground">A · Cuota entera en su renovación{modoActivo === 'ENTERA' ? ' (la de ahora)' : ''}</span>
            <span className="block text-sm text-muted-foreground text-pretty">
              Paga la cuota entera cuando le toca y queda cubierta hasta el último día del mes siguiente. Sencillo para ella, pero cada alumna recibe entre 1 y 30 días gratis (según el día en que renueve), una sola vez. Es dinero que dejas de ingresar.
            </span>
            {vista && vista.alumnas > 0 && (
              <span className="mt-1 block text-sm font-medium text-foreground">Lo que regalas: {eur(vista.totalRegalaA)} entre {vista.alumnas} alumnas.</span>
            )}
            {vista && vista.alumnas === 0 && (
              <span className="mt-1 block text-sm text-muted-foreground">Hoy no regalarías nada: ninguna alumna cambia de fecha.</span>
            )}
          </span>
        </label>
        <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand', elegido === 'PROPORCIONAL' ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted')}>
          <input type="radio" name="modo-alineacion" className="mt-1 accent-[var(--brand)]" checked={elegido === 'PROPORCIONAL'} onChange={() => { setElegido('PROPORCIONAL'); setConfirmando(false); }} />
          <span>
            <span className="block text-sm font-medium text-foreground">B · Solo la parte proporcional{modoActivo === 'PROPORCIONAL' ? ' (la de ahora)' : ''}</span>
            <span className="block text-sm text-muted-foreground text-pretty">
              En su renovación paga solo los días que van hasta fin de mes, y desde el día 1 la cuota entera. No regalas nada, pero ese primer recibo es distinto al de siempre y conviene que lo sepan.
            </span>
            {vista && vista.alumnas > 0 && (
              <span className="mt-1 block text-sm font-medium text-foreground">
                {alumnasQuePagan > 0 ? `Cobrarías ${eur(vista.totalCobraB)} a ${alumnasQuePagan} ${alumnasQuePagan === 1 ? 'alumna' : 'alumnas'}.` : 'A todas les quedan muy pocos días: no se les cobra nada por ellos.'}
              </span>
            )}
          </span>
        </label>
      </div>

      {elegido === 'PROPORCIONAL' && vista && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-foreground">Vista previa con tus alumnas reales (no se cobra nada)</h4>
          {vista.alumnas === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground text-pretty">Hoy ninguna alumna cambiaría: todas acaban ya a fin de mes o no tienen cuota mensual de Tentare.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {vista.alumnas} {vista.alumnas === 1 ? 'alumna cambia' : 'alumnas cambian'} en su renovación. En total pagarían {eur(vista.totalCobraB)} esos días y el día 1 empezarían a pagar la cuota entera. Con la opción A regalarías {eur(vista.totalRegalaA)}.
                {vista.alumnasEnCortesia > 0 && ` A ${vista.alumnasEnCortesia} les quedan ${vista.diasMinimos} días o menos de mes: no se les cobra nada por esos días (${eur(vista.totalCortesiaB)} que dejas de ingresar) y pagan la entera el día 1.`}
              </p>
              <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Alumnas afectadas, fecha de renovación y lo que pagarían</caption>
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Alumna</th>
                      <th scope="col" className="px-3 py-2 font-medium">Renueva</th>
                      <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">Cuota</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Paga en B</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Regalas en A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vista.filas.map(f => (
                      <tr key={f.suscripcionId} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">
                          {f.alumna}
                          <span className="block text-xs text-muted-foreground">
                            <span className="sm:hidden">cuota {eur(f.cuota)} · </span>renueva el {fechaCorta(f.fechaRenovacion)}
                          </span>
                        </td>
                        <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{eur(f.cuota)}</td>
                        <td className="px-2 py-2 text-right tabular-nums sm:px-3">{f.cortesia ? <span>0 €<span className="block text-xs text-muted-foreground">{f.diasRestantes} {f.diasRestantes === 1 ? 'día' : 'días'}, sin cobrar</span></span> : <span>{eur(f.pagaAhora)}<span className="block text-xs text-muted-foreground">{f.diasRestantes} de {f.diasDelMes} días</span></span>}</td>
                        <td className="px-2 py-2 text-right tabular-nums sm:px-3">{eur(f.regalaA)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ejemploA && <p className="mt-1 text-xs text-muted-foreground">Las fechas y los importes salen de las cuotas de hoy; si cambian, la lista se recalcula antes de activar.</p>}
            </>
          )}
          <p className="mt-3 text-sm text-muted-foreground text-pretty">
            <strong className="font-medium text-foreground">Qué verá cada alumna:</strong> el recibo de su renovación dirá, por ejemplo, {textoRecibo}. No enviamos ningún aviso aparte ni cobramos más de lo que ya aceptó: el importe es menor que su cuota. Si quieres avisarlas antes, escríbeles tú.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {cambiaAB && !confirmando && (
          <button ref={botonRevisarRef} type="button" disabled={!vista || cargando || guardando} onClick={() => { setHecho(null); setConfirmando(true); }}
            className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-50">
            Revisar y activar el cobro proporcional
          </button>
        )}
        {elegido === 'ENTERA' && modoActivo === 'PROPORCIONAL' && (
          <button type="button" disabled={guardando} onClick={() => void cambiarModo('ENTERA')}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Volver a la cuota entera'}
          </button>
        )}
      </div>

      {confirmando && vista && (
        <div ref={dialogoRef} tabIndex={-1} className="mt-3 rounded-lg border border-brand p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand" role="alertdialog" aria-labelledby="titulo-confirmar-alineacion" aria-describedby="texto-confirmar-alineacion"
          onKeyDown={e => { if (e.key === 'Escape' && !guardando) setConfirmando(false); }}>
          <p id="titulo-confirmar-alineacion" className="text-sm font-medium text-foreground">¿Cobrar solo la parte proporcional a las alumnas actuales?</p>
          <p id="texto-confirmar-alineacion" className="mt-1 text-sm text-muted-foreground text-pretty">
            {vista.alumnas === 0
              ? 'Hoy no cambia ninguna alumna. Quedará activado para las cuotas que lleguen a renovar en adelante. '
              : <>Afecta a <strong className="font-medium text-foreground">{vista.alumnas} {vista.alumnas === 1 ? 'alumna' : 'alumnas'}</strong>, que renuevan entre el {primeraFecha ? fechaCorta(primeraFecha) : '—'} y el {ultimaFecha ? fechaCorta(ultimaFecha) : '—'}. En esas renovaciones cobrarás <strong className="font-medium text-foreground">{eur(vista.totalCobraB)} en total</strong> en vez de {eur(sumaCuotas)} de cuotas enteras; el día 1 vuelven a pagar la entera. </>}
            No se cambia ninguna cuota ahora: cada una cambia solo cuando le toca renovar. Puedes volver a la cuota entera cuando quieras; las que ya se alinearon siguen alineadas.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={guardando} onClick={() => void cambiarModo('PROPORCIONAL')} className="h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground disabled:opacity-50">
              {guardando ? 'Activando…' : 'Sí, activar'}
            </button>
            <button type="button" disabled={guardando} onClick={() => setConfirmando(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
