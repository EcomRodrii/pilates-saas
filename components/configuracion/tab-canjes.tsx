'use client';

import { useMemo, useState } from 'react';
import { Gift, Check, X, Clock, Search } from 'lucide-react';
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

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<'TODOS' | EstadoCanje>('TODOS');

  const { pendientes, resueltos, hayAlguno } = useMemo(() => {
    const orden = [...rewardRedemptions].sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? ''));
    // Se busca por NOMBRE y por CÓDIGO. El código es lo que la socia trae en el
    // móvil y lo que se dicta en el mostrador; sin poder buscarlo, tenerlo no
    // sirve de nada cuando el historial pasa de una pantalla.
    // Los nombres se resuelven AQUÍ y no con los ayudantes de abajo: usarlos
    // metería en las dependencias del memo dos funciones que se recrean en cada
    // render, y con el React Compiler eso cascadea. Mismo motivo por el que
    // este repo evita variables derivadas en dependencias.
    const q = busqueda.trim().toLowerCase();
    const nombreDe = (id: string | null) => socios.find(s => s.id === id)?.nombre ?? '';
    const recompensaDe = (id: string | null) => rewardCatalog.find(c => c.id === id)?.nombre ?? '';
    const casa = (r: RewardRedemption) => !q
      || nombreDe(r.socioId).toLowerCase().includes(q)
      || (r.codigo ?? '').toLowerCase().includes(q)
      || recompensaDe(r.catalogItemId).toLowerCase().includes(q);
    const visibles = orden.filter(casa);
    return {
      pendientes: visibles.filter(r => r.estado === 'PENDIENTE'),
      // El filtro solo acota el HISTORIAL. Lo pendiente es lo accionable y
      // esconderlo tras un desplegable es cómo se queda alguien sin su botella.
      resueltos: visibles.filter(r => r.estado !== 'PENDIENTE' && (filtro === 'TODOS' || r.estado === filtro)),
      hayAlguno: orden.length > 0,
    };
  }, [rewardRedemptions, busqueda, filtro, socios, rewardCatalog]);

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
            {canje.codigo ? ` · ${canje.codigo}` : ''}
          </p>
        </div>
        {accionable ? (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => resolver(canje, 'ENTREGADO')}
              disabled={ocupado}
              className={cn(btnPrimary, 'disabled:opacity-50')}
            >
              {/* VERBO, no estado. Decía «Entregado», que es lo que la fila
                  pasará a ser — y desde que hay un filtro «Entregados» al lado,
                  la misma pantalla tenía dos cosas casi iguales que hacen cosas
                  distintas. «Entregar» es además lo que dice la tarjeta de la
                  home, que hace exactamente esto. */}
              <Check size={14} /> Entregar
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
      {/* Buscar y filtrar solo aparecen si hay algo que buscar: en un estudio
          que acaba de encender las recompensas, una barra vacía es ruido. */}
      {hayAlguno && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por clienta, recompensa o código…"
              aria-label="Buscar canjes"
              className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[13px]"
            />
          </div>
          {(['TODOS', 'ENTREGADO', 'CANCELADO'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={cn(
                'h-9 rounded-xl border px-3 text-[12px] font-semibold transition-colors',
                filtro === f ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {f === 'TODOS' ? 'Todo el historial' : ETIQUETA[f] + 's'}
            </button>
          ))}
        </div>
      )}

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
