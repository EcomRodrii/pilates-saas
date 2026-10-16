'use client';

// Activación y altas por mes: vivían en el antiguo «Resumen» de /interno. Con la
// portada «Hoy» (16-oct-2026) se mudan aquí, que es donde se mira el
// crecimiento. Mismas cifras, misma ruta (`/api/interno/kpis`, `studios.read`):
// sin permiso o con un fallo, la sección no aparece en vez de tumbar la pantalla.

import { useEffect, useState } from 'react';
import { fetchKpis, type Kpis } from '@/lib/interno/client';

function Tarjeta({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[22px] sm:text-[26px] font-bold tabular-nums leading-none text-foreground">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>}
    </div>
  );
}

export function ActivacionYAltas() {
  const [k, setK] = useState<Kpis | null>(null);
  useEffect(() => {
    void fetchKpis().then(r => { if (r?.onboarding && Array.isArray(r.altasPorMes)) setK(r); }).catch(() => {});
  }, []);
  if (!k) return null;

  const maxAltas = Math.max(1, ...k.altasPorMes.map(a => a.altas));
  return (
    <>
      {/* Un cero se lee como un dato: si una lectura ha fallado hay que decirlo
          (ver `noLeidos` en app/api/interno/kpis/route.ts). */}
      {k.noLeidos && k.noLeidos.length > 0 && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
          <strong className="font-semibold">Faltan datos, no son ceros.</strong>{' '}
          No se ha podido leer: {k.noLeidos.join(', ')}. La activación y las altas están incompletas.
        </p>
      )}
      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Activación (onboarding)</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta
            titulo="Estudios activados" valor={`${k.onboarding.activados}/${k.onboarding.totalConActividad}`}
            pie="De los que tienen actividad: ya han recibido su primera reserva." />
          <Tarjeta
            titulo="Paso donde más se atascan"
            valor={k.onboarding.pasoMasBloqueante ? String(k.onboarding.pasoMasBloqueante.pendientes) : '0'}
            pie={k.onboarding.pasoMasBloqueante
              ? `"${k.onboarding.pasoMasBloqueante.label}" — pendiente en ${k.onboarding.pasoMasBloqueante.pendientes} estudio(s).`
              : 'Ninguno: a los que aún no tienen reservas no les falta ningún paso.'} />
          <Tarjeta
            titulo="Altas (30 días)" valor={String(k.estudios.altasUltimos30d)}
            pie={`${k.estudios.total} estudios en total · ${k.estudios.vacios} sin ninguna socia ni clase.`} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Altas por mes</h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          {k.altasPorMes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Todavía no hay altas que dibujar.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {k.altasPorMes.map(a => (
                // `h-full` en la columna y un hueco `flex-1` para la barra: la
                // altura en % necesita un padre con altura REAL (si no, resuelve
                // a cero y el gráfico sale vacío).
                <div key={a.mes} className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{a.altas}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${(a.altas / maxAltas) * 100}%` }} />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground truncate w-full text-center">{a.mes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
