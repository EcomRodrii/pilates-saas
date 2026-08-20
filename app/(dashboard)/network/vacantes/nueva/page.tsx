'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SelectorChips } from '@/components/network/selector-chips';
import { crearVacanteNetwork } from '@/lib/api-client';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL, HORARIOS_NETWORK, HORARIO_LABEL,
  TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL, TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
} from '@/lib/network/catalogo';
import type { EspecialidadNetwork, HorarioNetwork, TipoTrabajoNetwork, TarifaRangoNetwork } from '@/lib/network/catalogo';
import { cardCls, inputCls, labelCls } from '@/app/(dashboard)/configuracion/page';

export default function NuevaVacanteNetworkPage() {
  const router = useRouter();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [requisitos, setRequisitos] = useState('');
  const [especialidades, setEspecialidades] = useState<EspecialidadNetwork[]>([]);
  const [horarios, setHorarios] = useState<HorarioNetwork[]>([]);
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajoNetwork>('freelance');
  const [tarifaRango, setTarifaRango] = useState<TarifaRangoNetwork>('a_negociar');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function publicar() {
    if (!titulo.trim() || !descripcion.trim() || especialidades.length === 0) {
      setError('Completa el título, la descripción y al menos una especialidad.');
      return;
    }
    setGuardando(true); setError('');
    const res = await crearVacanteNetwork({
      titulo: titulo.trim(), descripcion: descripcion.trim(), requisitos: requisitos.trim() || null,
      especialidades, horarios, tipoTrabajo, tarifaRango,
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/network/vacantes/${res.vacante.id}`);
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/network/vacantes" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={14} /> Volver a mis vacantes
      </Link>

      <PageHeader title="Nueva vacante" description="Publica lo que buscas — la instructora aplicará directamente." />

      <div className={`${cardCls} p-6 space-y-4`}>
        <div>
          <label className={labelCls}>Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Instructora de Reformer" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Especialidades</label>
          <SelectorChips
            opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
            seleccion={especialidades}
            onChange={setEspecialidades}
          />
        </div>

        <div>
          <label className={labelCls}>Horario</label>
          <SelectorChips
            opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
            seleccion={horarios}
            onChange={setHorarios}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Tipo de colaboración</label>
            <select value={tipoTrabajo} onChange={e => setTipoTrabajo(e.target.value as TipoTrabajoNetwork)} className={inputCls}>
              {TIPOS_TRABAJO_NETWORK.map(v => <option key={v} value={v}>{TIPO_TRABAJO_LABEL[v]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Remuneración</label>
            <select value={tarifaRango} onChange={e => setTarifaRango(e.target.value as TarifaRangoNetwork)} className={inputCls}>
              {TARIFAS_RANGO_NETWORK.map(v => <option key={v} value={v}>{TARIFA_RANGO_LABEL[v]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Descripción</label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={4} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Requisitos (opcional)</label>
          <textarea value={requisitos} onChange={e => setRequisitos(e.target.value)} rows={2} className={inputCls} />
        </div>

        {error && <p className="text-[12px] text-destructive">{error}</p>}

        <button
          onClick={publicar}
          disabled={guardando}
          className="px-4 py-2.5 rounded-lg bg-brand text-brand-foreground text-[13px] font-medium disabled:opacity-60 flex items-center gap-1.5"
        >
          {guardando ? <Loader2 size={14} className="animate-spin" /> : null}
          {guardando ? 'Creando…' : 'Crear borrador'}
        </button>
        <p className="text-[11.5px] text-muted-foreground">
          Se guarda como borrador — la publicas de verdad desde su ficha.
        </p>
      </div>
    </div>
  );
}
