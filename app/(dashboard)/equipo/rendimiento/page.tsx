'use client';

// Fila 17 del informe estratégico: "Se paga igual a quien retiene y a quien
// no" → rendimiento de instructoras por retención, conversión y red social.
// Informe de solo lectura, calculado al vuelo — no cambia nada de la
// liquidación ni del pago, solo mide.

import { useEffect, useState } from 'react';
import { useRol } from '@/lib/permisos';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { PageHeader } from '@/components/ui/page-header';
import { fetchRendimientoInstructoras, type RendimientoInstructoraApi } from '@/lib/api-client';

function Metrica({ etiqueta, pct, n }: { etiqueta: string; pct: number | null; n: number }) {
  return (
    <div>
      <p className="text-muted-foreground">{etiqueta}</p>
      {pct === null ? (
        <p className="text-[13px] text-muted-foreground">Sin dato</p>
      ) : (
        <p className="font-semibold text-foreground">{pct}% <span className="text-[11px] font-normal text-muted-foreground">(de {n})</span></p>
      )}
    </div>
  );
}

export default function RendimientoInstructorasPage() {
  const rol = useRol();
  const [items, setItems] = useState<RendimientoInstructoraApi[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetchRendimientoInstructoras().then(r => { if (vivo) { setItems(r); setCargando(false); } });
    return () => { vivo = false; };
  }, []);

  if (!puedeGestionarEquipo(rol)) {
    return (
      <div className="space-y-5">
        <PageHeader title="Rendimiento" back={{ href: '/equipo', label: 'Volver a Equipo' }} />
        <p className="text-sm text-muted-foreground">No tienes permiso para ver esta pantalla.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rendimiento de instructoras"
        description="Retención, conversión de primerizas y red social — últimos 90 días. No cambia nada de la liquidación, solo mide."
        back={{ href: '/equipo', label: 'Volver a Equipo' }}
      />

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay instructoras de alta.</p>
      ) : (
        <div className="space-y-4">
          {items.map(i => (
            <div key={i.instructorId} className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-[14px] font-semibold text-foreground mb-3">{i.nombre}</h2>
              {i.datosInsuficientes ? (
                <p className="text-[13px] text-muted-foreground">
                  Todavía no hay datos suficientes (necesita al menos 5 alumnas propias y 60 días dando clases en el estudio).
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[13px]">
                  <Metrica etiqueta="Retención" pct={i.retencionPct} n={i.nParaRetencion} />
                  <Metrica etiqueta="Conversión de primerizas" pct={i.conversionPct} n={i.nParaConversion} />
                  <Metrica etiqueta="Red social" pct={i.redSocialPct} n={i.nAlumnasAtribuidas} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
