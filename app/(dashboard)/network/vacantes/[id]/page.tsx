'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { Toast, useToast } from '@/components/ui/toast';
import {
  fetchVacanteNetwork, cambiarEstadoVacanteNetwork,
  fetchCandidaturasVacanteNetwork, cambiarEstadoCandidaturaNetwork, toggleFavoritoNetwork,
  type CandidaturaConEncaje,
} from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL, ESPECIALIDAD_LABEL, HORARIO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork, EstadoCandidatura } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { cn } from '@/lib/utils';

const SECUENCIA: EstadoCandidatura[] = ['recibida', 'contactada', 'entrevista', 'propuesta', 'aceptada'];
const ESTADO_LABEL: Record<EstadoCandidatura, string> = {
  recibida: 'Recibida', contactada: 'Contactada', entrevista: 'Entrevista', propuesta: 'Propuesta',
  aceptada: 'Aceptada', rechazada: 'Rechazada', retirada: 'Retirada',
};

export default function VacanteDetalleNetworkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const [vacante, setVacante] = useState<VacanteNetwork | null>(null);
  const [candidaturas, setCandidaturas] = useState<CandidaturaConEncaje[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [accionando, setAccionando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([fetchVacanteNetwork(id), fetchCandidaturasVacanteNetwork(id)]).then(([v, c]) => {
      if (!vivo) return;
      setVacante(v); setCandidaturas(c); setCargando(false);
    });
    return () => { vivo = false; };
  }, [id]);

  async function cambiarEstado(estado: 'published' | 'closed') {
    setCambiandoEstado(true); setErrorEstado('');
    const res = await cambiarEstadoVacanteNetwork(id, estado);
    setCambiandoEstado(false);
    if (!res.ok) { setErrorEstado(res.error); return; }
    // El PATCH ya devuelve la fila actualizada, pero se relee del servidor
    // como red de seguridad — el bug real que esto cierra: el guardado
    // funcionaba de verdad (confirmado en la BD) pero la pantalla se
    // quedaba mostrando "Borrador" sin ningún aviso, indistinguible de un
    // fallo real. Mismo patrón que el botón "Guardar cambios" de
    // /network/mi-perfil (paso 8): la acción silenciosa se lee como rota.
    setVacante(await fetchVacanteNetwork(id) ?? res.vacante);
    showToast(estado === 'published' ? 'Vacante publicada' : 'Vacante cerrada');
  }

  async function accionar(candidaturaId: string, estado: EstadoCandidatura) {
    if (estado === 'aceptada' || estado === 'rechazada' || estado === 'contactada' || estado === 'entrevista' || estado === 'propuesta') {
      setAccionando(candidaturaId);
      const res = await cambiarEstadoCandidaturaNetwork(candidaturaId, estado);
      setAccionando(null);
      if (res.ok) {
        setCandidaturas(await fetchCandidaturasVacanteNetwork(id));
        showToast(`Candidatura → ${ESTADO_LABEL[estado].toLowerCase()}`);
      }
    }
  }

  async function guardar(perfilId: string) {
    await toggleFavoritoNetwork(perfilId);
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
      <div className="space-y-4 max-w-2xl">
        <Link href="/network/vacantes" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft size={13} /> Volver a mis vacantes
        </Link>
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">Esta vacante no existe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Link href="/network/vacantes" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft size={13} /> Volver a mis vacantes
      </Link>

      <PageHeader
        title={vacante.titulo}
        description={`${TIPO_TRABAJO_LABEL[vacante.tipoTrabajo]} · ${TARIFA_RANGO_LABEL[vacante.tarifaRango]}`}
      />

      <div className={`${cardCls} p-6 space-y-3`}>
        <div className="flex items-center justify-between">
          <span className={cn(
            'px-2.5 py-1 rounded-full text-[11px] font-semibold',
            vacante.estado === 'published' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
          )}>
            {vacante.estado === 'draft' ? 'Borrador' : vacante.estado === 'published' ? 'Publicada' : 'Cerrada'}
          </span>
          {vacante.estado === 'draft' && (
            <button onClick={() => cambiarEstado('published')} disabled={cambiandoEstado} className="px-3.5 py-1.5 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60">
              Publicar
            </button>
          )}
          {vacante.estado === 'published' && (
            <button onClick={() => cambiarEstado('closed')} disabled={cambiandoEstado} className="px-3.5 py-1.5 rounded-lg bg-card border border-border text-[12px] font-medium disabled:opacity-60">
              Cerrar vacante
            </button>
          )}
        </div>
        {errorEstado && <p className="text-[12px] text-destructive">{errorEstado}</p>}
        <p className="text-[13px] text-foreground whitespace-pre-line">{vacante.descripcion}</p>
        {vacante.especialidades.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">{vacante.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}</p>
        )}
        {vacante.horarios.length > 0 && (
          <p className="text-[12.5px] text-muted-foreground">{vacante.horarios.map(h => HORARIO_LABEL[h]).join(' · ')}</p>
        )}
        {vacante.requisitos && <p className="text-[12.5px] text-muted-foreground"><strong>Requisitos:</strong> {vacante.requisitos}</p>}
      </div>

      <h2 className="text-[15px] font-semibold text-foreground">Candidaturas ({candidaturas?.length ?? 0})</h2>

      {!candidaturas || candidaturas.length === 0 ? (
        <div className={`${cardCls} p-6 text-center`}>
          <p className="text-[13px] text-muted-foreground">Todavía no ha aplicado nadie.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {candidaturas.map(c => {
            const siguiente = SECUENCIA[SECUENCIA.indexOf(c.estado) + 1];
            const activa = !['aceptada', 'rechazada', 'retirada'].includes(c.estado);
            return (
              <div key={c.id} className={`${cardCls} p-4`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProfileAvatar fotoUrl={c.perfilFotoUrl} nombre={c.perfilNombre ?? ''} size="md" />
                    <div className="min-w-0">
                      <Link href={`/network/${c.perfilId}`} className="text-[13.5px] font-semibold text-foreground hover:underline truncate block">
                        {c.perfilNombre ?? 'Perfil eliminado'}
                      </Link>
                      <span className="text-[11.5px] text-muted-foreground">{ESTADO_LABEL[c.estado]}</span>
                    </div>
                  </div>
                </div>
                {c.encaje && c.encaje.criterios.length > 0 && (
                  <div className="mt-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${c.encaje.barra}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0">Encaje</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {c.encaje.criterios.map(cr => `${cr.label} ${cr.cumple ? '✓' : '✗'}`).join(' · ')}
                    </p>
                  </div>
                )}
                {c.mensaje && <p className="text-[12.5px] text-foreground mt-2 whitespace-pre-line">{c.mensaje}</p>}
                {activa && (
                  <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                    {siguiente && (
                      <button
                        onClick={() => accionar(c.id, siguiente)}
                        disabled={accionando === c.id}
                        className="px-3 py-1.5 rounded-lg bg-brand text-brand-foreground text-[11.5px] font-medium disabled:opacity-60 flex items-center gap-1"
                      >
                        <Check size={12} /> {siguiente === 'aceptada' ? 'Aceptar' : `Avanzar a ${ESTADO_LABEL[siguiente].toLowerCase()}`}
                      </button>
                    )}
                    <button
                      onClick={() => guardar(c.perfilId)}
                      className="px-3 py-1.5 rounded-lg bg-card border border-border text-[11.5px] font-medium text-foreground"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => accionar(c.id, 'rechazada')}
                      disabled={accionando === c.id}
                      className="px-3 py-1.5 rounded-lg bg-card border border-border text-[11.5px] font-medium text-destructive disabled:opacity-60 flex items-center gap-1"
                    >
                      <X size={12} /> Descartar
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
