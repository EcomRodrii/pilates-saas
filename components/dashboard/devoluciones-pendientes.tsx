'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { dbListarDevolucionesPendientes, type DevolucionPendiente } from '@/lib/supabase-data';
import { calcularReversion, huellaDe } from '@/lib/billing/preview-reversion';
import { resolverDevolucion } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

// Devoluciones que hace falta revisar: se ha devuelto dinero (o se ha perdido
// una disputa) y la socia conserva lo que se le entregó.
//
// La reversión NO es automática, a propósito: el doble cargo es una de las
// causas más frecuentes de reembolso, y ahí revertir le quitaría a la socia
// sesiones que sí pagó — justo cuando el estudio se está disculpando. Por eso
// aquí lo importante no es el botón, sino los números y el aviso de "ha usado 3
// sesiones desde el cobro": es lo que hace que la propietaria elija un reembolso
// parcial en Stripe en vez de deshacer.
//
// Alcance deliberadamente pequeño, igual que `PenalizacionesPendientes`: una
// lista y dos botones, no una pantalla. Solo se monta con `puedeMoverDinero`
// (mismo gate que el endpoint comprueba en servidor).

const ETIQUETA_ORIGEN: Record<DevolucionPendiente['origen'], string> = {
  REEMBOLSO_TOTAL: 'Devolución',
  REEMBOLSO_PARCIAL: 'Devolución parcial',
  CHARGEBACK: 'Disputa perdida',
};

export function DevolucionesPendientes({ onToast }: { onToast: (m: string) => void }) {
  const [items, setItems] = useState<DevolucionPendiente[] | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void dbListarDevolucionesPendientes().then(r => { if (vivo) setItems(r); });
    return () => { vivo = false; };
  }, []);

  async function resolver(d: DevolucionPendiente, accion: 'REVERTIR' | 'DESCARTAR') {
    setEnCurso(d.id);
    const previa = calcularReversion({ snapshot: d.snapshot, actual: d.actual });
    const r = await resolverDevolucion(d.id, accion, huellaDe(previa));
    setEnCurso(null);
    if ('error' in r) { onToast(r.error); return; }
    setItems(prev => (prev ?? []).filter(x => x.id !== d.id));
    onToast(accion === 'REVERTIR' ? 'Entrega revertida' : 'Devolución marcada como revisada');
  }

  if (!items?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <RotateCcw className="size-4 text-amber-500" />
        <p className="text-[13px] font-medium text-foreground">
          {items.length} devolución{items.length > 1 ? 'es' : ''} por revisar
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {items.map(d => {
          const previa = calcularReversion({ snapshot: d.snapshot, actual: d.actual });
          return (
            <div key={d.id} className="rounded-lg bg-muted/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-foreground">{d.socioNombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ETIQUETA_ORIGEN[d.origen]} · {d.importeDevuelto.toFixed(2)} € de {d.importeCobrado.toFixed(2)} €
                    {d.planNombre ? ` · ${d.planNombre}` : ''}
                  </p>
                </div>
              </div>

              {/* Qué se escribiría. Se enseña SIEMPRE antes de ofrecer el botón:
                  es lo que hace que la decisión sea informada y no un clic. */}
              {previa.posible && previa.objetivo && (
                <p className="mt-1.5 text-[11px] text-foreground">
                  {previa.objetivo.sesionesRestantes !== undefined && d.actual && (
                    <>Sesiones: <strong>{d.actual.sesionesRestantes ?? 0} → {previa.objetivo.sesionesRestantes}</strong>{' '}</>
                  )}
                  {previa.objetivo.fechaFin !== undefined && (
                    <>Caducidad: <strong>{d.actual?.fechaFin ?? '—'} → {previa.objetivo.fechaFin ?? 'sin fecha'}</strong></>
                  )}
                </p>
              )}

              {previa.avisos.map(a => (
                <p key={a} className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">⚠️ {a}</p>
              ))}

              {!previa.posible && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {previa.motivo === 'SIN_INSTRUMENTAR'
                    ? 'Este cobro es anterior al registro de entregas: no se sabe qué entregó.'
                    : previa.motivo === 'ESTADO_CAMBIADO'
                      ? 'La suscripción ha cambiado desde el cobro, así que deshacerlo ya no sería exacto. Revísalo a mano.'
                      : 'Este cobro no entregó nada, así que no hay nada que deshacer.'}
                </p>
              )}

              <div className="mt-2 flex gap-2">
                {previa.posible && (
                  <Button size="sm" variant="outline" disabled={enCurso === d.id}
                    onClick={() => resolver(d, 'REVERTIR')}>
                    {enCurso === d.id ? 'Revirtiendo…' : 'Revertir la entrega'}
                  </Button>
                )}
                {/* Tan a mano como el otro a propósito: en un doble cargo, NO
                    revertir es la respuesta correcta. */}
                <Button size="sm" variant="ghost" disabled={enCurso === d.id}
                  onClick={() => resolver(d, 'DESCARTAR')}>
                  {previa.posible ? 'No revertir' : 'Marcar revisada'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
