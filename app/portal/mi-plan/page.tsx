'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { CheckCircle2, Clock, XCircle, FileText, CreditCard, AlertCircle } from 'lucide-react';

type Filtro = 'TODOS' | 'COBRADO' | 'PENDIENTE';

export default function MiPlanPage() {
  const { session } = usePortalAuth();
  const { suscripciones, planesTarifa, recibos, facturas } = useStudio();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const socioId = session?.socioId;

  const suscripcion = useMemo(() =>
    suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA') ??
    suscripciones.filter(s => s.socioId === socioId).sort((a, b) =>
      new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())[0] ?? null,
  [suscripciones, socioId]);

  const plan = useMemo(() =>
    suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) ?? null : null,
  [planesTarifa, suscripcion]);

  const misRecibos = useMemo(() =>
    recibos.filter(r => r.socioId === socioId)
      .sort((a, b) => new Date(b.fechaVencimiento).getTime() - new Date(a.fechaVencimiento).getTime()),
  [recibos, socioId]);

  const recibosFiltrados = useMemo(() => {
    if (filtro === 'COBRADO') return misRecibos.filter(r => r.estado === 'COBRADO');
    if (filtro === 'PENDIENTE') return misRecibos.filter(r => r.estado === 'PENDIENTE' || r.estado === 'EN_CURSO');
    return misRecibos;
  }, [misRecibos, filtro]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const formatEur = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  const sesionesProgress = plan?.tipo === 'BONO' && plan.sesiones && suscripcion?.sesionesRestantes != null
    ? Math.min(100, Math.round((suscripcion.sesionesRestantes / plan.sesiones) * 100))
    : null;

  const totalPagado = misRecibos.filter(r => r.estado === 'COBRADO').reduce((s, r) => s + r.importe, 0);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const caducada = !!(suscripcion?.fechaFin && suscripcion.fechaFin < hoyStr);

  return (
    <div className="bg-white min-h-full">

      {/* Header */}
      <div className="px-5 pt-6 pb-6" style={{ background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 60%, #A9DE20 100%)' }}>
        <h1 className="text-white text-[28px] font-extrabold tracking-tight">Mi plan</h1>
        <p className="text-indigo-300 text-[13px] mt-0.5">{formatEur(totalPagado)} pagado en total</p>
      </div>

      <div className="px-4 pt-4 pb-6 space-y-5">

        {/* Plan card */}
        {plan && suscripcion ? (
          <div className="rounded-3xl overflow-hidden shadow-md" style={{ boxShadow: '0 4px 20px rgba(79,70,229,0.2)' }}>
            <div className="p-5" style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)' }}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-indigo-200 text-[11px] font-bold uppercase tracking-widest mb-1">
                    {plan.tipo === 'MENSUAL' ? 'Suscripción mensual' : 'Bono de sesiones'}
                  </p>
                  <p className="text-white text-[22px] font-extrabold leading-tight">{plan.nombre}</p>
                </div>
                {caducada ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500 text-white">Caducado</span>
                ) : (
                  <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
                    <CreditCard size={18} className="text-white" />
                  </div>
                )}
              </div>
              {caducada && (
                <div className="flex items-center gap-2 bg-white/15 rounded-2xl px-4 py-2.5 mb-3">
                  <AlertCircle size={15} className="text-white shrink-0" />
                  <p className="text-white text-[12px] font-medium leading-tight">
                    Venció el {formatDate(suscripcion.fechaFin!)}. Habla con tu instructor para renovar.
                  </p>
                </div>
              )}

              {sesionesProgress !== null && suscripcion.sesionesRestantes != null && plan.sesiones ? (
                <div className="bg-white/10 rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-white text-[24px] font-extrabold">{suscripcion.sesionesRestantes}</span>
                    <span className="text-white/60 text-[13px]">de {plan.sesiones} sesiones</span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${sesionesProgress}%`,
                      backgroundColor: suscripcion.sesionesRestantes > 3 ? '#A5F3FC' : '#FCA5A5',
                    }} />
                  </div>
                </div>
              ) : (
                <div className="bg-white/10 rounded-2xl px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-white/60 text-[11px]">Inicio</p>
                    <p className="text-white font-bold text-[14px]">{formatDate(suscripcion.fechaInicio)}</p>
                  </div>
                  {suscripcion.fechaFin && (
                    <div className="text-right">
                      <p className="text-white/60 text-[11px]">Vence</p>
                      <p className="text-white font-bold text-[14px]">{formatDate(suscripcion.fechaFin)}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-white/60 text-[11px]">Precio</p>
                    <p className="text-white font-extrabold text-[16px]">{formatEur(plan.precio)}/mes</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#F5F5F1] rounded-3xl p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#EDF9C8] flex items-center justify-center mx-auto mb-3">
              <CreditCard size={24} className="text-[#6B8E00]" />
            </div>
            <p className="font-bold text-[#171717] text-[16px]">Sin plan activo</p>
            <p className="text-[13px] text-[#8E8E93] mt-1">Habla con tu instructor para contratar un plan</p>
          </div>
        )}

        {/* Historial */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">Historial de pagos</p>
          </div>

          {/* Filtros */}
          <div className="flex gap-2 mb-4">
            {(['TODOS', 'COBRADO', 'PENDIENTE'] as Filtro[]).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className="px-3.5 py-1.5 rounded-2xl text-[12px] font-bold transition-all"
                style={{
                  backgroundColor: filtro === f ? '#171717' : '#F1F1EC',
                  color: filtro === f ? 'white' : '#8E8E86',
                }}
              >
                {f === 'TODOS' ? 'Todos' : f === 'COBRADO' ? 'Pagados' : 'Pendientes'}
              </button>
            ))}
          </div>

          {recibosFiltrados.length === 0 ? (
            <div className="rounded-2xl bg-[#F5F5F1] p-8 text-center">
              <p className="text-[14px] text-[#8E8E93]">Sin recibos en esta categoría</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recibosFiltrados.map(rec => {
                const factura = facturas.find(f => f.reciboId === rec.id);
                const cobrado = rec.estado === 'COBRADO';
                const devuelto = rec.estado === 'DEVUELTO';
                return (
                  <div key={rec.id} className="bg-white rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cobrado ? 'bg-green-50' : devuelto ? 'bg-red-50' : 'bg-amber-50'}`}>
                      {cobrado ? <CheckCircle2 size={18} className="text-green-600" />
                        : devuelto ? <XCircle size={18} className="text-red-500" />
                        : <Clock size={18} className="text-amber-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[#171717] truncate">{rec.concepto}</p>
                      <p className="text-[11px] text-[#8E8E93] mt-0.5">
                        {formatDate(rec.fechaCobro ?? rec.fechaVencimiento)}
                        {factura && <span className="text-[#6B8E00] ml-2 font-semibold">· Factura</span>}
                      </p>
                    </div>
                    <p className="text-[15px] font-extrabold shrink-0" style={{ color: cobrado ? '#059669' : '#8E8E93' }}>
                      {formatEur(rec.importe)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
