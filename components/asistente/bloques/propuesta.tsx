'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleAlert, Loader2, TriangleAlert } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import type { PropuestaAccion } from '@/lib/asistente/tipos';
import { cn } from '@/lib/utils';
import { TextoConReferencias } from '../texto-con-referencias';
import { Tarjeta } from './tarjeta';

// La tarjeta de CONFIRMACIÓN: lo que el asistente propone crear, en lenguaje
// claro, con Confirmar / Cancelar / Cambiar algo. Nada se crea hasta pulsar
// Confirmar, y «Creada» solo se pinta con la respuesta OK del servidor (nunca
// por haber enviado la petición). El payload que se ejecuta es el guardado en el
// servidor: aquí solo viaja el id.
//
// Estados: propuesta · creando · creada · error · cancelada · caducada. El estado
// vive en el módulo (por id) para sobrevivir a salir del chat y volver.

export type EstadoTarjeta = 'propuesta' | 'creando' | 'creada' | 'error' | 'cancelada' | 'caducada';
interface Vista { estado: EstadoTarjeta; error: string | null; hecho: { href: string; texto: string } | null }

const memoria = new Map<string, Vista>();

function inicial(p: PropuestaAccion): Vista {
  const guardada = memoria.get(p.id);
  if (guardada) return guardada;
  if (p.estado === 'EJECUTADA') return { estado: 'creada', error: null, hecho: p.resultado ?? p.destino };
  if (p.estado === 'CANCELADA') return { estado: 'cancelada', error: null, hecho: null };
  if (p.estado === 'CADUCADA' || Date.parse(p.expiraEn) <= Date.now()) return { estado: 'caducada', error: null, hecho: null };
  return { estado: 'propuesta', error: null, hecho: null };
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

async function llamar(ruta: 'confirmar' | 'cancelar', id: string): Promise<{ status: number; cuerpo: { error?: string; codigo?: string; resultado?: { href: string; texto: string } | null } }> {
  const res = await fetch(`/api/asistente/acciones/${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ id }),
  });
  return { status: res.status, cuerpo: await res.json().catch(() => ({})) };
}

const TITULO_ESTADO: Partial<Record<EstadoTarjeta, string>> = {
  creada: 'Creada', cancelada: 'Cancelada', caducada: 'Caducada',
};

export function BloquePropuesta({ propuesta: p }: { propuesta: PropuestaAccion }) {
  const [v, setV] = useState<Vista>(() => inicial(p));
  // Un solo vuelo: el segundo clic (o el Enter pegado) no lanza otra petición.
  const enVuelo = useRef(false);
  const poner = (n: Vista) => { memoria.set(p.id, n); setV(n); };
  const vivo = v.estado === 'propuesta' || v.estado === 'error';

  const confirmar = async () => {
    if (enVuelo.current || !vivo) return;
    enVuelo.current = true;
    poner({ estado: 'creando', error: null, hecho: null });
    try {
      for (let intento = 0; intento < 6; intento++) {
        const r = await llamar('confirmar', p.id);
        if (r.status === 200) { poner({ estado: 'creada', error: null, hecho: r.cuerpo.resultado ?? p.destino }); return; }
        // Otra petición la está creando: se espera y se pregunta otra vez (responde «ya creada»).
        if (r.cuerpo.codigo === 'EN_CURSO') { await esperar(1200); continue; }
        if (r.cuerpo.codigo === 'CADUCADA') { poner({ estado: 'caducada', error: null, hecho: null }); return; }
        if (r.cuerpo.codigo === 'CANCELADA') { poner({ estado: 'cancelada', error: null, hecho: null }); return; }
        poner({ estado: 'error', error: r.cuerpo.error ?? 'No he podido crearla y no se ha creado nada. Puedes volver a intentarlo.', hecho: null });
        return;
      }
      poner({ estado: 'error', error: 'Está tardando más de lo normal. Mira en la pantalla correspondiente antes de repetirlo.', hecho: null });
    } catch {
      poner({ estado: 'error', error: 'No ha llegado la respuesta: no sé si se ha creado. Compruébalo antes de repetirlo, o vuelve a pulsar Confirmar (no se duplica).', hecho: null });
    } finally {
      enVuelo.current = false;
    }
  };

  const cancelar = async (cambiar: boolean) => {
    if (enVuelo.current || !vivo) return;
    enVuelo.current = true;
    try {
      const r = await llamar('cancelar', p.id).catch(() => null);
      // Ya creada entre medias: no se dice «cancelada» de algo que existe.
      if (r && r.status === 409) { poner({ estado: 'error', error: r.cuerpo.error ?? 'Ya no se puede cancelar.', hecho: null }); return; }
      poner({ estado: 'cancelada', error: null, hecho: null });
      if (cambiar) document.getElementById('asistente-pregunta')?.focus();
    } finally {
      enVuelo.current = false;
    }
  };

  const boton = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors disabled:opacity-50';
  return (
    <Tarjeta
      tipo="propuesta"
      titulo={p.titulo}
      extra={TITULO_ESTADO[v.estado] && (
        <span data-estado-tarjeta={v.estado} className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">{TITULO_ESTADO[v.estado]}</span>
      )}
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 border-t border-border px-4 py-3 text-[14px]">
        {p.lineas.map(l => (
          <div key={l.etiqueta} className="contents">
            <dt className="text-muted-foreground">{l.etiqueta}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground [&_p]:m-0"><TextoConReferencias texto={l.valor} /></dd>
          </div>
        ))}
      </dl>
      {vivo && (p.avisos.length > 0 || p.efecto) && (
        <ul className="space-y-1.5 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
          {p.avisos.map(a => (
            <li key={a} className="flex items-start gap-2"><TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" /><span className="min-w-0">{a}</span></li>
          ))}
          {p.efecto && <li className="flex items-start gap-2"><CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" /><span className="min-w-0">{p.efecto}</span></li>}
        </ul>
      )}
      <div role="status" aria-live="polite" className={cn('border-t border-border px-4 py-3', v.estado === 'propuesta' && 'sr-only')}>
        {v.estado === 'creando' && <p className="flex items-center gap-2 text-[14px] text-muted-foreground"><Loader2 size={15} aria-hidden="true" className="animate-spin" />Creándola…</p>}
        {v.estado === 'creada' && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] font-medium text-foreground">
            <span className="inline-flex items-center gap-1.5"><Check size={16} aria-hidden="true" />Creada</span>
            {v.hecho && <Link href={v.hecho.href} className="inline-flex min-h-8 items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{v.hecho.texto}<ArrowRight size={13} aria-hidden="true" /></Link>}
          </p>
        )}
        {v.estado === 'cancelada' && <p className="text-[14px] text-muted-foreground">No se ha creado nada. Dime qué cambiar y lo preparo otra vez.</p>}
        {v.estado === 'caducada' && <p className="text-[14px] text-muted-foreground">Esta propuesta ha caducado y no se ha creado nada. Vuelve a pedírmelo.</p>}
        {v.estado === 'error' && <p role="alert" className="text-[14px] text-foreground">{v.error}</p>}
      </div>
      {vivo && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => void confirmar()} className={cn(boton, 'bg-primary text-primary-foreground hover:opacity-90')} data-accion="confirmar">
            {v.estado === 'error' ? 'Reintentar' : 'Confirmar'}
          </button>
          <button type="button" onClick={() => void cancelar(true)} className={cn(boton, 'bg-muted text-foreground hover:bg-muted/70')} data-accion="cambiar">Cambiar algo</button>
          <button type="button" onClick={() => void cancelar(false)} className={cn(boton, 'text-muted-foreground hover:bg-muted hover:text-foreground')} data-accion="cancelar">Cancelar</button>
        </div>
      )}
      {v.estado === 'creando' && (
        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button type="button" disabled className={cn(boton, 'bg-primary text-primary-foreground')} aria-busy="true">Confirmar</button>
        </div>
      )}
    </Tarjeta>
  );
}
