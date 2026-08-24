'use client';

import { useEffect, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { fetchMisReferenciasNetwork, crearReferenciaNetwork } from '@/lib/api-client';
import type { ReferenciaNetwork, NuevaReferenciaNetwork } from '@/lib/network/tipos';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

const FORM_VACIO: NuevaReferenciaNetwork = { nombreReferente: '', emailReferente: '', relacion: null };

const ESTADO_INFO: Record<ReferenciaNetwork['estado'], { texto: string; cls: string }> = {
  pendiente: { texto: 'Esperando respuesta', cls: 'text-amber-600' },
  confirmada: { texto: '✓ Referencia confirmada', cls: 'text-success' },
  rechazada: { texto: 'No confirmada', cls: 'text-muted-foreground' },
  expirada: { texto: 'Enlace caducado', cls: 'text-muted-foreground' },
};

// Mismo patrón que SeccionExperienciaNetwork: autocontenida (carga su propia
// lista) y avisa a la página padre la lista completa — hace falta para el
// badge "Referencia profesional" (lib/network/badges.ts), que necesita saber
// cuántas están `confirmada`. El referente no es usuaria de Tentare — no hay
// picker de estudio aquí, solo nombre + email de alguien con quien ya
// trabajó (docs/NETWORK-IMPLEMENTATION-PLAN.md §5).
export function SeccionReferenciasNetwork({
  onReferenciasChange,
}: {
  onReferenciasChange: (lista: ReferenciaNetwork[]) => void;
}) {
  const [referencias, setReferencias] = useState<ReferenciaNetwork[]>([]);
  const [cargando, setCargando] = useState(true);
  const [formAbierto, setFormAbierto] = useState(false);
  const [form, setForm] = useState<NuevaReferenciaNetwork>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    fetchMisReferenciasNetwork().then(lista => {
      if (!vivo) return;
      setReferencias(lista);
      setCargando(false);
      onReferenciasChange(lista);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    setError('');
    if (!form.nombreReferente.trim()) { setError('Indica el nombre del referente.'); return; }
    if (!form.emailReferente.trim() || !form.emailReferente.includes('@')) { setError('Indica un email válido.'); return; }
    setGuardando(true);
    const res = await crearReferenciaNetwork(form);
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    const siguiente = [res.referencia, ...referencias];
    setReferencias(siguiente);
    onReferenciasChange(siguiente);
    setForm(FORM_VACIO);
    setFormAbierto(false);
  }

  if (cargando) {
    return (
      <div className={`${cardCls} p-6 flex items-center justify-center`}>
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`${cardCls} p-6 space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Referencias profesionales</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Alguien que ya trabajó contigo — no hace falta que use Tentare.
          </p>
        </div>
        {!formAbierto && (
          <button onClick={() => setFormAbierto(true)} className="text-[12px] font-medium text-brand flex items-center gap-1 shrink-0">
            <Plus size={14} /> Añadir
          </button>
        )}
      </div>

      {referencias.length === 0 && !formAbierto && (
        <p className="text-[12px] text-muted-foreground">Todavía no has pedido ninguna referencia.</p>
      )}

      {referencias.map(ref => {
        const info = ESTADO_INFO[ref.estado];
        return (
          <div key={ref.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
            <p className="text-[13px] font-medium text-foreground">{ref.nombreReferente}</p>
            <p className="text-[11px] text-muted-foreground">{ref.emailReferente}{ref.relacion ? ` · ${ref.relacion}` : ''}</p>
            <p className={`text-[11px] font-medium mt-1 ${info.cls}`}>{info.texto}</p>
          </div>
        );
      })}

      {formAbierto && (
        <div className="border-t border-border pt-4 space-y-3">
          <div>
            <p className={labelCls}>Nombre del referente</p>
            <input
              className={inputCls} value={form.nombreReferente}
              onChange={e => setForm(f => ({ ...f, nombreReferente: e.target.value }))}
              placeholder="Nombre y apellidos"
            />
          </div>
          <div>
            <p className={labelCls}>Email del referente</p>
            <input
              type="email" className={inputCls} value={form.emailReferente}
              onChange={e => setForm(f => ({ ...f, emailReferente: e.target.value }))}
              placeholder="correo@ejemplo.com"
            />
          </div>
          <div>
            <p className={labelCls}>Relación (opcional)</p>
            <input
              className={inputCls} value={form.relacion ?? ''}
              onChange={e => setForm(f => ({ ...f, relacion: e.target.value || null }))}
              placeholder="P. ej. fue mi responsable de estudio"
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={guardar} disabled={guardando}
              className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium disabled:opacity-60"
            >
              {guardando ? 'Enviando…' : 'Enviar solicitud'}
            </button>
            <button
              onClick={() => { setFormAbierto(false); setForm(FORM_VACIO); setError(''); }}
              className="px-3.5 py-2 rounded-lg bg-card border border-border text-[12px] text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && !formAbierto && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
