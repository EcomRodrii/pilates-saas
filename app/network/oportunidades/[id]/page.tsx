'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check, SearchX } from 'lucide-react';
import { fetchVacanteNetwork, aplicarVacanteNetwork, fetchMisCandidaturasNetwork } from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, ESPECIALIDAD_LABEL, HORARIO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO } from '@/components/network-v2/tokens';

// Rediseño 2026-09 (Fase 3, mismo alcance que el grid de /network/oportunidades)
// — tokens NW_* en vez de cardCls de panel, sin cambios de comportamiento
// (mismo fetchVacanteNetwork/aplicarVacanteNetwork/fetchMisCandidaturasNetwork).
export default function OportunidadDetalleNetworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [vacante, setVacante] = useState<VacanteNetwork | null>(null);
  const [cargando, setCargando] = useState(true);
  const [yaAplico, setYaAplico] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchVacanteNetwork(id), fetchMisCandidaturasNetwork()]).then(([v, mias]) => {
      if (!vivo) return;
      setVacante(v);
      setYaAplico(mias.some(c => c.vacanteId === id));
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [id]);

  async function aplicar() {
    setEnviando(true); setError('');
    const res = await aplicarVacanteNetwork(id, mensaje.trim() || null);
    setEnviando(false);
    if (!res.ok) { setError(res.error ?? 'No se ha podido enviar tu candidatura.'); return; }
    setEnviado(true);
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin" style={{ color: NW_MUTED }} />
      </div>
    );
  }

  if (!vacante) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Link href="/network/oportunidades" className="text-[12px] flex items-center gap-1" style={{ color: NW_MUTED }}>
          <ArrowLeft size={14} /> Volver a oportunidades
        </Link>
        <div className="rounded-2xl p-10 text-center" style={{ background: NW_SAND }}>
          <SearchX size={22} style={{ color: NW_MUTED_2 }} className="mx-auto mb-2" />
          <p className="text-[13px]" style={{ color: NW_MUTED }}>Esta vacante ya no está disponible.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <Link href="/network/oportunidades" className="text-[12px] flex items-center gap-1" style={{ color: NW_MUTED }}>
        <ArrowLeft size={14} /> Volver a oportunidades
      </Link>

      <div>
        <h1 className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>{vacante.titulo}</h1>
        <p className="text-[13px] mt-0.5" style={{ color: NW_MUTED_2 }}>
          {vacante.estudioNombre}{vacante.estudioCiudad ? ` · ${vacante.estudioCiudad}` : ''}
        </p>
      </div>

      <div className="rounded-2xl p-6 space-y-3" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
        {vacante.descripcion && <p className="text-[13.5px] whitespace-pre-line" style={{ color: NW_TINTA }}>{vacante.descripcion}</p>}
        {vacante.especialidades.length > 0 && (
          <p className="text-[12.5px]" style={{ color: NW_MUTED }}>{vacante.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}</p>
        )}
        {vacante.horarios.length > 0 && (
          <p className="text-[12.5px]" style={{ color: NW_MUTED }}>{vacante.horarios.map(h => HORARIO_LABEL[h]).join(' · ')}</p>
        )}
        <p className="text-[12.5px] font-semibold" style={{ color: NW_TINTA }}>
          {TIPO_TRABAJO_LABEL[vacante.tipoTrabajo]} · {TARIFA_RANGO_LABEL[vacante.tarifaRango]}
        </p>
        {vacante.requisitos && (
          <p className="text-[12.5px]" style={{ color: NW_MUTED }}>
            <strong style={{ color: NW_TINTA }}>Requisitos:</strong> {vacante.requisitos}
          </p>
        )}
      </div>

      <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
        {enviado || yaAplico ? (
          <p className="text-[13px] flex items-center gap-1.5" style={{ color: NW_TINTA }}>
            <Check size={14} style={{ color: NW_PRODUCTO }} /> Ya has aplicado a esta vacante.
          </p>
        ) : (
          <>
            <p className="text-[13px] font-bold mb-2" style={{ color: NW_TINTA }}>Aplicar</p>
            <textarea
              value={mensaje} onChange={e => setMensaje(e.target.value)} rows={3}
              placeholder="Cuéntale al estudio por qué encajas (opcional)"
              className="w-full px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none resize-y"
              style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
            />
            {error && <p className="text-[12px] mt-2" style={{ color: '#A04A3C' }}>{error}</p>}
            <button
              onClick={aplicar}
              disabled={enviando}
              className="mt-3 px-4 py-2.5 rounded-full text-[13px] font-bold text-white disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ background: NW_PRODUCTO }}
            >
              {enviando ? 'Enviando…' : 'Aplicar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
