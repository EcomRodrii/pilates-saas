'use client';

import { useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { uid } from '@/lib/utils';
import { NOMBRE_PLATAFORMA, type Plataforma } from '@/lib/plataformas/catalogo';

// Apuntar a la clase una plaza que ha vendido ClassPass, Urban Sports Club o
// Wellhub. La venta ya ocurrió allí: aquí solo se registra para que ocupe su
// plaza (y no se venda dos veces el mismo hueco). La persona no es socia: va
// sin ficha, sin bono y sin cobro (`POST /api/reservas/crear-externa`).
//
// Nombre y Enter: son los dos gestos que pidió el diseño. El código de la
// reserva es opcional y sirve para cuadrar después los pagos de la plataforma.
export function AnadirReservaPlataforma({
  sesionId, plataforma, onHecho, showToast,
}: {
  sesionId: string;
  plataforma: Plataforma;
  /** Tras apuntarla: refrescar la clase y cerrar el bloque. */
  onHecho: () => void | Promise<void>;
  showToast: (m: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [verCodigo, setVerCodigo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un id por intento: si la red corta y se vuelve a pulsar, el servidor
  // reconoce el reintento y no crea dos reservas.
  const [reservaId, setReservaId] = useState(() => `res-${uid()}`);
  const nombrePlataforma = NOMBRE_PLATAFORMA[plataforma];

  async function apuntar() {
    if (enviando) return;
    const limpio = nombre.trim();
    if (!limpio) { setError('Escribe el nombre de la persona.'); return; }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/reservas/crear-externa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ sesionId, reservaId, plataforma, nombre: limpio, codigo: codigo.trim() || null }),
      });
      const datos = await res.json().catch(() => null) as { ok?: boolean; error?: string; aviso?: string | null } | null;
      if (!res.ok || !datos?.ok) {
        // No se dice «apuntada» si el servidor no la ha apuntado.
        setError(datos?.error ?? 'No se ha podido apuntar. Inténtalo otra vez.');
        return;
      }
      setNombre('');
      setCodigo('');
      setReservaId(`res-${uid()}`);
      showToast(datos.aviso ?? `${limpio} apuntada (${nombrePlataforma})`);
      await onHecho();
    } catch {
      setError('Sin conexión. Inténtalo otra vez.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="space-y-2"
      data-testid="anadir-reserva-plataforma"
      onSubmit={e => { e.preventDefault(); void apuntar(); }}
    >
      <input
        className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-muted-foreground"
        placeholder={`Nombre de quien reservó en ${nombrePlataforma}`}
        aria-label={`Nombre de quien reservó en ${nombrePlataforma}`}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        maxLength={120}
        autoFocus
      />
      {verCodigo ? (
        <input
          className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-muted-foreground"
          placeholder={`Código de la reserva en ${nombrePlataforma} (opcional)`}
          aria-label={`Código de la reserva en ${nombrePlataforma}`}
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          maxLength={80}
        />
      ) : (
        <button type="button" onClick={() => setVerCodigo(true)} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">
          + Código de la reserva (opcional)
        </button>
      )}
      {error && <p role="alert" className="text-[11px] font-semibold text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl py-2.5 text-xs font-bold disabled:opacity-60"
        style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}
      >
        {enviando ? 'Apuntando…' : `Apuntar reserva de ${nombrePlataforma}`}
      </button>
      <p className="text-[10px] text-muted-foreground">
        Ocupa una plaza de la clase. No gasta bonos ni pasa por tus cobros.
      </p>
    </form>
  );
}
