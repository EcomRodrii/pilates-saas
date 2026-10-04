'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeader } from '@/lib/api-client';

// La verificación en dos pasos de la cuenta de una alumna, desde su ficha
// (app/api/socios/[id]/doble-factor). Se pregunta al ABRIR el diálogo y no al
// abrir la ficha: casi nadie la necesita, y no merece una petición por ficha.
// Quitarla es para cuando ha perdido la app Y el correo; ella recibe un aviso.

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; activa: boolean; sePuedeQuitar: boolean; motivo: string | null };

export function DialogoDobleFactor({ socioId, nombre, abierto, onCerrar, onAviso }: {
  socioId: string;
  nombre: string;
  abierto: boolean;
  onCerrar: () => void;
  /** El resultado, para el toast de la ficha. */
  onAviso: (texto: string) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [quitando, setQuitando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/socios/${encodeURIComponent(socioId)}/doble-factor`, { headers: await authHeader(), cache: 'no-store' });
        const data = (await res.json().catch(() => ({}))) as { activa?: boolean; sePuedeQuitar?: boolean; motivo?: string | null; error?: string };
        if (!vivo) return;
        if (!res.ok) { setEstado({ tipo: 'error', mensaje: data.error ?? 'No hemos podido comprobarlo.' }); return; }
        setEstado({ tipo: 'listo', activa: !!data.activa, sePuedeQuitar: !!data.sePuedeQuitar, motivo: data.motivo ?? null });
      } catch {
        if (vivo) setEstado({ tipo: 'error', mensaje: 'Sin conexión. Vuelve a intentarlo.' });
      }
    })();
    return () => { vivo = false; };
  }, [abierto, socioId]);

  // Al cerrar se deja en «cargando»: la próxima vez que se abra no enseña lo de antes.
  function cerrar() {
    onCerrar();
    setEstado({ tipo: 'cargando' });
  }

  async function quitar() {
    if (quitando) return;
    setQuitando(true);
    try {
      const res = await fetch(`/api/socios/${encodeURIComponent(socioId)}/doble-factor`, { method: 'DELETE', headers: await authHeader() });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; avisada?: boolean; error?: string };
      if (!res.ok || !data.ok) { setEstado({ tipo: 'error', mensaje: data.error ?? 'No hemos podido quitarla. Vuelve a intentarlo.' }); return; }
      onAviso(data.avisada
        ? `Verificación quitada. Le hemos avisado por correo a ${nombre}.`
        : `Verificación quitada. No hemos podido avisarle por correo: díselo tú a ${nombre}.`);
      cerrar();
    } catch {
      setEstado({ tipo: 'error', mensaje: 'Sin conexión. Vuelve a intentarlo.' });
    } finally {
      setQuitando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={o => { if (!o && !quitando) cerrar(); }}>
      <DialogContent className="max-w-sm" data-testid="dialogo-doble-factor">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-medio" aria-hidden />
            Verificación en dos pasos
          </DialogTitle>
        </DialogHeader>

        {estado.tipo === 'cargando' && (
          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" aria-busy="true">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Comprobando…
          </p>
        )}

        {estado.tipo === 'error' && (
          <p className="mt-2 text-xs font-medium text-destructive" role="alert">{estado.mensaje}</p>
        )}

        {estado.tipo === 'listo' && !estado.activa && (
          <p className="mt-2 text-xs text-muted-foreground text-pretty">
            {nombre} no tiene la verificación en dos pasos activada: entra en su app solo con su contraseña.
          </p>
        )}

        {estado.tipo === 'listo' && estado.activa && !estado.sePuedeQuitar && (
          <p className="mt-2 text-xs text-muted-foreground text-pretty">{estado.motivo}</p>
        )}

        {estado.tipo === 'listo' && estado.activa && estado.sePuedeQuitar && (
          <div className="mt-2 space-y-2 text-xs text-muted-foreground text-pretty">
            <p>{nombre} la tiene activada: al entrar en su app, además de la contraseña, le pedimos un código.</p>
            <p>
              Quítasela solo si te lo ha pedido porque ha perdido el acceso a su app de códigos <strong className="font-semibold text-foreground">y</strong> a
              su correo. Volverá a entrar solo con su contraseña y le avisaremos por correo. Podrá activarla otra vez desde su perfil.
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-3">
          <button
            type="button"
            onClick={cerrar}
            disabled={quitando}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {estado.tipo === 'listo' && estado.activa && estado.sePuedeQuitar ? 'Cancelar' : 'Cerrar'}
          </button>
          {estado.tipo === 'listo' && estado.activa && estado.sePuedeQuitar && (
            <button
              type="button"
              onClick={() => void quitar()}
              disabled={quitando}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-destructive text-white hover:opacity-90 disabled:opacity-50"
            >
              {quitando ? 'Quitando…' : 'Quitar la verificación'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
