'use client';

// Altas de estudio sin terminar: en qué paso exacto se quedó cada persona, si se
// le mandó el correo de las 24 h y si terminó después. Sale del servidor
// (`altas_estudio`), no de PostHog: está aunque el navegador bloqueara la
// analítica. Sección con su propio permiso (growth.read): si falta, no se pinta.

import { useEffect, useState } from 'react';
import { fetchAltasSinTerminar, type AltasSinTerminar } from '@/lib/interno/client';
import { ETIQUETA_PASO, type FilaAltaInterno, type PasoAbandono } from '@/lib/alta/abandono';

const fechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    : '—';

const TONO_PASO: Record<PasoAbandono, string> = {
  formulario_estudio: 'bg-muted text-muted-foreground',
  formulario_plan: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  email_sin_confirmar: 'bg-amber-500/12 text-amber-700 dark:text-amber-400',
  estudio_sin_crear: 'bg-sky-500/12 text-sky-700 dark:text-sky-400',
  error_estudio: 'bg-destructive/10 text-destructive',
  terminada: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
};

// Por qué no se le manda el correo, dicho para el fundador.
const NO_SE_ENVIA: Record<string, string> = {
  aviso_antiguo: 'Ya recibió el aviso anterior',
  terminada: 'Terminó antes de las 24 h',
  es_equipo: 'Ya trabaja en un estudio',
  sin_email: 'Sin email válido',
  fuera_de_plazo: 'Más de 7 días',
  envio_fallido: 'El envío falló',
};

function Correo({ f }: { f: FilaAltaInterno }) {
  if (f.correoEnviadoEn) {
    return (
      <span>
        Enviado {fechaHora(f.correoEnviadoEn)}
        {f.terminoTrasCorreo && <strong className="ml-1 text-emerald-700 dark:text-emerald-400">· terminó después</strong>}
      </span>
    );
  }
  if (f.correoNoSeEnvia) return <span>No: {NO_SE_ENVIA[f.correoNoSeEnvia] ?? f.correoNoSeEnvia}</span>;
  if (f.paso === 'terminada') return <span>No hizo falta</span>;
  if (f.paso === 'formulario_estudio') return <span>No (no escribió ni el nombre)</span>;
  return <span>Pendiente (a las 24 h)</span>;
}

export function AltasSinTerminarSeccion() {
  const [d, setD] = useState<AltasSinTerminar | null>(null);

  // Mismo criterio que Review Boost: sin permiso (o con un fallo) la sección no
  // aparece, en vez de tumbar la pantalla entera.
  // Y sin dar por hecha la forma de la respuesta: un `{}` no puede tumbar la pantalla.
  useEffect(() => {
    void fetchAltasSinTerminar()
      .then((r) => { if (Array.isArray(r?.filas) && r.resumen?.porPaso) setD(r); })
      .catch(() => {});
  }, []);

  if (!d) return null;
  const { resumen } = d;

  return (
    <section data-testid="altas-sin-terminar">
      <h2 className="mb-1 text-[13px] font-bold text-foreground">Altas de estudio</h2>
      <p className="mb-2.5 text-[12px] text-muted-foreground">
        Quién empezó a crear su estudio, en qué paso exacto se quedó y si le llegó el correo de las 24 h.
        No incluye a quien se fue antes de crear la cuenta: eso solo lo ve PostHog.
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(resumen.porPaso) as PasoAbandono[]).filter((p) => resumen.porPaso[p] > 0).map((p) => (
          <span key={p} className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${TONO_PASO[p]}`}>
            {ETIQUETA_PASO[p]}: {resumen.porPaso[p]}
          </span>
        ))}
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">
          Correos enviados: {resumen.correos} · terminaron después: {resumen.terminaronTrasCorreo}
        </span>
      </div>

      {d.filas.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-[12.5px] text-muted-foreground">
          Todavía no hay ninguna alta registrada. Aparecen aquí en cuanto alguien crea su cuenta desde «Crear estudio».
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <div className="hidden sm:grid grid-cols-[auto_2fr_auto_1.5fr] gap-x-4 px-4 py-2 border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Empezó</span><span>Quién</span><span>Dónde se quedó</span><span>Correo</span>
          </div>
          {d.filas.map((f) => (
            <div
              key={f.authUserId}
              className="grid sm:grid-cols-[auto_2fr_auto_1.5fr] gap-x-4 gap-y-1 px-4 py-3 border-b border-border/60 last:border-0 text-[12.5px]"
            >
              <span className="tabular-nums text-muted-foreground">{fechaHora(f.iniciadaEn)}</span>
              <span className="min-w-0 break-words text-foreground">
                <strong>{f.estudio ?? 'Sin nombre'}</strong>
                <span className="text-muted-foreground"> · {f.email ?? 'sin email'}</span>
                {f.origen === 'con_sesion' && <span className="text-muted-foreground"> · entró con cuenta</span>}
              </span>
              <span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONO_PASO[f.paso]}`}>
                  {ETIQUETA_PASO[f.paso]}
                </span>
                <span className="ml-1.5 tabular-nums text-[11.5px] text-muted-foreground">{fechaHora(f.pasoDesde)}</span>
              </span>
              <span className="text-muted-foreground"><Correo f={f} /></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
