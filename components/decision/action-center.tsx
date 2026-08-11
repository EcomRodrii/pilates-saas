'use client';

import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { useDecisiones } from '@/components/decision/use-decisiones';
import { SEVERIDAD_INFO } from '@/lib/decision/severidad';
import {
  resumirAcciones, tituloAtencion, tituloOportunidades, fraseEuros,
} from '@/lib/decision/action-center';

// El Brain, en la pantalla donde la propietaria entra de verdad.
//
// No es un motor nuevo: agrupa lo que /api/decisiones ya devuelve — el MISMO
// endpoint y el MISMO hook que usa el Centro de Control — para que quepa arriba
// del dashboard. Lo que resuelve no es de inteligencia, es de sitio: el
// Decision OS vivía entero en /centro-de-control y esta pantalla, la que se
// abre al entrar, no lo mencionaba en ningún lado.
//
// Se pinta SOLO si hay algo que contar. Sin recomendaciones pendientes, sin
// permiso o mientras carga, no ocupa ni un píxel: un bloque que dice "todo en
// orden" cada mañana entrena a no mirarlo.
export function ActionCenter() {
  const { data, loading } = useDecisiones();
  if (loading || !data) return null;

  // ⚠️ Sin dar por hecha la forma de la respuesta. Esto vive en el DASHBOARD, la
  // pantalla que se abre al entrar: si /api/decisiones devuelve algo distinto
  // de lo esperado —un plan sin el módulo, un cuerpo de error con 200, un
  // despliegue a medias— reventar aquí tumba la pantalla entera del negocio.
  // En /centro-de-control un fallo así solo rompe su propia página; aquí no.
  const todas = [
    ...(Array.isArray(data.prioridades) ? data.prioridades : []),
    ...(Array.isArray(data.masSituaciones) ? data.masSituaciones : []),
  ];
  const r = resumirAcciones(todas);
  if (r.vacio) return null;

  const nAtencion = todas.filter(x => x.riesgo === 'PERDIDA').length;
  const nOportunidades = todas.length - nAtencion;
  const eurRiesgo = fraseEuros(r.eurMesEnRiesgo, r.eurPuntualEnRiesgo);
  const eurGanancia = fraseEuros(r.eurMesOportunidad, r.eurPuntualOportunidad);

  return (
    <Link
      href="/centro-de-control"
      className="flex flex-col gap-3 rounded-xl border p-4 transition-colors hover:bg-muted"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
    >
      {nAtencion > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-foreground">{tituloAtencion(nAtencion)}</p>
            {/* La cifra solo si el motor la respalda: `impacto` es null en las
                recomendaciones que no tienen un € limpio detrás, y ahí no se
                inventa ninguno. */}
            {eurRiesgo && (
              <span className="text-[12px] font-semibold" style={{ color: 'var(--destructive)' }}>
                {eurRiesgo} en juego
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-1.5">
            {r.atencion.map(item => (
              <li key={item.id} className="flex items-start gap-2 text-[13px] text-foreground">
                <span aria-hidden>{SEVERIDAD_INFO[item.severidad].emoji}</span>
                <span className="flex-1 leading-snug">{item.titulo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {nOportunidades > 0 && (
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[13px] font-semibold text-muted-foreground">
            {tituloOportunidades(nOportunidades)}
          </p>
          {eurGanancia && (
            <span className="text-[12px] font-semibold" style={{ color: 'var(--success)' }}>
              +{eurGanancia}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: 'var(--border)' }}>
        {/* Lo que `nivelAutonomia`/`accion.tipo` ya sabían y la UI nunca decía:
            de las cosas que necesitan atención, cuántas se resuelven aprobando
            (Tentare manda el email/WhatsApp o cobra) y cuántas son trabajo
            suyo. Es la diferencia entre una bandeja y una lista de deberes. */}
        {r.nUnToque > 0 ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Zap size={13} style={{ color: 'var(--brand-secondary)' }} />
            {r.nUnToque === 1 ? 'Una la hago yo con un toque' : `${r.nUnToque} las hago yo con un toque`}
          </span>
        ) : <span />}
        <span className="flex items-center gap-1 text-[12px] font-semibold text-brand-secondary">
          Ver y decidir <ArrowRight size={13} />
        </span>
      </div>
    </Link>
  );
}
