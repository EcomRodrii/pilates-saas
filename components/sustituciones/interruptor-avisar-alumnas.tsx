'use client';

import { useRef, useState } from 'react';
import { setAvisarAlumnas } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// «Avisar a las alumnas»: UN control, en dos pantallas, con UN escritor.
//
// El escritor es `/api/sustituciones` (action `config_avisar`), que lo permite a
// PROPIETARIO y MANAGER. Por eso el control sigue en Sustituciones —la gerencia
// lo ha cambiado siempre desde ahí, y Configuración es solo de la propietaria—
// y además aparece en Configuración → Reservas y cancelaciones, junto a lo
// demás que le pasa a una alumna cuando su clase cambia.
//
// Las dos pantallas enseñan lo GUARDADO, sin estado optimista: el interruptor
// solo se mueve cuando el servidor ha dicho que sí. Si dice que no (4xx, 5xx o
// sin red), se queda donde estaba y se dice por qué. Y guarda al pulsar, nunca
// con el «Guardar» de un formulario: mezclar los dos modelos es la trampa de
// «Guardado sin guardar» de #1971.
// ─────────────────────────────────────────────────────────────────────────────

export function InterruptorAvisarAlumnas({ guardado, onGuardado, className }: {
  /** Lo que hay en la base de datos. null = no se ha podido leer: no se deja tocar. */
  guardado: boolean | null;
  onGuardado: (valor: boolean) => void;
  className?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true } | { error: string } | null>(null);
  // Doble toque: el `disabled` llega un render tarde, la ref no.
  const enVuelo = useRef(false);

  async function cambiar() {
    if (enVuelo.current || guardado === null) return;
    enVuelo.current = true;
    const valor = !guardado;
    setEnviando(true);
    setResultado(null);
    const r = await setAvisarAlumnas(valor);
    if ('error' in r) setResultado({ error: r.error });
    else {
      onGuardado(valor);
      setResultado({ ok: true });
    }
    setEnviando(false);
    enVuelo.current = false;
  }

  const bloqueado = guardado === null || enviando;
  return (
    <div className={className}>
      <label className={cn('flex items-center gap-2.5 text-[13px] select-none', bloqueado ? 'cursor-default' : 'cursor-pointer')}>
        <button
          type="button" role="switch" aria-checked={!!guardado} aria-busy={enviando}
          disabled={bloqueado} onClick={cambiar}
          className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-60', guardado ? 'bg-brand' : 'bg-muted')}
        >
          <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', guardado && 'translate-x-4')} />
        </button>
        <span className="text-foreground">
          Avisar a las alumnas, por email y en su app, cuando por una baja su clase cambia de instructora, se mueve o se cancela
        </span>
      </label>
      <p role="status" className="mt-1 min-h-[1em] text-[11px] text-muted-foreground">
        {enviando
          ? 'Guardando…'
          : guardado === null
            ? 'No hemos podido leer este ajuste. Recarga la página para cambiarlo.'
            : resultado && 'ok' in resultado ? 'Guardado.' : 'Se guarda al pulsar.'}
      </p>
      {resultado && 'error' in resultado && (
        <p role="alert" className="text-[11px] text-destructive">No se ha guardado: {resultado.error}</p>
      )}
    </div>
  );
}
