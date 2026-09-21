'use client';

import { useState } from 'react';
import { REGLAS } from '@/lib/notifications/catalog';
import { PUSH_POR_TIPO, pushEfectivo, type RolConPushPorTipo } from '@/lib/notifications/push-por-tipo';
import { guardarPushEvento, type PreferenciaCategoria } from '@/lib/student/perfil-y-avisos';
import { useToast } from '@/components/student/ui/Toast';
import { Interruptor } from '@/components/student/ui/Interruptor';

// Un interruptor por cada tipo de aviso que le llega por push a este rol.
// El valor de partida es el EFECTIVO (excepción del tipo o, si no la hay, su
// categoría): quien apagó una categoría entera antes de existir esto la ve
// apagada aquí tipo a tipo, no encendida de golpe.
export function estadoInicialPush(rol: RolConPushPorTipo, prefs: PreferenciaCategoria[]): Record<string, boolean> {
  const estado: Record<string, boolean> = {};
  for (const grupo of PUSH_POR_TIPO[rol]) {
    for (const { evento } of grupo.tipos) {
      const cat = prefs.find((p) => p.category === REGLAS[evento]?.category);
      estado[evento] = pushEfectivo(cat ? cat.push : true, cat?.pushEventos, evento);
    }
  }
  return estado;
}

export function PushPorTipo({ rol, studioId, inicial, online }: {
  rol: RolConPushPorTipo;
  studioId: string;
  inicial: Record<string, boolean>;
  online: boolean;
}) {
  const { toast } = useToast();
  const [estado, setEstado] = useState(inicial);
  const [guardando, setGuardando] = useState<ReadonlySet<string>>(new Set());

  const cambiar = async (evento: string, valor: boolean) => {
    const antes = estado[evento];
    setEstado((s) => ({ ...s, [evento]: valor }));
    setGuardando((g) => new Set(g).add(evento));
    const ok = await guardarPushEvento({ studioId, evento, push: valor });
    setGuardando((g) => { const n = new Set(g); n.delete(evento); return n; });
    // Dejarlo cambiado si el servidor dijo que no sería enseñarle una
    // preferencia que el motor no tiene.
    if (!ok) {
      setEstado((s) => ({ ...s, [evento]: antes }));
      toast('No hemos podido guardar ese cambio.');
    }
  };

  return (
    <div data-testid="push-por-tipo">
      {PUSH_POR_TIPO[rol].map((grupo, i) => (
        <section key={grupo.titulo}>
          <p className="t-label" style={{ margin: i === 0 ? '0 0 7px' : '16px 0 7px' }}>{grupo.titulo}</p>
          <div className="card" style={{ overflow: 'hidden' }}>
            {grupo.tipos.map((t) => (
              <Interruptor
                key={t.evento}
                label={t.titulo}
                sub={t.detalle}
                on={estado[t.evento] ?? true}
                disabled={!online || guardando.has(t.evento)}
                onChange={(v) => void cambiar(t.evento, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
