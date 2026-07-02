'use client';

import { useMemo, useState } from 'react';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { CreditCard, FileText, CheckCircle2, Clock, XCircle } from 'lucide-react';

type FiltroRecibo = 'TODOS' | 'COBRADO' | 'PENDIENTE';

export default function MiPlanPage() {
  const { session } = usePortalAuth();
  const { suscripciones, planesTarifa, recibos, facturas } = useStudio();
  const [filtro, setFiltro] = useState<FiltroRecibo>('TODOS');

  const socioId = session?.socioId;

  const suscripcion = useMemo(
    () => suscripciones.find(s => s.socioId === socioId && s.estado === 'ACTIVA') ??
          suscripciones.filter(s => s.socioId === socioId).sort((a, b) =>
            new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()
          )[0] ?? null,
    [suscripciones, socioId]
  );

  const plan = useMemo(
    () => suscripcion ? planesTarifa.find(p => p.id === suscripcion.planId) ?? null : null,
    [planesTarifa, suscripcion]
  );

  const misRecibos = useMemo(
    () => recibos
      .filter(r => r.socioId === socioId)
      .sort((a, b) => new Date(b.fechaVencimiento).getTime() - new Date(a.fechaVencimiento).getTime()),
    [recibos, socioId]
  );

  const recibosFiltrados = useMemo(() => {
    if (filtro === 'COBRADO') return misRecibos.filter(r => r.estado === 'COBRADO');
    if (filtro === 'PENDIENTE') return misRecibos.filter(r => r.estado === 'PENDIENTE' || r.estado === 'EN_CURSO');
    return misRecibos;
  }, [misRecibos, filtro]);

  const estadoBadge = (estado: string) => {
    if (estado === 'ACTIVA') return { label: 'Activa', bg: '#DCFCE7', color: '#059669' };
    if (estado === 'PAUSADA') return { label: 'Pausada', bg: '#FEF3C7', color: '#D97706' };
    if (estado === 'CANCELADA') return { label: 'Cancelada', bg: '#FEE2E2', color: '#DC2626' };
    return { label: estado, bg: '#F3F4F6', color: '#6B7280' };
  };

  const reciboBadge = (estado: string) => {
    if (estado === 'COBRADO') return { label: 'Cobrado', bg: '#DCFCE7', color: '#059669' };
    if (estado === 'DEVUELTO') return { label: 'Devuelto', bg: '#FEE2E2', color: '#DC2626' };
    return { label: 'Pendiente', bg: '#FEF3C7', color: '#D97706' };
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  const formatImporte = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  const tipoPlanLabel = (tipo: string) => {
    if (tipo === 'MENSUAL') return 'Suscripción mensual';
    if (tipo === 'BONO') return 'Bono de sesiones';
    return 'Pago puntual';
  };

  const precioLabel = (tipo: string, precio: number, sesiones: number | null) => {
    if (tipo === 'MENSUAL') return `${formatImporte(precio)}/mes`;
    if (tipo === 'BONO' && sesiones) return `${formatImporte(precio)} · ${sesiones} sesiones`;
    return formatImporte(precio);
  };

  const badge = suscripcion ? estadoBadge(suscripcion.estado) : null;

  const sesionesProgress = plan && plan.tipo === 'BONO' && plan.sesiones != null && suscripcion?.sesionesRestantes != null
    ? Math.min(100, Math.round((suscripcion.sesionesRestantes / plan.sesiones) * 100))
    : null;

  return (
    <div className="space-y-6 px-4 pt-5 pb-8">
      <div>
        <h1 className="text-2xl font-extrabold text-[#111827]">Mi plan</h1>
        <p className="text-sm text-[#9CA3AF] mt-0.5">Suscripción e historial de pagos</p>
      </div>

      {plan && suscripcion && badge ? (
        <div className="bg-white border border-[#E8EAED] rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-extrabold text-[#111827]">{plan.nombre}</p>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: badge.bg, color: badge.color }}
                >
                  {badge.label}
                </span>
              </div>
              <p className="text-sm text-[#6B7280]">{tipoPlanLabel(plan.tipo)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-extrabold text-[#4F46E5]">{precioLabel(plan.tipo, plan.precio, plan.sesiones)}</p>
            </div>
          </div>

          {plan.tipo === 'BONO' && sesionesProgress !== null && suscripcion.sesionesRestantes != null && plan.sesiones != null && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-[#111827]">{suscripcion.sesionesRestantes} sesiones restantes</span>
                <span className="text-[#9CA3AF]">de {plan.sesiones}</span>
              </div>
              <div className="h-2.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${sesionesProgress}%`,
                    backgroundColor: suscripcion.sesionesRestantes > 3 ? '#4F46E5' : '#EF4444',
                  }}
                />
              </div>
            </div>
          )}

          {plan.tipo === 'MENSUAL' && (
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-[#9CA3AF] text-xs">Inicio</p>
                <p className="font-semibold text-[#111827]">{formatDate(suscripcion.fechaInicio)}</p>
              </div>
              {suscripcion.fechaFin && (
                <div>
                  <p className="text-[#9CA3AF] text-xs">Vencimiento</p>
                  <p className="font-semibold text-[#111827]">{formatDate(suscripcion.fechaFin)}</p>
                </div>
              )}
            </div>
          )}

          {plan.descripcion && (
            <p className="text-xs text-[#6B7280] border-t border-[#F3F4F6] pt-3">{plan.descripcion}</p>
          )}
        </div>
      ) : (
        <div className="bg-[#F9FAFB] border border-dashed border-[#D1D5DB] rounded-2xl p-8 text-center space-y-2">
          <div className="w-12 h-12 bg-[#EEF2FF] rounded-2xl flex items-center justify-center mx-auto">
            <CreditCard size={22} className="text-[#4F46E5]" />
          </div>
          <p className="font-bold text-[#111827]">Sin plan activo</p>
          <p className="text-sm text-[#6B7280]">Habla con tu instructor para contratar un plan</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[#9CA3AF]">Historial de pagos</p>

        <div className="flex gap-2">
          {(['TODOS', 'COBRADO', 'PENDIENTE'] as FiltroRecibo[]).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors"
              style={{
                backgroundColor: filtro === f ? '#4F46E5' : '#fff',
                color: filtro === f ? '#fff' : '#6B7280',
                borderColor: filtro === f ? '#4F46E5' : '#E8EAED',
              }}
            >
              {f === 'TODOS' ? 'Todos' : f === 'COBRADO' ? 'Cobrados' : 'Pendientes'}
            </button>
          ))}
        </div>

        {recibosFiltrados.length > 0 ? (
          <div className="bg-white border border-[#E8EAED] rounded-2xl divide-y divide-[#F3F4F6]">
            {recibosFiltrados.map(recibo => {
              const rb = reciboBadge(recibo.estado);
              const factura = facturas.find(f => f.reciboId === recibo.id);
              const fecha = recibo.fechaCobro ?? recibo.fechaVencimiento;
              return (
                <div key={recibo.id} className="flex items-center gap-3 px-4 py-3.5">
                  <div className="shrink-0">
                    {recibo.estado === 'COBRADO' ? (
                      <CheckCircle2 size={18} className="text-[#059669]" />
                    ) : recibo.estado === 'DEVUELTO' ? (
                      <XCircle size={18} className="text-[#DC2626]" />
                    ) : (
                      <Clock size={18} className="text-[#D97706]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#111827] truncate">{recibo.concepto}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-[#9CA3AF]">{formatDate(fecha)}</p>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: rb.bg, color: rb.color }}
                      >
                        {rb.label}
                      </span>
                      {factura && (
                        <span className="text-[10px] font-semibold text-[#4F46E5] flex items-center gap-0.5">
                          <FileText size={9} />
                          Factura
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className="text-sm font-extrabold shrink-0"
                    style={{ color: recibo.estado === 'COBRADO' ? '#059669' : '#9CA3AF' }}
                  >
                    {formatImporte(recibo.importe)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-[#D1D5DB] rounded-2xl p-8 text-center">
            <p className="text-sm text-[#6B7280]">No hay recibos {filtro !== 'TODOS' ? 'en esta categoría' : 'todavía'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
