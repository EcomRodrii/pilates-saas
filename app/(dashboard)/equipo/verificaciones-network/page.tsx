'use client';

import { useEffect, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { Toast, useToast } from '@/components/ui/toast';
import {
  fetchVerificacionesPendientesNetwork, resolverVerificacionNetwork, type VerificacionPendienteNetwork,
} from '@/lib/api-client';
import { ESPECIALIDAD_LABEL, type EspecialidadNetwork } from '@/lib/network/catalogo';
import { rangoAnios } from '@/lib/network/formato';
import { cardCls } from '@/app/(dashboard)/configuracion/page';

// Cola de verificaciones de Tentare Network — docs/NETWORK-IMPLEMENTATION-
// PLAN.md §4. Solo PROPIETARIO/MANAGER llegan aquí (puedeGestionarEquipo,
// enforzado en el servidor — esta pantalla vive bajo /equipo, que la RLS y
// lib/permisos-reglas.ts ya cierran a RECEPCION/INSTRUCTOR).
export default function VerificacionesNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const [cargando, setCargando] = useState(true);
  const [pendientes, setPendientes] = useState<VerificacionPendienteNetwork[]>([]);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchVerificacionesPendientesNetwork().then(r => { if (vivo) { setPendientes(r); setCargando(false); } });
    return () => { vivo = false; };
  }, []);

  async function resolver(id: string, aprobar: boolean) {
    setResolviendoId(id);
    const res = await resolverVerificacionNetwork(id, aprobar);
    setResolviendoId(null);
    if (!res.ok) { showToast(res.error ?? 'No se ha podido resolver'); return; }
    setPendientes(prev => prev.filter(p => p.id !== id));
    showToast(aprobar ? 'Experiencia confirmada' : 'Solicitud rechazada');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Verificaciones de Network"
        description="Profesionales que indican haber trabajado en tu estudio y piden que lo confirmes."
      />

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : pendientes.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">No tienes ninguna solicitud pendiente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendientes.map(p => (
            <div key={p.id} className={`${cardCls} p-5`}>
              <div className="flex items-start gap-3.5">
                <ProfileAvatar fotoUrl={p.profesionalFotoUrl} nombre={p.profesionalNombre} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-foreground">
                    <span className="font-semibold">{p.profesionalNombre}</span> indica que trabajó en tu estudio
                    <span className="font-medium"> ({p.nombreEstudio})</span>.
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{rangoAnios(p.fechaInicio, p.fechaFin)}</p>
                  {p.especialidades.length > 0 && (
                    <p className="text-[12px] text-foreground mt-1">
                      {(p.especialidades as EspecialidadNetwork[]).map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}
                    </p>
                  )}
                  {p.descripcion && <p className="text-[12px] text-muted-foreground mt-1">{p.descripcion}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => resolver(p.id, true)}
                  disabled={resolviendoId === p.id}
                  className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5 disabled:opacity-60"
                >
                  {resolviendoId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Confirmar experiencia
                </button>
                <button
                  onClick={() => resolver(p.id, false)}
                  disabled={resolviendoId === p.id}
                  className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground flex items-center gap-1.5 disabled:opacity-60"
                >
                  <X size={14} /> No puedo confirmarla
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
