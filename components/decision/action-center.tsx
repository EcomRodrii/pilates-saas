'use client';

import Link from 'next/link';
import { ArrowRight, Compass, Zap } from 'lucide-react';
import { BOTON_VIVO, Baldosa } from '@/components/dashboard/vivo';
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
/**
 * `nueva`: con la forma de las tarjetas de la home nueva (panel nuevo): un
 * punto de color por gravedad en vez del emoji y la acción como botón.
 */
export function ActionCenter({ nueva = false }: { nueva?: boolean } = {}) {
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

  if (nueva) {
    return (
      <Link
        href="/centro-de-control?detalle=1"
        className="group flex flex-col gap-3 rounded-t-card border border-border bg-card p-5 shadow-t-card transition-colors hover:bg-muted/40"
      >
        <div className="flex items-start gap-3">
          <Baldosa tono="magenta" Icono={Compass} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-foreground">
              {nAtencion > 0 ? tituloAtencion(nAtencion) : tituloOportunidades(nOportunidades)}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              El Centro de Control lo ha visto en tus datos
              {nAtencion > 0 && eurRiesgo && <> · <span className="font-medium" style={{ color: 'var(--destructive)' }}>{eurRiesgo} en juego</span></>}
              {nAtencion === 0 && eurGanancia && <> · <span className="font-medium" style={{ color: 'var(--success)' }}>+{eurGanancia}</span></>}
            </p>
          </div>
        </div>
        {nAtencion > 0 && (
          <ul className="flex flex-col gap-1.5 pl-[52px]">
            {r.atencion.map(item => (
              <li key={item.id} className="flex items-start gap-2 text-[13px] text-foreground">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: SEVERIDAD_INFO[item.severidad].color }} />
                <span className="sr-only">{SEVERIDAD_INFO[item.severidad].label}: </span>
                <span className="flex-1 leading-snug">{item.titulo}</span>
              </li>
            ))}
          </ul>
        )}
        {nAtencion > 0 && nOportunidades > 0 && (
          <p className="pl-[52px] text-[13px] text-muted-foreground">
            Y {nOportunidades === 1 ? 'una oportunidad' : `${nOportunidades} oportunidades`}
            {eurGanancia && <> · <span className="font-medium" style={{ color: 'var(--success)' }}>+{eurGanancia}</span></>}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-muted pt-3">
          {r.nUnToque > 0 ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Zap size={14} aria-hidden />
              {r.nUnToque === 1 ? 'Una la hago yo con un toque' : `${r.nUnToque} las hago yo con un toque`}
            </span>
          ) : <span />}
          <span className={`${BOTON_VIVO} h-9 px-4 text-[13px]`}>
            Ver y decidir <ArrowRight size={13} aria-hidden />
          </span>
        </div>
      </Link>
    );
  }

  return (
    // `?detalle=1`: llega con la lista abierta, que es lo que esta tarjeta cuenta.
    <Link
      href="/centro-de-control?detalle=1"
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
        {/* De las cosas que necesitan atención, cuántas se resuelven aprobando
            (Tentare manda el email/WhatsApp o cobra) y cuántas son trabajo
            suyo. Lo cuenta con el `efecto` de cada una, el mismo que pinta el
            botón en el Centro de Control: «la hago yo» solo donde ese botón
            no dice «Hecho». Es la diferencia entre una bandeja y una lista de
            deberes. */}
        {r.nUnToque > 0 ? (
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Zap size={14} style={{ color: 'var(--brand-secondary)' }} />
            {r.nUnToque === 1 ? 'Una la hago yo con un toque' : `${r.nUnToque} las hago yo con un toque`}
          </span>
        ) : <span />}
        <span className="flex items-center gap-1 text-[12px] font-semibold text-brand-secondary">
          Ver y decidir <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}
