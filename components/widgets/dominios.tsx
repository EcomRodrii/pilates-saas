'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { authHeader } from '@/lib/api-client';
import { inputCls } from '@/components/configuracion/estilos';
import { normalizarOrigenWidget } from '@/lib/widget/dominios-autorizados';

// Lista blanca de orígenes para el bundle embebible (studios.widget_dominios_autorizados,
// lib/cors-widget.ts) — sin esto configurado, el navegador de cualquier
// visitante bloquea las peticiones del widget por CORS, en silencio (la
// consola del NAVEGADOR de la visitante, no algo que la propietaria vea).
export function GestionDominios({ dominios, onGuardar, showToast }: {
  dominios: string[];
  onGuardar: (dominios: string[]) => Promise<{ ok: boolean; error?: string }>;
  showToast: (m: string) => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function anadir() {
    // Misma regla que aplica el servidor (https, sin comodines ni IPs): así el
    // aviso sale aquí y no tras un viaje de ida y vuelta.
    const origenNuevo = normalizarOrigenWidget(nuevo);
    if (!origenNuevo) { showToast('Escribe un dominio válido con https, p. ej. midominio.com'); return; }
    if (dominios.includes(origenNuevo)) { setNuevo(''); return; }
    setGuardando(true);
    const r = await onGuardar([...dominios, origenNuevo]);
    setGuardando(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar el dominio'); return; }
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
    if (!r.ok) showToast(r.error ?? 'No se pudo quitar el dominio');
  }

  return (
    <div>
      <p className="text-[12px] text-muted-foreground mb-2 leading-relaxed">
        La integración nativa solo funciona en estas webs — protege contra que otro sitio la copie sin permiso.
      </p>
      {dominios.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {dominios.map(d => (
            <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-foreground bg-muted/40">
              {d}
              <button onClick={() => quitar(d)} disabled={guardando} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${d}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
          placeholder="midominio.com"
          aria-label="Dominio que quieres autorizar"
          className={cn(inputCls, 'flex-1')}
        />
        <button
          onClick={anadir}
          disabled={guardando}
          className="px-3 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
