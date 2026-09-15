'use client';

import { useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

// «Aplicaciones con acceso», en Conexiones: apps de terceros con acceso OAuth
// al estudio (Zapier, y quien se registre después). Solo PROPIETARIO/MANAGER —
// mismo criterio que quién puede autorizar la conexión (puedeGestionarAppsOAuth,
// ver lib/permisos-reglas.ts); lo decide la sección que la pinta.
//
// Vivía dentro de Widgets para tu web (tab-api.tsx), que no tiene nada que ver.
interface AppConectada {
  clienteId: string;
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  scopes: string[];
  otorgadoEn: string;
}

export function TabAppsConectadas({ showToast }: { showToast: (m: string) => void }) {
  const [apps, setApps] = useState<AppConectada[] | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const headers = await authHeader();
      const res = await fetch('/api/oauth/consentimientos', { headers });
      if (!res.ok || cancelado) return;
      const data = await res.json() as { apps?: unknown };
      // Una respuesta sin `apps` no puede tumbar la sección entera.
      if (!cancelado) setApps(Array.isArray(data.apps) ? data.apps as AppConectada[] : []);
    })();
    return () => { cancelado = true; };
  }, []);

  async function revocar(clienteId: string) {
    setRevocando(clienteId);
    const headers = await authHeader();
    const res = await fetch('/api/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ clienteId }),
    });
    setRevocando(null);
    if (!res.ok) { showToast('No se pudo revocar el acceso'); return; }
    setApps(prev => (prev ?? []).filter(a => a.clienteId !== clienteId));
    showToast('Acceso revocado');
  }

  if (apps === null) return null;

  return (
    <TarjetaAjuste id="aplicaciones-con-acceso">
      {apps.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Ninguna aplicación conectada todavía.</p>
      ) : (
        <div className="space-y-2">
          {apps.map(a => (
            <div key={a.clienteId} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{a.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{a.scopes.join(', ')}</p>
              </div>
              <button
                onClick={() => revocar(a.clienteId)}
                disabled={revocando === a.clienteId}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[12px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {revocando === a.clienteId ? 'Revocando…' : 'Revocar acceso'}
              </button>
            </div>
          ))}
        </div>
      )}
    </TarjetaAjuste>
  );
}
