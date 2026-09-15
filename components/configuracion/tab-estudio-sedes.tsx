'use client';

import { useId, useState } from 'react';
import { Check, Loader2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import type { SedeSeleccionable } from '@/lib/supabase-data';
import { inputCls, labelCls, btnSecondary } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';

// El cajón «Sedes» (plan CADENA): ver quiénes son, cambiarse entre ellas y añadir
// una nueva. El catálogo de tipos de clase de la cadena está en «Mis clases y
// citas» (tab-catalogo-cadena.tsx). `sedes`/`cambiarmeASede` vienen de la sección
// «Mi estudio» (secciones/seccion-estudio.tsx), que también los necesita para
// decidir si la fila existe.
//
// Lo que se dice al terminar va aquí dentro y no en un aviso flotante: el aviso
// del panel queda debajo del cajón.

const VACIA = { nombre: '', ciudad: '', telefono: '' };

export function FormSedes({
  sedes, refrescarSedes, cambiandoASede, cambiarmeASede, puedeAnadirSedes,
}: {
  sedes: SedeSeleccionable[];
  refrescarSedes: () => void;
  cambiandoASede: string | null;
  cambiarmeASede: (id: string) => void;
  puedeAnadirSedes: boolean;
}) {
  const { studio } = useStudio();
  const idSede = useId();
  const [nuevaSede, setNuevaSede] = useState(VACIA);
  const [aplicandoCatalogo, setAplicandoCatalogo] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  async function aplicarCatalogo(sedeId: string, nombreSede: string) {
    setAplicandoCatalogo(sedeId);
    try {
      const res = await fetch('/api/cadena/tipos-clase/aplicar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ studioId: sedeId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setAviso(`No se ha aplicado el catálogo: ${data?.error ?? 'inténtalo otra vez'}`); return; }
      setAviso(data?.aplicados > 0
        ? `${data.aplicados} tipo(s) de clase añadidos a «${nombreSede}»`
        : `«${nombreSede}» ya tenía todo el catálogo de la cadena`);
    } catch {
      setAviso('No se ha aplicado el catálogo: no hemos podido hablar con el servidor.');
    } finally {
      setAplicandoCatalogo(null);
    }
  }

  async function anadirSede(): Promise<string | null> {
    const nombre = nuevaSede.nombre.trim();
    const res = await fetch('/api/cadena/sedes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(nuevaSede),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return data?.error ?? 'No se ha podido crear la sede';
    setAviso(`Sede «${nombre}» creada: ya está en la lista.`);
    setNuevaSede(VACIA);
    refrescarSedes();
    return null;
  }

  const campo = (k: keyof typeof VACIA) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setNuevaSede(s => ({ ...s, [k]: v }));
  };

  return (
    <>
      <div className="space-y-6 pb-6">
        <p role="status" className={aviso ? 'rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground' : 'sr-only'}>
          {aviso}
        </p>

        {/* Con una sola sede no hay nada que listar (mismo criterio que el
            selector del menú de perfil). */}
        {sedes.length > 1 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground">Tus sedes</h3>
            <p className="mb-3 text-sm text-muted-foreground">{sedes.length} sedes en tu cadena. Cámbiate a cualquiera.</p>
            <ul className="space-y-2">
              {sedes.map(s => {
                const esActual = s.id === studio?.id;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{s.nombre}</p>
                      {s.ciudad && <p className="truncate text-xs text-muted-foreground">{s.ciudad}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {puedeAnadirSedes && (
                        <button
                          type="button"
                          onClick={() => aplicarCatalogo(s.id, s.nombre)}
                          disabled={aplicandoCatalogo !== null}
                          title="Añade a esta sede los tipos de clase de la plantilla de cadena que todavía no tenga"
                          className={cn(btnSecondary, 'flex items-center gap-1.5 px-2.5 text-xs')}
                        >
                          {aplicandoCatalogo === s.id ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Layers size={12} aria-hidden />}
                          Aplicar catálogo
                        </button>
                      )}
                      {esActual ? (
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-success">
                          <Check size={14} aria-hidden /> Estás aquí
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => cambiarmeASede(s.id)}
                          disabled={cambiandoASede !== null}
                          className={cn(btnSecondary, 'flex items-center gap-1.5')}
                        >
                          {cambiandoASede === s.id && <Loader2 size={14} className="animate-spin" aria-hidden />}
                          {cambiandoASede === s.id ? 'Cambiando…' : 'Cambiarme'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {puedeAnadirSedes && (
          <div>
            <h3 className="text-sm font-semibold text-foreground">Añadir sede</h3>
            <p className="mb-3 text-sm text-muted-foreground">Tu plan Cadena cubre todas tus sedes. La nueva queda lista al momento.</p>
            <div className="grid grid-cols-1 gap-4 @sm/config:grid-cols-2">
              <div className="@sm/config:col-span-2">
                <label htmlFor={`${idSede}-nombre`} className={labelCls}>Nombre</label>
                <input id={`${idSede}-nombre`} className={inputCls} value={nuevaSede.nombre} onChange={campo('nombre')} />
              </div>
              <div>
                <label htmlFor={`${idSede}-ciudad`} className={labelCls}>Ciudad</label>
                <input id={`${idSede}-ciudad`} className={inputCls} value={nuevaSede.ciudad} onChange={campo('ciudad')} />
              </div>
              <div>
                <label htmlFor={`${idSede}-telefono`} className={labelCls}>Teléfono</label>
                <input id={`${idSede}-telefono`} className={inputCls} type="tel" value={nuevaSede.telefono} onChange={campo('telefono')} />
              </div>
            </div>
          </div>
        )}
      </div>
      {puedeAnadirSedes && (
        <BarraGuardar
          seccion="estudio"
          cambios={Object.values(nuevaSede).some(v => v.trim()) ? ['Añadir sede'] : []}
          bloqueo={nuevaSede.nombre.trim() ? null : 'Ponle un nombre a la sede.'}
          onGuardar={anadirSede}
          onDescartar={() => setNuevaSede(VACIA)}
        />
      )}
    </>
  );
}
