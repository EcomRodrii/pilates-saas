import { ExternalLink } from 'lucide-react';
import type { SaludEstudio } from '@/lib/interno/salud-estudio';

const NIVEL: Record<SaludEstudio['nivel'], { texto: string; clase: string }> = {
  bien: { texto: 'Bien', clase: 'bg-success/10 text-success' },
  atencion: { texto: 'Atención', clase: 'bg-amber-500/10 text-warning' },
  riesgo: { texto: 'Riesgo', clase: 'bg-destructive/10 text-destructive' },
};

const SUSCRIPCION: Record<string, string> = {
  active: 'Pagando', trialing: 'En prueba (Stripe)', past_due: 'Impago', unpaid: 'Impago',
  incomplete: 'Pago incompleto', canceled: 'Cancelada', trial_expirado: 'Prueba vencida',
};

export const textoSuscripcion = (estado: string | null) => (estado ? SUSCRIPCION[estado] ?? estado : '—');

export function PildoraSalud({ nivel }: { nivel: SaludEstudio['nivel'] }) {
  const n = NIVEL[nivel];
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${n.clase}`}>{n.texto}</span>;
}

const num = (n: number | null) => (n === null ? '?' : String(n));

function haceTexto(dias: number | null): string {
  if (dias === null) return 'nunca';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Las cuatro señales en una fila, y debajo lo que hay que mirar. */
export function SaludDetalle({ salud }: { salud: SaludEstudio }) {
  const s = salud.senales;
  return (
    <div className="flex flex-col gap-2.5">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Senal etiqueta="La dueña entró" valor={haceTexto(salud.diasSinEntrar)} />
        <Senal etiqueta="Reservas · 7 días" valor={num(s.reservas7d)} />
        <Senal etiqueta="Clases · próx. 7 días" valor={num(s.clasesProximas7d)} />
        <Senal etiqueta="Cobros fallidos · 30 d" valor={num(s.cobrosFallidos30d)} />
      </dl>
      {salud.avisos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {salud.avisos.map((a) => (
            <li key={a} className="text-[12.5px] text-foreground flex gap-2">
              <span aria-hidden className="text-warning">•</span>{a}
            </li>
          ))}
        </ul>
      )}
      {salud.sentryUrl && (
        <a href={salud.sentryUrl} target="_blank" rel="noopener noreferrer"
           className="text-[12.5px] font-semibold text-brand-medio inline-flex items-center gap-1 w-fit">
          Sus errores en Sentry (14 días) <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}

function Senal({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className="text-[15px] font-bold tabular-nums text-foreground">{valor}</dd>
    </div>
  );
}
