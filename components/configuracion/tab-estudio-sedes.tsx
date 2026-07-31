'use client';

import { useState } from 'react';
import { Building2, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import type { SedeSeleccionable } from '@/lib/supabase-data';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/app/(dashboard)/configuracion/page';

// Multi-sede (plan CADENA): ver quiénes son, cambiarse entre ellas y añadir
// una nueva. `sedes`/`cambiarmeASede` vienen del orquestador (tab-estudio.tsx)
// porque también los necesita para decidir si esta sub-pestaña existe.
export function TabEstudioSedes({
  showToast, sedes, refrescarSedes, cambiandoASede, cambiarmeASede, puedeAnadirSedes,
}: {
  showToast: (m: string) => void;
  sedes: SedeSeleccionable[];
  refrescarSedes: () => void;
  cambiandoASede: string | null;
  cambiarmeASede: (id: string) => void;
  puedeAnadirSedes: boolean;
}) {
  const { studio } = useStudio();
  const [nuevaSede, setNuevaSede] = useState({ nombre: '', ciudad: '', telefono: '' });
  const [creandoSede, setCreandoSede] = useState(false);

  async function anadirSede() {
    if (!nuevaSede.nombre.trim()) { showToast('Ponle un nombre a la sede'); return; }
    setCreandoSede(true);
    try {
      const res = await fetch('/api/cadena/sedes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(nuevaSede),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Error: ${data.error ?? 'no se pudo crear la sede'}`); return; }
      showToast(`Sede "${nuevaSede.nombre}" creada — ya aparece en "Tus sedes"`);
      setNuevaSede({ nombre: '', ciudad: '', telefono: '' });
      refrescarSedes();
    } finally {
      setCreandoSede(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Con una sola sede no hay nada que listar (mismo criterio que el
          selector del menú de perfil). */}
      {sedes.length > 1 && (
        <div className={cn(cardCls, 'p-6')}>
          <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" /> Tus sedes
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            {sedes.length} sedes en tu cadena. Cámbiate a cualquiera sin salir de aquí.
          </p>
          <div className="space-y-2">
            {sedes.map(s => {
              const esActual = s.id === studio?.id;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground truncate">{s.nombre}</p>
                    {s.ciudad && <p className="text-[11px] text-muted-foreground truncate">{s.ciudad}</p>}
                  </div>
                  {esActual ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-success shrink-0">
                      <Check size={14} /> Estás aquí
                    </span>
                  ) : (
                    <button
                      onClick={() => cambiarmeASede(s.id)}
                      disabled={cambiandoASede !== null}
                      className={cn(btnSecondary, 'shrink-0 disabled:opacity-50')}
                    >
                      {cambiandoASede === s.id ? <Loader2 size={14} className="animate-spin" /> : null}
                      {cambiandoASede === s.id ? 'Cambiando…' : 'Cambiarme'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {puedeAnadirSedes && (
        <div className={cn(cardCls, 'p-6')}>
          <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center gap-2">
            <Building2 size={15} className="text-muted-foreground" /> Añadir sede
          </h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Tu plan Cadena cubre todas tus sedes con una sola suscripción. La sede nueva queda operativa
            al momento — aparecerá en &ldquo;Tus sedes&rdquo; arriba, con un botón para cambiarte a ella.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className={labelCls}>Nombre</p>
              <input className={inputCls} value={nuevaSede.nombre} onChange={e => setNuevaSede(s => ({ ...s, nombre: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Ciudad</p>
              <input className={inputCls} value={nuevaSede.ciudad} onChange={e => setNuevaSede(s => ({ ...s, ciudad: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Teléfono</p>
              <input className={inputCls} value={nuevaSede.telefono} onChange={e => setNuevaSede(s => ({ ...s, telefono: e.target.value }))} />
            </div>
          </div>
          <button onClick={anadirSede} disabled={creandoSede} className={cn(btnPrimary, 'mt-4', creandoSede && 'opacity-50')}>
            {creandoSede ? 'Creando…' : 'Añadir sede'}
          </button>
        </div>
      )}
    </div>
  );
}
