'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { fetchVacanteNetwork, aplicarVacanteNetwork, fetchMisCandidaturasNetwork } from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, ESPECIALIDAD_LABEL, HORARIO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';
import { cardCls, inputCls } from '@/components/network/campo-estilos';

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
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vacante) {
    return (
      <div className="space-y-4">
        <Link href="/network/oportunidades" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={14} /> Volver a oportunidades
        </Link>
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">Esta vacante ya no está disponible.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/network/oportunidades" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={14} /> Volver a oportunidades
      </Link>

      <PageHeader
        title={vacante.titulo}
        description={`${vacante.estudioNombre}${vacante.estudioCiudad ? ` · ${vacante.estudioCiudad}` : ''}`}
      />

      <div className={`${cardCls} p-6 space-y-3`}>
        <p className="text-[13px] text-foreground whitespace-pre-line">{vacante.descripcion}</p>
        {vacante.especialidades.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">{vacante.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}</p>
        )}
        {vacante.horarios.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">{vacante.horarios.map(h => HORARIO_LABEL[h]).join(' · ')}</p>
        )}
        <p className="text-[12.5px] text-muted-foreground">
          {TIPO_TRABAJO_LABEL[vacante.tipoTrabajo]} · {TARIFA_RANGO_LABEL[vacante.tarifaRango]}
        </p>
        {vacante.requisitos && <p className="text-[12.5px] text-muted-foreground"><strong>Requisitos:</strong> {vacante.requisitos}</p>}
      </div>

      <div className={`${cardCls} p-6`}>
        {enviado || yaAplico ? (
          <p className="text-[13px] text-foreground flex items-center gap-1.5">
            <Check size={14} className="text-success" /> Ya has aplicado a esta vacante.
          </p>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-foreground mb-2">Aplicar</p>
            <textarea
              value={mensaje} onChange={e => setMensaje(e.target.value)} rows={3}
              placeholder="Cuéntale al estudio por qué encajas (opcional)"
              className={inputCls}
            />
            {error && <p className="text-[12px] text-destructive mt-2">{error}</p>}
            <button
              onClick={aplicar}
              disabled={enviando}
              className="mt-3 px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[13px] font-medium disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Aplicar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
