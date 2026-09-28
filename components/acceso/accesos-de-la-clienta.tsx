'use client';

// «Acceso con QR» en la ficha de la clienta: desde cuándo vale su QR, cambiarlo
// si lo ha perdido o ha circulado una captura, y sus últimos accesos (quién la
// escaneó, a qué clase y qué salió).
//
// El QR en sí no viaja al panel: el estudio no lo necesita para nada, y cuantas
// menos copias, mejor. Ella ve el nuevo al abrir su app.

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { authHeader } from '@/lib/api-client';
import { fechaAcceso } from '@/lib/acceso/textos-acceso';
import { HistorialAccesos, useHistorialAccesos } from '@/components/acceso/historial-accesos';

export function AccesosDeLaClienta({ socioId }: { socioId: string }) {
  const [info, setInfo] = useState<{ controlActivo: boolean; qrDesde: string | null } | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const { filas, cargando, error } = useHistorialAccesos(`socioId=${encodeURIComponent(socioId)}`);

  useEffect(() => {
    let vivo = true;
    authHeader()
      .then(h => fetch(`/api/acceso/qr-alumna?socioId=${encodeURIComponent(socioId)}`, { headers: h }))
      .then(r => (r.ok ? r.json() as Promise<{ controlActivo: boolean; qrDesde: string | null }> : null))
      .then(d => { if (vivo && d) setInfo(d); })
      .catch(() => { /* sin esto, la sección se queda en el historial */ });
    return () => { vivo = false; };
  }, [socioId]);

  const regenerar = useCallback(async () => {
    setCambiando(true);
    setAviso(null);
    try {
      const res = await fetch('/api/acceso/qr-alumna', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ socioId }),
      });
      const d = await res.json().catch(() => null) as { qrDesde?: string; error?: string } | null;
      if (!res.ok || !d?.qrDesde) {
        setAviso({ ok: false, texto: d?.error ?? 'No hemos podido generar el QR nuevo.' });
        return;
      }
      setInfo(x => x && { ...x, qrDesde: d.qrDesde! });
      setAviso({ ok: true, texto: 'Hecho: su QR anterior ya no funciona. Verá el nuevo al abrir su app.' });
    } catch {
      setAviso({ ok: false, texto: 'Sin conexión: no se ha cambiado su QR.' });
    } finally {
      setCambiando(false);
      setConfirmar(false);
    }
  }, [socioId]);

  return (
    <section className="mt-8" aria-label="Acceso con QR" data-testid="accesos-clienta">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">Acceso con QR</h3>
          {info && (
            <p className="text-sm text-muted-foreground text-pretty">
              {!info.controlActivo
                ? 'El control de acceso con QR está desactivado en tu estudio.'
                : info.qrDesde
                  ? `Su QR vale desde el ${fechaAcceso(info.qrDesde).replace(/^[a-záéíóúñ]+, /i, '')}.`
                  : 'Todavía no ha abierto su QR en la app.'}
            </p>
          )}
        </div>
        {info?.controlActivo && info.qrDesde && (
          <Button variant="outline" size="sm" disabled={cambiando} onClick={() => { setAviso(null); setConfirmar(true); }}>
            Generar QR nuevo
          </Button>
        )}
      </div>
      {aviso && (
        <p role={aviso.ok ? 'status' : 'alert'} className={aviso.ok ? 'mb-3 text-sm font-semibold text-foreground' : 'mb-3 text-sm font-semibold text-destructive'}>
          {aviso.texto}
        </p>
      )}
      <HistorialAccesos
        filas={filas}
        cargando={cargando}
        error={error}
        conAlumna={false}
        conFecha
        vacio="Todavía nadie ha escaneado su QR."
      />
      <ConfirmDialog
        open={confirmar}
        onOpenChange={setConfirmar}
        titulo="¿Generar un QR nuevo?"
        descripcion="Su QR actual dejará de funcionar en el acto, también cualquier captura. Ella verá el nuevo al abrir su app."
        textoConfirmar={cambiando ? 'Generando…' : 'Generar QR nuevo'}
        onConfirm={() => void regenerar()}
      />
    </section>
  );
}
