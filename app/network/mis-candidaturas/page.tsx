'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ClipboardList, ArrowRight } from 'lucide-react';
import { fetchMisCandidaturasNetwork, retirarCandidaturaNetwork } from '@/lib/api-client';
import type { CandidaturaNetwork, EstadoCandidatura } from '@/lib/network/tipos';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO, NW_ESTADO } from '@/components/network-v2/tokens';

// Rediseño 2026-09 (Fase 4 del mockup del fundador) — tokens NW_* en vez de
// cardCls de panel, mismo criterio que fases 1-3. A diferencia de lo que
// sugería el mockup ("Aún no has aplicado a nada" como único estado
// mostrado), esta pantalla YA era funcional de verdad — lista con estado,
// retirar candidatura, enlace a la conversación si fue aceptada — no un
// placeholder vacío. Se mantiene ese comportamiento tal cual, solo se
// reflowa visualmente y se agrupa en Activas/Resueltas (dato real, no
// inventado: son los mismos 7 estados de EstadoCandidatura que ya existían).
const ESTADO_LABEL: Record<EstadoCandidatura, string> = {
  recibida: 'Recibida', contactada: 'Contactada', entrevista: 'Entrevista', propuesta: 'Propuesta',
  aceptada: 'Aceptada', rechazada: 'No seleccionada', retirada: 'Retirada',
};
const ESTADO_ESTILO: Record<EstadoCandidatura, { fondo: string; color: string }> = {
  recibida: { fondo: NW_SAND, color: NW_MUTED_2 },
  contactada: { fondo: NW_ESTADO.pendiente.fondo, color: NW_ESTADO.pendiente.color },
  entrevista: { fondo: NW_ESTADO.pendiente.fondo, color: NW_ESTADO.pendiente.color },
  propuesta: { fondo: NW_ESTADO.pendiente.fondo, color: NW_ESTADO.pendiente.color },
  aceptada: { fondo: NW_ESTADO.verificada.fondo, color: NW_ESTADO.verificada.color },
  rechazada: { fondo: NW_SAND, color: NW_MUTED_2 },
  retirada: { fondo: NW_SAND, color: NW_MUTED_2 },
};
const ACTIVOS: EstadoCandidatura[] = ['recibida', 'contactada', 'entrevista', 'propuesta'];

function TarjetaCandidatura({
  c, retirando, onRetirar,
}: {
  c: CandidaturaNetwork; retirando: boolean; onRetirar: () => void;
}) {
  const estilo = ESTADO_ESTILO[c.estado];
  return (
    <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold truncate" style={{ color: NW_TINTA }}>{c.vacanteTitulo ?? 'Vacante eliminada'}</p>
          <p className="text-[12px]" style={{ color: NW_MUTED_2 }}>{c.estudioNombre}</p>
        </div>
        <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: estilo.fondo, color: estilo.color }}>
          {ESTADO_LABEL[c.estado]}
        </span>
      </div>
      {c.estado === 'aceptada' && c.solicitudId && (
        <Link
          href={`/network/mis-mensajes?hilo=${c.solicitudId}`}
          className="inline-flex items-center gap-1 text-[12px] font-bold mt-2.5"
          style={{ color: NW_PRODUCTO }}
        >
          Abrir conversación <ArrowRight size={11} />
        </Link>
      )}
      {ACTIVOS.includes(c.estado) && (
        <button
          onClick={onRetirar}
          disabled={retirando}
          className="text-[12px] mt-2.5 disabled:opacity-60 hover:opacity-70 transition-opacity"
          style={{ color: NW_MUTED }}
        >
          {retirando ? 'Retirando…' : 'Retirar candidatura'}
        </button>
      )}
    </div>
  );
}

export default function MisCandidaturasNetworkPage() {
  const [candidaturas, setCandidaturas] = useState<CandidaturaNetwork[] | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchMisCandidaturasNetwork().then(c => { if (vivo) setCandidaturas(c); });
    return () => { vivo = false; };
  }, []);

  async function retirar(id: string) {
    setRetirando(id);
    const res = await retirarCandidaturaNetwork(id);
    setRetirando(null);
    if (res.ok) setCandidaturas(await fetchMisCandidaturasNetwork());
  }

  const activas = useMemo(() => (candidaturas ?? []).filter(c => ACTIVOS.includes(c.estado)), [candidaturas]);
  const resueltas = useMemo(() => (candidaturas ?? []).filter(c => !ACTIVOS.includes(c.estado)), [candidaturas]);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>Mis candidaturas</h1>
        {candidaturas && candidaturas.length > 0 && (
          <p className="text-[13px] mt-0.5" style={{ color: NW_MUTED }}>
            {activas.length > 0 ? `${activas.length} activa${activas.length === 1 ? '' : 's'}` : 'Ninguna activa ahora mismo'}
          </p>
        )}
      </div>

      {!candidaturas ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin" style={{ color: NW_MUTED }} />
        </div>
      ) : candidaturas.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: NW_SAND }}>
          <ClipboardList size={22} style={{ color: NW_MUTED_2 }} className="mx-auto mb-2" />
          <p className="text-[13px] mb-3" style={{ color: NW_MUTED }}>Aún no has aplicado a nada.</p>
          <Link
            href="/network/oportunidades"
            className="inline-block px-5 py-2.5 rounded-full text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: NW_PRODUCTO }}
          >
            Ver oportunidades
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {activas.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_MUTED_2 }}>Activas</p>
              {activas.map(c => (
                <TarjetaCandidatura key={c.id} c={c} retirando={retirando === c.id} onRetirar={() => retirar(c.id)} />
              ))}
            </div>
          )}
          {resueltas.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: NW_MUTED_2 }}>Resueltas</p>
              {resueltas.map(c => (
                <TarjetaCandidatura key={c.id} c={c} retirando={false} onRetirar={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
