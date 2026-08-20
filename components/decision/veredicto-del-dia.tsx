'use client';

import { useState } from 'react';
import { Check, X, Clock3, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { severidad, SEVERIDAD_INFO } from './severidad';
import type { VeredictoAPI } from './use-decisiones';

// El Umbral (lib/decision/umbral.ts), en pantalla: el elemento principal de
// Centro de Control ya no es una lista — es una sola frase, o silencio. La
// evidencia y el resto de detalle quedan ocultos hasta que se piden (ver
// nota de diseño "un mensaje, uno").

const QUE_REVISO = [
  'reservas y ocupación de las clases',
  'pagos y renovaciones',
  'asistencia y patrones de baja',
  'carga de trabajo del equipo',
];

/** Cabecera / estado global (reorganización Centro de Control §1). Un mismo
 * titular para las dos ramas "nada pendiente" (SILENCIO y MENSAJE ya
 * resuelto): si el piloto hizo algo hoy, se dice explícitamente — es el
 * valor central de la pantalla, no un detalle a adivinar en Actividad. */
function tituloEstadoGlobal(nAutonomasHoy: number): { titulo: string; subtitulo: string } {
  if (nAutonomasHoy > 0) {
    const accion = nAutonomasHoy === 1 ? 'acción' : 'acciones';
    return {
      titulo: 'Ya te ocupaste de lo de hoy.',
      subtitulo: `Tentare ha resuelto ${nAutonomasHoy} ${accion} automáticamente. Nada más necesita tu criterio por ahora.`,
    };
  }
  return {
    titulo: 'Todo bajo control.',
    subtitulo: 'No hay ninguna acción pendiente que requiera tu criterio ahora mismo.',
  };
}

export function VeredictoDelDia({ veredicto, onHecho, onYaLoSe, onPosponer, procesando, whatsappHref, nAutonomasHoy = 0, totalPendiente = 0, onVerPendiente }: {
  veredicto: VeredictoAPI;
  onHecho: () => void;
  onYaLoSe: () => void;
  onPosponer: () => void;
  procesando?: boolean;
  whatsappHref?: string | null;
  /** Reorganización Centro de Control §1: cuántas acciones ejecutó el piloto
   * automático hoy sin esperar criterio — cambia el titular de "nada
   * pendiente" para que se note que Tentare ya trabajó, no solo que calló. */
  nAutonomasHoy?: number;
  /** Cuántas situaciones sigue habiendo en Prioridades + Más situaciones
   * aunque El Umbral haya decidido no interrumpir hoy — el mismo número que
   * ya suma el Action Center del Dashboard. Sin esto, "Todo bajo control"
   * contradice a un clic de distancia a "9 cosas necesitan tu atención". */
  totalPendiente?: number;
  onVerPendiente?: () => void;
}) {
  const [porQueAbierto, setPorQueAbierto] = useState(false);
  const [queRevisoAbierto, setQueRevisoAbierto] = useState(false);

  const puente = totalPendiente > 0 && onVerPendiente && (
    <button
      type="button"
      onClick={onVerPendiente}
      className="max-w-sm text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      Nada cruza el umbral hoy, pero tienes {totalPendiente} {totalPendiente === 1 ? 'situación' : 'situaciones'} en seguimiento.
    </button>
  );

  if (veredicto.tipo === 'SIN_ANALIZAR') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 py-6 text-center">
          <p className="text-[14px] text-muted-foreground">
            Todavía no he hecho mi primer análisis de hoy. Vuelve en un rato.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (veredicto.tipo === 'SILENCIO') {
    const { titulo, subtitulo } = tituloEstadoGlobal(nAutonomasHoy);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <div aria-hidden className="h-8 w-8 rounded-full" style={{ border: '2.5px solid var(--success)' }} />
          <h2 className="font-heading text-[18px] font-semibold text-foreground">{titulo}</h2>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">{subtitulo}</p>
          {puente}
          {veredicto.semanaTranquila && (
            <p className="max-w-sm text-[12.5px] text-muted-foreground">
              Esta semana no hubo nada que mereciera interrumpirte.
            </p>
          )}
          <button
            type="button"
            onClick={() => setQueRevisoAbierto(v => !v)}
            className="mt-2 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-secondary)' }}
          >
            {queRevisoAbierto ? 'Ocultar' : '¿Qué he estado mirando?'}
          </button>
          {queRevisoAbierto && (
            <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              {QUE_REVISO.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  const r = veredicto.recomendacion;
  // MENSAJE cuya recomendación ya se resolvió por otra vía (p.ej. aprobada
  // desde "Recomendaciones de hoy" antes de recargar) — antes esto devolvía
  // null y dejaba el hueco del titular del día vacío, justo donde más se
  // nota (arriba del todo, antes de Seguimiento). Mismo tratamiento visual
  // que SILENCIO, pero reconociendo que sí hubo algo y ya se gestionó.
  if (!r) {
    const { titulo, subtitulo } = tituloEstadoGlobal(nAutonomasHoy);
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <div aria-hidden className="h-8 w-8 rounded-full" style={{ border: '2.5px solid var(--success)' }} />
          <h2 className="font-heading text-[18px] font-semibold text-foreground">{titulo}</h2>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">{subtitulo}</p>
          {puente}
        </CardContent>
      </Card>
    );
  }

  const sev = SEVERIDAD_INFO[severidad(r.prioridad, r.riesgo, r.confianza.nivel)];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <span
          className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: sev.color, backgroundColor: sev.bg }}
        >
          {sev.emoji} {sev.label}
        </span>
        <h2 className="font-heading text-[20px] leading-snug font-semibold text-foreground">{r.titulo}</h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">{r.motivo}</p>

        {veredicto.fraseConfianza && (
          <p className="text-[13px] font-medium text-foreground">{veredicto.fraseConfianza}</p>
        )}

        <button
          type="button"
          onClick={() => setPorQueAbierto(v => !v)}
          className="w-fit text-[12px] font-semibold underline underline-offset-2"
          style={{ color: 'var(--brand-secondary)' }}
        >
          {porQueAbierto ? 'Ocultar evidencia' : '¿Por qué?'}
        </button>
        {porQueAbierto && (
          <ul className="flex flex-col gap-1 border-l-2 pl-3 text-[12.5px] text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
            {r.confianza.evidencia.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" onClick={onHecho} disabled={procesando}>
            <Check size={14} /> Hecho
          </Button>
          {whatsappHref && (
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex">
              <Button size="sm" variant="outline" type="button" tabIndex={-1}>
                <MessageCircle size={14} /> WhatsApp
              </Button>
            </a>
          )}
          <Button size="sm" variant="outline" onClick={onYaLoSe} disabled={procesando}>
            <X size={14} /> Ya lo sé
          </Button>
          <Button size="sm" variant="outline" onClick={onPosponer} disabled={procesando}>
            <Clock3 size={14} /> Recuérdamelo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
