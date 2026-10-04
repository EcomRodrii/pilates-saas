'use client';

// «Dispositivos de confianza» en Mi perfil, dentro de la verificación en dos
// pasos (lib/auth/dispositivo-confianza-reglas.ts): los navegadores en los que
// no se vuelve a pedir el código, con desde dónde y cuándo se usaron, para
// quitar el que no se reconozca. Quitarlo hace que ESE navegador, y la sesión
// que tenga abierta, vuelvan a pedir el código.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone } from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { fechaCortaEstudio } from '@/lib/utils';
import { DIAS_DISPOSITIVO_CONFIANZA } from '@/lib/auth/dispositivo-confianza-reglas';

interface Dispositivo {
  id: string; nombre: string; ip: string | null; ultimoUsoEn: string; esEste: boolean;
}

type Estado = { tipo: 'cargando' } | { tipo: 'error' } | { tipo: 'listo'; dispositivos: Dispositivo[] };

async function cabecera(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : null;
}

export function DispositivosConfianza() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(async () => {
    const headers = await cabecera();
    if (!headers) return;
    try {
      const res = await fetch('/api/auth/dispositivo-confianza', { headers, cache: 'no-store' });
      if (!res.ok) { setEstado({ tipo: 'error' }); return; }
      const { dispositivos } = await res.json() as { dispositivos: Dispositivo[] };
      setEstado({ tipo: 'listo', dispositivos });
    } catch {
      setEstado({ tipo: 'error' });
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- setState tras await, no en cascada
  useEffect(() => { void leer(); }, [leer]);

  async function quitar(id: string | null, esEste: boolean) {
    const headers = await cabecera();
    if (!headers || quitando) return;
    setQuitando(id ?? 'todos'); setError(null);
    try {
      const res = await fetch(`/api/auth/dispositivo-confianza?${id ? `id=${encodeURIComponent(id)}` : 'todos=1'}`, { method: 'DELETE', headers });
      if (!res.ok) { setError('No se ha podido quitar. Vuelve a intentarlo.'); return; }
      // Si la sesión de ahora entró por ese dispositivo, ya no cuenta como
      // verificada: al recargar, el panel pedirá el código.
      if (esEste || !id) { window.location.reload(); return; }
      await leer();
    } finally {
      setQuitando(null);
    }
  }

  if (estado.tipo === 'cargando') return null;
  if (estado.tipo === 'error') {
    return <p className="text-[12px] text-muted-foreground">No se han podido cargar tus dispositivos de confianza.</p>;
  }

  return (
    <div className="border-t border-border/60 pt-3 mt-1">
      <p className="text-[12.5px] font-semibold text-foreground flex items-center gap-1.5">
        <MonitorSmartphone size={14} className="text-muted-foreground" aria-hidden /> Dispositivos de confianza
      </p>
      <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-2.5">
        En estos no se vuelve a pedir el código durante {DIAS_DISPOSITIVO_CONFIANZA} días desde la última vez que se usan. Si no reconoces alguno, quítalo y cambia tu contraseña.
      </p>
      {estado.dispositivos.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Ninguno. Al escribir el código, marca «No volver a pedir el código en este dispositivo».</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {estado.dispositivos.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-foreground truncate">
                  {d.nombre}{d.esEste && <span className="ml-1.5 text-[11px] font-semibold text-primary">Este</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  Último uso: {fechaCortaEstudio(d.ultimoUsoEn)}{d.ip ? ` · IP ${d.ip}` : ''}
                </p>
              </div>
              <button
                type="button" onClick={() => void quitar(d.id, d.esEste)} disabled={quitando != null}
                className="shrink-0 px-2.5 py-1 rounded-lg border border-border text-[11.5px] font-medium hover:bg-background disabled:opacity-60 inline-flex items-center gap-1"
              >
                {quitando === d.id && <Loader2 size={12} className="animate-spin" aria-hidden />} Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {estado.dispositivos.length > 1 && (
        <button
          type="button" onClick={() => void quitar(null, true)} disabled={quitando != null}
          className="mt-2 text-[11.5px] font-semibold text-destructive hover:underline disabled:opacity-60 inline-flex items-center gap-1"
        >
          {quitando === 'todos' && <Loader2 size={12} className="animate-spin" aria-hidden />} Quitar todos
        </button>
      )}
      {error && <p role="alert" className="text-[11.5px] text-destructive mt-2">{error}</p>}
    </div>
  );
}
