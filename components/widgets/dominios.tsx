'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { authHeader } from '@/lib/api-client';
import { btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { normalizarOrigenWidget } from '@/lib/widget/dominios-autorizados';
import { origenesConYSinWww } from '@/lib/widgets/recetas';
import { FOCO } from './piezas';

// Lista blanca de orígenes para el bundle embebible (studios.widget_dominios_autorizados,
// lib/cors-widget.ts) — sin esto configurado, el navegador de cualquier
// visitante bloquea las peticiones del widget por CORS, en silencio (la
// consola del NAVEGADOR de la visitante, no algo que la propietaria vea).
//
// Solo la propietaria puede cambiarla (la ruta responde 403 a cualquier otro
// rol): a los demás se les enseña la lista en solo lectura y se les dice por
// qué, en vez de dejarles escribir para acabar en un error.
export function GestionDominios({ dominios, onGuardar, showToast, puedeCambiar, sugerido }: {
  dominios: string[];
  onGuardar: (dominios: string[]) => Promise<{ ok: boolean; error?: string }>;
  showToast: (m: string) => void;
  puedeCambiar: boolean;
  /** La dirección que dio de su web, para no tener que escribirla otra vez. */
  sugerido?: string | null;
}) {
  const [nuevo, setNuevo] = useState(sugerido && !dominios.length ? sugerido : '');
  const [guardando, setGuardando] = useState(false);
  const idCampo = useId();

  async function anadir() {
    // Misma regla que aplica el servidor (https, sin comodines ni IPs): así el
    // aviso sale aquí y no tras un viaje de ida y vuelta.
    const origenNuevo = normalizarOrigenWidget(nuevo);
    if (!origenNuevo) { showToast('Escribe la dirección de tu web, p. ej. tuestudio.com'); return; }
    // Con y sin «www», en la MISMA petición: su web se abre de las dos formas.
    const faltan = origenesConYSinWww(origenNuevo).filter(o => !dominios.includes(o));
    if (!faltan.length) { setNuevo(''); return; }
    setGuardando(true);
    const r = await onGuardar([...dominios, ...faltan]);
    setGuardando(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo autorizar tu web'); return; }
    setNuevo('');
    // Fire-and-forget: registra el dominio recién autorizado como dominio de
    // wallets (Apple Pay/Google Pay) sobre la cuenta conectada del estudio.
    // Sin esto, Apple Pay nunca aparece en el checkout embebido en la web del
    // estudio (Modo B). El endpoint lee de la BD lo que se acaba de guardar y
    // es no-op si el estudio no tiene Stripe conectado; su fallo no afecta al
    // guardado, que ya está hecho.
    void (async () => {
      const headers = await authHeader();
      await fetch('/api/widget/dominios-wallet', { method: 'POST', headers });
    })().catch(() => { /* mejora, no requisito: el registro se reintenta al volver a guardar */ });
  }

  async function quitar(origenAQuitar: string) {
    setGuardando(true);
    const r = await onGuardar(dominios.filter(d => d !== origenAQuitar));
    setGuardando(false);
    if (!r.ok) showToast(r.error ?? 'No se pudo quitar la web');
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Sin marco, solo funciona en las webs que autorices: así ninguna otra web lo copia sin permiso.
      </p>
      {dominios.length > 0 ? (
        <ul aria-label="Webs autorizadas" className="flex flex-wrap gap-1.5">
          {dominios.map(d => (
            <li key={d} className="flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[11.5px] text-foreground">
              {d}
              {puedeCambiar && (
                <button
                  type="button"
                  onClick={() => quitar(d)}
                  disabled={guardando}
                  className={cn('flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-destructive disabled:opacity-40', FOCO)}
                  aria-label={`Quitar ${d}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">Todavía no hay ninguna web autorizada.</p>
      )}
      {puedeCambiar ? (
        <div>
          <label htmlFor={idCampo} className="sr-only">Dirección de la web que quieres autorizar</label>
          <div className="flex flex-wrap gap-2">
            <input
              id={idCampo}
              value={nuevo}
              onChange={e => setNuevo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void anadir(); } }}
              placeholder="tuestudio.com"
              inputMode="url"
              className={cn(inputCls, 'min-w-0 flex-1')}
            />
            <button type="button" onClick={() => void anadir()} disabled={guardando} className={btnSecondary}>
              Autorizar
            </button>
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">Se autoriza con «www» y sin él a la vez.</p>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">Solo la propietaria del estudio puede autorizar webs.</p>
      )}
    </div>
  );
}
