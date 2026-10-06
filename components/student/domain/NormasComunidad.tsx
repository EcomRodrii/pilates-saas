'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { useToast } from '@/components/student/ui/Toast';
import { CODIGO_NORMAS_PENDIENTES, NORMAS_COMUNIDAD } from '@/lib/moderacion/normas';
import { aceptarNormasComunidad } from '@/lib/student/normas';

// Normas de la comunidad (App Store 1.2): se aceptan una vez antes de escribir
// en el chat o en el tablón. No se piden al abrir la pantalla: las pide el
// SERVIDOR al enviar (409 `NORMAS_PENDIENTES`), y entonces se enseñan, se
// aceptan y el mismo envío se repite solo — el borrador no se pierde.

/** Contacto de Tentare como desarrollador de la app (App Store 1.2). */
export const CONTACTO_TENTARE = 'hola@tentare.app';

function ListaNormas() {
  return (
    <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--t-small)', lineHeight: 1.5, color: 'var(--foreground)' }}>
      {NORMAS_COMUNIDAD.puntos.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
}

export function HojaNormas({ open, onClose, onAceptada }: { open: boolean; onClose: () => void; onAceptada: () => void }) {
  const { toast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const aceptar = async () => {
    setGuardando(true);
    const r = await aceptarNormasComunidad();
    setGuardando(false);
    if (!r.ok) { toast(r.error); return; }
    onAceptada();
  };
  return (
    <Sheet open={open} onClose={onClose} label={NORMAS_COMUNIDAD.titulo}>
      <div data-testid="hoja-normas">
        <h3 className="t-h2" style={{ margin: 0 }}>{NORMAS_COMUNIDAD.titulo}</h3>
        <p className="t-meta" style={{ margin: '6px 0 0', lineHeight: 1.5 }}>{NORMAS_COMUNIDAD.intro}</p>
        <ListaNormas />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          <Button full loading={guardando} onClick={() => void aceptar()}>Acepto las normas</Button>
          <Button variant="ghost" full onClick={onClose} disabled={guardando}>Ahora no</Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Envuelve un envío: si el servidor pide las normas, las enseña y, si se
 * aceptan, repite el MISMO envío una vez. Si no se aceptan, devuelve la
 * respuesta tal cual (la pantalla no pinta nada y el borrador se queda).
 */
export function useNormasComunidad(): {
  conNormas: <R extends { ok: boolean; codigo?: string }>(intento: () => Promise<R>) => Promise<R>;
  hoja: ReactNode;
} {
  const [abierta, setAbierta] = useState(false);
  // La hoja solo existe desde que hace falta: un `Sheet` cerrado sigue montado (fuera
  // de pantalla), y cada publicación del tablón lleva su propio envío.
  const [usada, setUsada] = useState(false);
  const resolver = useRef<((aceptada: boolean) => void) | null>(null);

  const cerrar = useCallback((aceptada: boolean) => {
    setAbierta(false);
    resolver.current?.(aceptada);
    resolver.current = null;
  }, []);

  const conNormas = useCallback(async <R extends { ok: boolean; codigo?: string }>(intento: () => Promise<R>): Promise<R> => {
    const r = await intento();
    if (r.ok || r.codigo !== CODIGO_NORMAS_PENDIENTES) return r;
    const aceptada = await new Promise<boolean>((ok) => { resolver.current = ok; setUsada(true); setAbierta(true); });
    return aceptada ? intento() : r;
  }, []);

  return {
    conNormas,
    hoja: usada ? <HojaNormas open={abierta} onClose={() => cerrar(false)} onAceptada={() => cerrar(true)} /> : null,
  };
}

/** Las normas para leerlas cuando se quiera, y a quién escribir: Ayuda (alumna) y Perfil (instructora). */
export function NormasYContacto() {
  return (
    <section data-testid="normas-y-contacto">
      <p className="t-label" style={{ margin: '0 0 7px' }}>Comunidad y contacto</p>
      <div className="card" style={{ overflow: 'hidden' }}>
        <details style={{ borderBottom: '1px solid var(--muted)' }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '13px 15px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
            {NORMAS_COMUNIDAD.titulo}
          </summary>
          <div style={{ padding: '0 15px 13px' }}>
            <p className="t-meta" style={{ margin: 0, lineHeight: 1.5 }}>{NORMAS_COMUNIDAD.intro}</p>
            <ListaNormas />
          </div>
        </details>
        <p style={{ margin: 0, padding: '13px 15px', fontSize: 'var(--t-small)', lineHeight: 1.55, color: 'var(--muted-foreground)' }}>
          Esta app funciona con Tentare. Para cualquier problema con la app, o si algo de lo que has denunciado sigue sin resolverse,
          escríbenos a <a href={`mailto:${CONTACTO_TENTARE}`} style={{ color: 'var(--accent)', fontWeight: 700 }}>{CONTACTO_TENTARE}</a>.
        </p>
      </div>
    </section>
  );
}
