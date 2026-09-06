'use client';

import { SpotPickerPublico } from '@/components/reserva/spot-picker-publico';
import { OCUPA_PLAZA } from '@/lib/student/mapeo';

// Elegir sitio (reformer, cama, esterilla) antes de confirmar.
//
// ⚠️ NO ES UN SELECTOR NUEVO. `SpotPickerPublico` ya existe y se extrajo en su
// día precisamente para que el widget no tuviera dos copias; aquí se usa el
// MISMO, con su rejilla real de filas y columnas, su espejo, su puerta y su
// leyenda. Lo único que se añade es el puente de tokens: ese componente habla
// en `--portal-*` (la paleta del widget) y esta app en la suya, así que se
// mapean en el envoltorio. Sin el puente el selector saldría sin colores, no
// mal colocado — las variables simplemente no existirían aquí.
//
// ⚠️ Lo que NO se decide aquí: si hay sitio libre. Eso lo resuelve la RPC con
// bloqueo de fila al confirmar, y una copia de esa cuenta en el cliente se
// desincroniza y promete sitios que ya no están. Esto solo pinta lo que se ve
// ocupado AHORA, para que elija con la mejor información disponible.

export interface SpotMin { id: string; salaId: string; nombre: string; fila: number; columna: number; activo?: boolean | null }
export interface AforoMin { sesion_id: string; estado: string; spot_id: string | null }

/**
 * Los huecos de la sala de ESTA clase, y cuáles se ven ocupados.
 * Devuelve `null` cuando la sala no tiene huecos definidos — que es el caso de
 * la mayoría de estudios, y entonces no se pinta nada en vez de una rejilla
 * vacía.
 */
export function huecosDeClase(spots: SpotMin[] | undefined, aforo: AforoMin[] | undefined, salaId: string, sesionId: string) {
  const deLaSala = (spots ?? []).filter((s) => s.salaId === salaId && s.activo !== false);
  if (deLaSala.length === 0) return null;
  const ocupados = new Set(
    (aforo ?? [])
      .filter((r) => r.sesion_id === sesionId && OCUPA_PLAZA.has(r.estado) && r.spot_id)
      .map((r) => r.spot_id as string),
  );
  return { spots: deLaSala, ocupados };
}

export function ElegirHueco({ spots, ocupados, elegido, onElegir }: {
  spots: SpotMin[];
  ocupados: Set<string>;
  elegido: string | null;
  onElegir: (id: string | null) => void;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <p className="t-label" style={{ marginBottom: 7 }}>Elige tu sitio</p>
      <div
        style={{
          // El puente de tokens: el selector es del widget y habla su paleta.
          ['--portal-surface' as string]: 'var(--card)',
          ['--portal-surface-2' as string]: 'var(--muted)',
          ['--portal-line' as string]: 'var(--border-strong)',
          ['--portal-muted' as string]: 'var(--muted-foreground)',
          ['--portal-ink' as string]: 'var(--foreground)',
        }}
      >
        <SpotPickerPublico
          spots={spots}
          takenIds={ocupados}
          selected={elegido}
          onSelect={onElegir}
          primary="var(--primary)"
        />
      </div>
      {/* Opcional a propósito: sin elegir, el estudio le asigna uno. Decirlo
          evita que se quede atascada creyendo que hace falta. */}
      <p className="t-meta" style={{ marginTop: 7, textAlign: 'center' }}>
        {elegido ? 'Puedes tocarlo otra vez para quitarlo.' : 'Si no eliges, te asignan uno al llegar.'}
      </p>
    </div>
  );
}
