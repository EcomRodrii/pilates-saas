'use client';

// Fila 11 del informe estratégico: "La nómina de instructoras genera
// conflictos" → liquidación desglosada y transparente. NO mueve dinero real
// — genera un documento (BORRADOR→CONFIRMADA→PAGADA) que explica cuánto se
// le debe a cada instructora y por qué. El pago sigue haciéndose fuera de
// Tentare; aquí solo se anota que se pagó.

import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import {
  fetchTarifasEquipo, actualizarTarifaInstructor, fetchLiquidaciones, generarLiquidacion,
  transicionarLiquidacion, type TarifaInstructor, type Liquidacion,
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
  const [liquidaciones, setLiquidaciones] = useState<Record<string, Liquidacion>>({});
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);

  const activos = useMemo(() => instructores.filter(i => i.activo && i.rol === 'INSTRUCTOR'), [instructores]);

  useEffect(() => {
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true);
    Promise.all([fetchTarifasEquipo(), fetchLiquidaciones(anio, mes)]).then(([tar, liq]) => {
      if (!vivo) return;
      setTarifas(Object.fromEntries(tar.map(t => [t.instructorId, t])));
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
    setTarifas(prev => ({ ...prev, [instructorId]: siguiente }));
    const r = await actualizarTarifaInstructor(instructorId, siguiente.tarifaHora, {
      baseMensualEur: siguiente.baseMensualEur, recargoSustitucionPct: siguiente.recargoSustitucionPct,
    });
    if (!r.ok) showToast(r.error ?? 'No se pudo guardar');
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
        description="Base + variable por clase + sustituciones + reparto de penalizaciones. Un desglose transparente — el pago se hace fuera de Tentare."
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
                    {liq && (
                      <span className={`inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        liq.estado === 'PAGADA' ? 'bg-emerald-500/15 text-emerald-600' :
                        liq.estado === 'CONFIRMADA' ? 'bg-blue-500/15 text-blue-600' : 'bg-amber-500/15 text-amber-600'
                      }`}>
                        {liq.estado === 'PAGADA' ? 'Pagada' : liq.estado === 'CONFIRMADA' ? 'Confirmada' : 'Borrador'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
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

                {liq ? (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
                    <div><p className="text-muted-foreground">Base</p><p className="font-semibold text-foreground">{formatEuro(liq.baseEur)}</p></div>
                    <div><p className="text-muted-foreground">{liq.nClasesPropias} clases propias</p><p className="font-semibold text-foreground">{formatEuro(liq.variablePropiasEur)}</p></div>
                    <div><p className="text-muted-foreground">{liq.nClasesSustitucion} sustituciones</p><p className="font-semibold text-foreground">{formatEuro(liq.variableSustitucionEur)}</p></div>
                    <div><p className="text-muted-foreground">{liq.nPenalizaciones} penalizaciones</p><p className="font-semibold text-foreground">{formatEuro(liq.repartoPenalizacionesEur)}</p></div>
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
                            <button onClick={() => handleTransicion(liq, 'confirmar')} disabled={procesandoId === i.id}
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
