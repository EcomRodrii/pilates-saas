'use client';

import { useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { NOMBRE_PLATAFORMA, PLATAFORMAS, type Plataforma } from '@/lib/plataformas/catalogo';

// Qué plataformas venden plazas de este estudio (ClassPass, Urban Sports Club,
// Wellhub). Hoy en modo manual: encenderla solo deja apuntar sus ventas desde
// la hoja de la clase, para que ocupen plaza y no se venda dos veces el mismo
// hueco. Cuando haya conexión por API, esta misma fila guardará sus datos.

/** «ClassPass y USC», o null si no hay ninguna. */
export function resumenPlataformasActivas(activas: Plataforma[]): string | null {
  if (activas.length === 0) return null;
  const nombres = activas.map(p => NOMBRE_PLATAFORMA[p]);
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export function usePlataformasActivas(): Plataforma[] {
  const { integraciones } = useStudio();
  return PLATAFORMAS.filter(p => integraciones.some(i => i.tipo === p && i.activo));
}

export function DetallePlataformasExternas({ showToast }: { showToast: (m: string) => void }) {
  const { upsertIntegracion } = useStudio();
  const activas = usePlataformasActivas();
  const [guardando, setGuardando] = useState<Plataforma | null>(null);

  async function cambiar(p: Plataforma, activo: boolean) {
    setGuardando(p);
    const res = await upsertIntegracion(p, activo, { modo: 'manual' }, { modo: 'manual' });
    setGuardando(null);
    if (!res.ok) { showToast(res.error); return; }
    showToast(activo
      ? `${NOMBRE_PLATAFORMA[p]} activada: ya puedes apuntar sus reservas desde la clase`
      : `${NOMBRE_PLATAFORMA[p]} desactivada`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Marca las plataformas en las que vendes plazas. Cuando alguien reserve allí, apúntalo en la clase
        (<span className="font-semibold text-foreground">Añadir → ClassPass</span>, por ejemplo): ocupa su plaza,
        no gasta bonos ni pasa por tus cobros, y sale en la lista con la etiqueta de la plataforma.
      </p>
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {PLATAFORMAS.map(p => {
          const activa = activas.includes(p);
          return (
            <li key={p} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{NOMBRE_PLATAFORMA[p]}</p>
                <p className="text-xs text-muted-foreground">{activa ? 'Vendo aquí · apunto yo las reservas' : 'No vendo aquí'}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={activa}
                aria-label={`Vendo en ${NOMBRE_PLATAFORMA[p]}`}
                disabled={guardando !== null}
                onClick={() => cambiar(p, !activa)}
                className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
                style={{ background: activa ? 'var(--brand)' : 'var(--muted)' }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                  style={{ left: 2, transform: activa ? 'translateX(20px)' : 'none' }}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        La conexión automática (que las reservas entren solas) llegará con el acceso a la API de cada plataforma.
      </p>
    </div>
  );
}
