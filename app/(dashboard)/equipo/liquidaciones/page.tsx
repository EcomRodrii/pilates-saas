'use client';

// Fila 11 del informe estratégico: "La nómina de instructoras genera
// conflictos" → liquidación desglosada y transparente. NO mueve dinero real
// — genera un documento (BORRADOR→CONFIRMADA→PAGADA) que explica cuánto se
// le debe a cada instructora y por qué. El pago sigue haciéndose fuera de
// Tentare; aquí solo se anota que se pagó.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { AvisoControlHorario } from '@/components/equipo/aviso-control-horario';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import {
  leerTarifasEquipo, actualizarTarifaInstructor, fetchLiquidaciones, generarLiquidacion,
  transicionarLiquidacion, fetchTiempoTrabajado, fetchModoLiquidacion, guardarModoLiquidacion, guardarRelacionLaboral,
  type TarifaInstructor, type Liquidacion, type ModoLiquidacion,
} from '@/lib/api-client';
import { formatEuro } from '@/lib/utils';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const inputCls = 'w-24 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 transition-all';

export default function LiquidacionesPage() {
  const rol = useRol();
  const { instructores } = useStudio();
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();

  const ahora = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(ahora.getFullYear());
  const [mes, setMes] = useState(ahora.getMonth() + 1);

  const [tarifas, setTarifas] = useState<Record<string, TarifaInstructor>>({});
  // Sin poder leer las tarifas no sabemos quién tiene relación: el aviso se calla.
  const [tarifasLeidas, setTarifasLeidas] = useState(false);
  const [liquidaciones, setLiquidaciones] = useState<Record<string, Liquidacion>>({});
  // Minutos fichados por instructora en el mes. `null` = no se pudo leer: no se
  // pinta nada antes que un «0 h» que no es verdad.
  const [fichado, setFichado] = useState<Map<string, number> | null>(null);
  // Con qué calcula el estudio la parte variable. `null` = no se sabe todavía.
  const [criterio, setCriterio] = useState<{ modo: ModoLiquidacion; pagarDuracionReal: boolean; puedeCambiar: boolean } | null>(null);
  const [guardandoCriterio, setGuardandoCriterio] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const activos = useMemo(() => instructores.filter(i => i.activo && i.rol === 'INSTRUCTOR'), [instructores]);

  useEffect(() => {
    let vivo = true;
    fetchModoLiquidacion().then(c => { if (vivo) setCriterio(c); });
    return () => { vivo = false; };
  }, []);

  async function cambiarCriterio(modo: ModoLiquidacion) {
    if (!criterio || modo === criterio.modo || guardandoCriterio) return;
    const texto = modo === 'HORAS_FICHADAS'
      ? 'A partir de ahora, los borradores pagarán las horas fichadas (jornadas cerradas) × tarifa por hora, sin recargo de sustitución. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?'
      : 'A partir de ahora, los borradores volverán a pagar las horas de clase × tarifa por hora. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?';
    if (!window.confirm(texto)) return;
    setGuardandoCriterio(true);
    const r = await guardarModoLiquidacion({ modo });
    setGuardandoCriterio(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setCriterio({ ...criterio, modo });
    showToast('Criterio guardado. Recalcula los borradores de este mes para aplicarlo.');
  }

  async function cambiarDuracionReal(pagarDuracionReal: boolean) {
    if (!criterio || guardandoCriterio) return;
    const texto = pagarDuracionReal
      ? 'A partir de ahora, cada clase dada se pagará por lo que duró de verdad: si empezó 10 min tarde o acabó antes, se paga menos. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?'
      : 'A partir de ahora, cada clase dada se pagará por su horario entero, aunque empezara tarde o acabara antes. Las liquidaciones confirmadas o pagadas no cambian. ¿Seguimos?';
    if (!window.confirm(texto)) return;
    setGuardandoCriterio(true);
    const r = await guardarModoLiquidacion({ pagarDuracionReal });
    setGuardandoCriterio(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setCriterio({ ...criterio, pagarDuracionReal });
    showToast('Criterio guardado. Recalcula los borradores de este mes para aplicarlo.');
  }

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    Promise.all([leerTarifasEquipo(), fetchLiquidaciones(anio, mes), fetchTiempoTrabajado(anio, mes)]).then(([tar, liq, tiempo]) => {
      if (!vivo) return;
      setFichado(tiempo ? new Map(tiempo.resumen.map(r => [r.instructorId, r.minutos])) : null);
      setTarifas(Object.fromEntries((tar ?? []).map(t => [t.instructorId, t])));
      setTarifasLeidas(tar !== null);
      setLiquidaciones(Object.fromEntries(liq.map(l => [l.instructorId, l])));
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [anio, mes]);

  async function handleGenerar(instructorId: string) {
    setProcesandoId(instructorId);
    const r = await generarLiquidacion(instructorId, anio, mes);
    setProcesandoId(null);
    if (r.ok && r.item) {
      setLiquidaciones(prev => ({ ...prev, [instructorId]: r.item! }));
    } else {
      showToast(r.error ?? 'No se pudo generar la liquidación');
    }
  }

  async function handleTransicion(liq: Liquidacion, accion: 'confirmar' | 'marcar_pagada') {
    let referenciaPago: string | undefined;
    if (accion === 'marcar_pagada') {
      referenciaPago = window.prompt('Referencia del pago (opcional): transferencia, Bizum, fecha...') ?? undefined;
    }
    setProcesandoId(liq.instructorId);
    const r = await transicionarLiquidacion(liq.id, accion, referenciaPago);
    setProcesandoId(null);
    if (r.ok && r.item) {
      setLiquidaciones(prev => ({ ...prev, [liq.instructorId]: r.item! }));
    } else {
      showToast(r.error ?? 'No se pudo actualizar la liquidación');
    }
  }

  async function handleGuardarTarifa(instructorId: string, campo: 'tarifaHora' | 'baseMensualEur' | 'recargoSustitucionPct', valor: string) {
    const actual = tarifas[instructorId];
    const n = valor.trim() === '' ? null : Number(valor);
    if (n !== null && !Number.isFinite(n)) return;
    const base: TarifaInstructor = actual ?? { instructorId, tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null };
    const siguiente: TarifaInstructor = { ...base, [campo]: n };
    // 44ª pasada de auditoría, hallazgo #4: antes esto se escribía optimista
    // ANTES de confirmar el PATCH, sin revertir si fallaba (rol sin permiso,
    // red caída). Ahora solo se refleja en el estado tras la confirmación
    // real del servidor.
    const r = await actualizarTarifaInstructor(instructorId, siguiente.tarifaHora, {
      baseMensualEur: siguiente.baseMensualEur, recargoSustitucionPct: siguiente.recargoSustitucionPct,
    });
    if (r.ok) {
      setTarifas(prev => ({ ...prev, [instructorId]: siguiente }));
    } else {
      showToast(r.error ?? 'No se pudo guardar');
    }
  }

  async function handleRelacion(instructorId: string, valor: string) {
    const relacion = valor === 'CONTRATADA' || valor === 'AUTONOMA' ? valor : null;
    const r = await guardarRelacionLaboral(instructorId, relacion);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar'); return; }
    setTarifas(prev => ({
      ...prev,
      [instructorId]: { ...(prev[instructorId] ?? { instructorId, tarifaHora: null, baseMensualEur: null, recargoSustitucionPct: null, horasSemanalesContrato: null }), relacionLaboral: relacion },
    }));
    showToast(relacion === 'AUTONOMA'
      ? 'Guardado: como autónoma no fichará jornada, confirmará sus clases.'
      : relacion === 'CONTRATADA' ? 'Guardado: como contratada fichará su jornada.' : 'Guardado.');
  }

  if (!puedeGestionarEquipo(rol)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Liquidaciones" back={{ href: '/equipo', label: 'Volver a Equipo' }} />
        <p className="text-sm text-muted-foreground">No tienes permiso para ver esta pantalla.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Liquidaciones de instructoras"
        description={criterio?.modo === 'HORAS_FICHADAS'
          ? 'Base + horas fichadas + reparto de penalizaciones. Un desglose transparente — el pago se hace fuera de Tentare.'
          : 'Base + variable por clase + sustituciones + reparto de penalizaciones. Un desglose transparente — el pago se hace fuera de Tentare.'}
        back={{ href: '/equipo', label: 'Volver a Equipo' }}
        actions={
          <div className="flex items-center gap-2">
            <select value={mes} onChange={e => setMes(Number(e.target.value))} className={inputCls + ' w-auto'}>
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={anio} onChange={e => setAnio(Number(e.target.value))} className={inputCls + ' w-20'}>
              {[ahora.getFullYear() - 1, ahora.getFullYear(), ahora.getFullYear() + 1].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        }
      />

      {tarifasLeidas && (
        <AvisoControlHorario enLiquidaciones
          pendientes={activos.filter(i => !tarifas[i.id]?.relacionLaboral).map(i => ({ id: i.id, nombre: i.nombre }))} />
      )}

      {criterio && (
        <div className="rounded-2xl border border-border bg-card px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-[13px]" data-testid="criterio-liquidacion">
          <span className="min-w-0">
            <span className="block text-muted-foreground">Parte variable calculada por</span>
            <span className="block text-[12px] text-muted-foreground/80">
              {criterio.modo === 'HORAS_FICHADAS'
                ? 'Horas de jornadas cerradas × tarifa por hora. Sin recargo de sustitución: esas horas ya están en lo fichado.'
                : 'Horas de cada clase dada × tarifa por hora, con recargo en las sustituciones.'}
            </span>
          </span>
          {criterio.puedeCambiar ? (
            <select aria-label="Calcular la parte variable por" value={criterio.modo} disabled={guardandoCriterio}
              onChange={e => void cambiarCriterio(e.target.value as ModoLiquidacion)} className={inputCls + ' w-auto'}>
              <option value="CLASES">horas de clase</option>
              <option value="HORAS_FICHADAS">horas fichadas</option>
            </select>
          ) : (
            <span className="font-semibold text-foreground">{criterio.modo === 'HORAS_FICHADAS' ? 'horas fichadas' : 'horas de clase'}</span>
          )}
          <div className="basis-full flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3" data-testid="criterio-duracion">
            <span className="min-w-0">
              <span className="block text-muted-foreground">Cada clase dada se paga por</span>
              <span className="block text-[12px] text-muted-foreground/80">
                {criterio.pagarDuracionReal
                  ? 'Lo que duró de verdad: desde que la empezó en la app hasta que acabó. Un retraso se descuenta.'
                  : 'Su horario entero. Si empezó tarde, se ve el retraso, pero no se descuenta.'}
                {' '}Las autónomas se pagan siempre por clases.
              </span>
            </span>
            {criterio.puedeCambiar ? (
              <select aria-label="Pagar cada clase por" value={criterio.pagarDuracionReal ? 'real' : 'horario'} disabled={guardandoCriterio}
                onChange={e => void cambiarDuracionReal(e.target.value === 'real')} className={inputCls + ' w-auto'}>
                <option value="horario">su horario</option>
                <option value="real">lo que duró</option>
              </select>
            ) : (
              <span className="font-semibold text-foreground">{criterio.pagarDuracionReal ? 'lo que duró' : 'su horario'}</span>
            )}
          </div>
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : activos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay instructoras de alta.</p>
      ) : (
        <div className="space-y-4">
          {activos.map(i => {
            const tarifa = tarifas[i.id];
            const liq = liquidaciones[i.id];
            return (
              <div key={i.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-foreground">{i.nombre}</h2>
                    {fichado && (
                      <Link href="/equipo/tiempo-trabajado" className="block mt-0.5 text-[12px] text-muted-foreground hover:text-foreground hover:underline" data-testid="fichado-mes">
                        Fichado en {MESES[mes - 1]}: {Math.floor((fichado.get(i.id) ?? 0) / 60)} h {String((fichado.get(i.id) ?? 0) % 60).padStart(2, '0')} min
                      </Link>
                    )}
                    {liq && (
                      <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        liq.estado === 'PAGADA' ? 'bg-emerald-500/15 text-emerald-600' :
                        liq.estado === 'CONFIRMADA' ? 'bg-blue-500/15 text-blue-600' : 'bg-amber-500/15 text-amber-600'
                      }`}>
                        {liq.estado === 'PAGADA' ? 'Pagada' : liq.estado === 'CONFIRMADA' ? 'Confirmada' : 'Borrador'}
                      </span>
                    )}
                    {liq?.requiereRevision && (
                      <span className="inline-block mt-1 ml-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">
                        Requiere revisión{liq.revisionMotivo ? `: ${liq.revisionMotivo}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                    <label className="flex items-center gap-1">
                      Relación
                      <select aria-label={`Relación de ${i.nombre} con el estudio`} className={inputCls + ' w-auto'}
                        value={tarifa?.relacionLaboral ?? ''} onChange={e => void handleRelacion(i.id, e.target.value)}>
                        <option value="">Sin definir</option>
                        <option value="CONTRATADA">Contratada</option>
                        <option value="AUTONOMA">Autónoma</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-1">
                      Tarifa/h
                      <input type="number" min={0} step={0.01} className={inputCls}
                        defaultValue={tarifa?.tarifaHora ?? ''} placeholder="—"
                        onBlur={e => handleGuardarTarifa(i.id, 'tarifaHora', e.target.value)} />
                    </label>
                    <label className="flex items-center gap-1">
                      Base/mes
                      <input type="number" min={0} step={0.01} className={inputCls}
                        defaultValue={tarifa?.baseMensualEur ?? ''} placeholder="—"
                        onBlur={e => handleGuardarTarifa(i.id, 'baseMensualEur', e.target.value)} />
                    </label>
                    <label className="flex items-center gap-1">
                      Recargo sub. %
                      <input type="number" min={0} step={0.01} className={inputCls}
                        defaultValue={tarifa?.recargoSustitucionPct ?? ''} placeholder="—"
                        onBlur={e => handleGuardarTarifa(i.id, 'recargoSustitucionPct', e.target.value)} />
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground" data-testid="relacion-explicacion">
                  {tarifa?.relacionLaboral === 'CONTRATADA'
                    ? 'Contratada: ficha su jornada de entrada y salida, como exige la ley, y además empieza sus clases desde la app.'
                    : tarifa?.relacionLaboral === 'AUTONOMA'
                      ? 'Autónoma: no ficha jornada. Empieza sus clases desde la app, o las confirma después si se le olvida.'
                      : 'Indica si trabaja contratada (ficha su jornada) o como autónoma (solo confirma sus clases).'}
                </p>

                {liq ? (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                    <div><p className="text-muted-foreground">Base</p><p className="font-semibold text-foreground">{formatEuro(liq.baseEur)}</p></div>
                    {liq.modo === 'HORAS_FICHADAS' ? (
                      <>
                        <div data-testid="variable-fichado">
                          <p className="text-muted-foreground">{Math.floor((liq.minutosFichados ?? 0) / 60)} h {String((liq.minutosFichados ?? 0) % 60).padStart(2, '0')} min fichadas</p>
                          <p className="font-semibold text-foreground">{formatEuro(liq.variablePropiasEur)}</p>
                        </div>
                        <div><p className="text-muted-foreground">Clases del mes</p><p className="font-semibold text-foreground">{liq.nClasesPropias + liq.nClasesSustitucion}</p></div>
                      </>
                    ) : (
                      <>
                        <div><p className="text-muted-foreground">{liq.nClasesPropias} clases propias</p><p className="font-semibold text-foreground">{formatEuro(liq.variablePropiasEur)}</p></div>
                        <div><p className="text-muted-foreground">{liq.nClasesSustitucion} sustituciones</p><p className="font-semibold text-foreground">{formatEuro(liq.variableSustitucionEur)}</p></div>
                      </>
                    )}
                    <div><p className="text-muted-foreground">{liq.nPenalizaciones} penalizaciones</p><p className="font-semibold text-foreground">{formatEuro(liq.repartoPenalizacionesEur)}</p></div>
                    {liq.modo === 'HORAS_FICHADAS' && liq.jornadasSinCerrar > 0 && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-amber-600" data-testid="jornadas-sin-cerrar">
                        {liq.jornadasSinCerrar === 1
                          ? 'Una jornada de este mes está sin cerrar: no se paga ni se puede confirmar hasta corregirla en '
                          : `${liq.jornadasSinCerrar} jornadas de este mes están sin cerrar: no se pagan ni se puede confirmar hasta corregirlas en `}
                        <Link href="/equipo/tiempo-trabajado" className="underline">Tiempo trabajado</Link>.
                      </p>
                    )}
                    {(liq.clasesSinConfirmar ?? 0) > 0 && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-amber-600" data-testid="clases-sin-confirmar-liq">
                        {liq.clasesSinConfirmar === 1
                          ? 'Una clase de este mes terminó sin saberse si la dio. Se ha contado por su horario, pero no se puede confirmar hasta revisarla en '
                          : `${liq.clasesSinConfirmar} clases de este mes terminaron sin saberse si las dio. Se han contado por su horario, pero no se puede confirmar hasta revisarlas en `}
                        <Link href="/equipo/tiempo-trabajado" className="underline">Tiempo trabajado</Link>.
                      </p>
                    )}
                    {(liq.clasesNoDadas ?? 0) > 0 && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-muted-foreground" data-testid="clases-no-dadas-liq">
                        {liq.clasesNoDadas === 1 ? 'Una clase que dijo no dar no se paga.' : `${liq.clasesNoDadas} clases que dijo no dar no se pagan.`}
                      </p>
                    )}
                    {(liq.minutosRetraso ?? 0) > 0 && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-muted-foreground" data-testid="retraso-liq">
                        Empezó tarde {liq.minutosRetraso} min en total este mes
                        {criterio?.pagarDuracionReal ? ' (descontados).' : ' (no se descuentan: se paga el horario).'}
                      </p>
                    )}
                    {liq.minutosExtra != null && liq.minutosContrato != null && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-muted-foreground" data-testid="extra-liq">
                        Contrato: {Math.round(liq.minutosContrato / 60)} h este mes.
                        {liq.minutosExtra > 0
                          ? ` Ha fichado ${Math.floor(liq.minutosExtra / 60)} h ${String(liq.minutosExtra % 60).padStart(2, '0')} min de más: se enseñan, no se pagan aparte.`
                          : ' No ha fichado horas de más.'}
                      </p>
                    )}
                    {liq.relacionLaboral === 'AUTONOMA' && liq.modo === 'CLASES' && criterio?.modo === 'HORAS_FICHADAS' && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-muted-foreground">Como autónoma no ficha jornada: se le paga por clases.</p>
                    )}
                    {liq.nClasesSinTarifa > 0 && (
                      <p className="col-span-2 sm:col-span-4 text-[12px] text-amber-600">
                        {liq.nClasesSinTarifa} {liq.nClasesSinTarifa === 1 ? 'clase' : 'clases'} sin tarifa fijada — no se han valorado.
                      </p>
                    )}
                    <div className="col-span-2 sm:col-span-4 flex items-center justify-between border-t border-border pt-3">
                      <p className="text-[15px] font-bold text-foreground">Total: {formatEuro(liq.totalEur)}</p>
                      <div className="flex gap-2">
                        {liq.estado === 'BORRADOR' && (
                          <>
                            <button onClick={() => handleGenerar(i.id)} disabled={procesandoId === i.id}
                              className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                              Recalcular
                            </button>
                            <button onClick={() => handleTransicion(liq, 'confirmar')}
                              disabled={procesandoId === i.id || (liq.modo === 'HORAS_FICHADAS' && liq.jornadasSinCerrar > 0) || (liq.clasesSinConfirmar ?? 0) > 0}
                              className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-semibold hover:brightness-95 disabled:opacity-50">
                              Confirmar
                            </button>
                          </>
                        )}
                        {liq.estado === 'CONFIRMADA' && (
                          <button onClick={() => handleTransicion(liq, 'marcar_pagada')} disabled={procesandoId === i.id}
                            className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-semibold hover:brightness-95 disabled:opacity-50">
                            Marcar como pagada
                          </button>
                        )}
                        {liq.estado === 'PAGADA' && liq.referenciaPago && (
                          <span className="text-[12px] text-muted-foreground self-center">Ref: {liq.referenciaPago}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <button onClick={() => handleGenerar(i.id)} disabled={procesandoId === i.id}
                      className="px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-foreground hover:bg-muted disabled:opacity-50">
                      Generar liquidación de {MESES[mes - 1]}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
