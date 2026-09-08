'use client';

import { useMemo, useState } from 'react';
import { Gift, Check, X, Clock } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { EstadoCanje, RewardRedemption } from '@/lib/types';
import { cn } from '@/lib/utils';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Los canjes de las socias, y qué hacer con ellos.
//
// Esta pantalla no existía. El canje funcionaba entero —se cobraban los
// créditos, se reservaba el stock, se escribía la fila en PENDIENTE— y ahí se
// acababa: `updateRewardRedemptionEstado` llevaba meses en el contexto sin un
// solo consumidor, y ninguna pantalla leía `reward_redemptions`. El estado
// ENTREGADO estaba en el CHECK de la tabla y no lo escribía nadie. Mientras
// tanto el portal le prometía a la socia «El estudio te avisará».
//
// Dos cosas la hacen útil de verdad y no solo un listado:
//  · Los PENDIENTES van arriba y separados. Es lo único accionable; el resto
//    es histórico y estorba si se mezcla.
//  · Cancelar DEVUELVE los créditos y el stock (RPC `cancelar_canje`). Un
//    botón que solo cambiase la etiqueta a CANCELADO dejaría a la socia sin
//    recompensa y sin créditos, que es peor que no tener el botón.

const ETIQUETA: Record<EstadoCanje, string> = {
  PENDIENTE: 'Pendiente',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function TabCanjes({ showToast }: { showToast: (m: string) => void }) {
  const { rewardRedemptions, rewardCatalog, socios, updateRewardRedemptionEstado, studio } = useStudio();
  const moneda = nombreCreditos(studio?.creditosNombre);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const { pendientes, resueltos } = useMemo(() => {
    const orden = [...rewardRedemptions].sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? ''));
    return {
      pendientes: orden.filter(r => r.estado === 'PENDIENTE'),
      resueltos: orden.filter(r => r.estado !== 'PENDIENTE'),
    };
  }, [rewardRedemptions]);

  const nombreSocia = (socioId: string | null) =>
    socios.find(s => s.id === socioId)?.nombre ?? 'Socia dada de baja';
  const nombreRecompensa = (itemId: string | null) =>
    rewardCatalog.find(c => c.id === itemId)?.nombre ?? 'Recompensa retirada del catálogo';

  async function resolver(canje: RewardRedemption, estado: EstadoCanje) {
    setEnCurso(canje.id);
    const res = await updateRewardRedemptionEstado(canje.id, estado);
    setEnCurso(null);
    if (!res.ok) { showToast(res.error); return; }
    showToast(estado === 'ENTREGADO'
      ? 'Canje marcado como entregado'
      : `Canje cancelado — se han devuelto ${canje.creditosGastados} ${moneda}`);
  }

  function Fila({ canje, accionable }: { canje: RewardRedemption; accionable: boolean }) {
    const ocupado = enCurso === canje.id;
    return (
      <div className={cn(cardCls, 'p-4 flex items-center gap-3')}>
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <Gift size={16} className="text-brand-secondary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-foreground truncate">
            {nombreRecompensa(canje.catalogItemId)}
          </p>
          <p className="text-[12px] text-muted-foreground truncate">
            {nombreSocia(canje.socioId)} · {canje.creditosGastados} {moneda} · {fechaCorta(canje.creadoEn)}
          </p>
        </div>
        {accionable ? (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => resolver(canje, 'ENTREGADO')}
              disabled={ocupado}
              className={cn(btnPrimary, 'disabled:opacity-50')}
            >
              <Check size={14} /> Entregado
            </button>
            <button
              onClick={() => resolver(canje, 'CANCELADO')}
              disabled={ocupado}
              className={cn(btnSecondary, 'disabled:opacity-50')}
              title={`Devuelve los ${moneda} a la socia y el stock al catálogo`}
            >
              <X size={14} /> Cancelar
            </button>
          </div>
        ) : (
          <span className={cn(
            'text-[10px] font-bold uppercase tracking-wide shrink-0',
            canje.estado === 'ENTREGADO' ? 'text-brand-secondary' : 'text-muted-foreground',
          )}>
            {ETIQUETA[canje.estado]}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-brand-secondary" />
          <h3 className="text-[14px] font-semibold text-foreground">Pendientes de entregar</h3>
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Lo que tus clientas ya han pagado con sus {moneda} y esperan recibir. Cancelar
          se los devuelve y repone el stock.
        </p>
        {pendientes.length === 0 ? (
          <div className={cn(cardCls, 'p-8 text-center')}>
            <p className="text-[13px] text-muted-foreground">No hay canjes pendientes.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendientes.map(c => <Fila key={c.id} canje={c} accionable />)}
          </div>
        )}
      </div>

      {resueltos.length > 0 && (
        <div>
          <h3 className="text-[14px] font-semibold text-foreground mb-1">Historial</h3>
          <p className="text-[12px] text-muted-foreground mb-3">Canjes ya entregados o cancelados.</p>
          <div className="space-y-3">
            {resueltos.map(c => <Fila key={c.id} canje={c} accionable={false} />)}
          </div>
        </div>
      )}
    </div>
  );
}
