'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useCore } from './core-context';
import { useRol } from './permisos';
import { tieneFeature } from './billing/entitlements';
import { puedeUsarAsistente } from './asistente/roles';
import { authHeader } from './api-client';

// «Pregúntale a Tentare»: el chat vive en su propia pantalla, /asistente, y se
// llega por tres puertas: la barra del Centro de Control, la fila de ⌘K y el
// atajo ⌘J. Las tres llevan ahí con la pregunta ya enviada (si la hay).
//
// ⚠️ Esto va en el chunk de TODO el panel, así que es mínimo a propósito:
//   · El chat (las tarjetas, el lector del stream, Tenti) es el chunk de la
//     ruta /asistente: no se descarga hasta entrar (lo vigila
//     e2e/asistente.spec.ts con el recolector de scripts).
//   · Sin sondeos ni temporizadores. Si el servidor lo tiene encendido para
//     este estudio se pregunta UNA vez por sesión del navegador y estudio
//     (`?solo=disponible`, sin tocar el libro), y solo cuando una puerta lo
//     necesita: al montarse la barra, al abrir ⌘K o al pulsar ⌘J. Un rol o un
//     plan sin asistente no pregunta nunca.
//   · La pregunta que trae una puerta viaja en memoria (`tomarPreguntaPendiente`),
//     NUNCA en la URL: puede llevar el nombre de una alumna.
//   · El rol y el plan se miran aquí (`ROLES_ASISTENTE`, feature `asistente`):
//     ninguna puerta los vuelve a escribir. El límite de verdad es el servidor.

interface ValorAsistente {
  /** Rol y plan lo permiten (sin preguntar al servidor). */
  puede: boolean;
  /** El servidor lo tiene encendido para este estudio: `null` mientras no se sabe. */
  disponible: boolean | null;
  /** Que se averigüe si está disponible (una vez por sesión). Lo llaman las puertas al montarse. */
  comprobar: () => void;
  /** Lleva al chat; con `pregunta`, la deja enviada. */
  abrir: (pregunta?: string) => void;
}

const Ctx = createContext<ValorAsistente>({
  puede: false, disponible: false, comprobar: () => {}, abrir: () => {},
});

/** La pregunta que trajo una puerta, para que el chat la envíe al montarse. Una sola vez. */
let preguntaPendiente: string | null = null;
export function tomarPreguntaPendiente(): string | null {
  const p = preguntaPendiente;
  preguntaPendiente = null;
  return p;
}

const CLAVE = (studioId: string) => `tentare-asistente-disponible:${studioId}`;
/** Lo que se recuerda la respuesta en esta pestaña: el interruptor se puede cambiar en Vercel. */
const VIGENCIA_MS = 30 * 60_000;

/** Una sola pregunta en vuelo por estudio, compartida por todas las puertas. */
const enCurso = new Map<string, Promise<boolean>>();

function leerGuardado(studioId: string): boolean | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE(studioId)) ?? 'null') as { d: boolean; t: number } | null;
    return v && Date.now() - v.t < VIGENCIA_MS ? v.d : null;
  } catch { return null; }
}

function preguntarDisponible(studioId: string): Promise<boolean> {
  let p = enCurso.get(studioId);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch('/api/asistente/saldo?solo=disponible', { headers: await authHeader() });
        const d = res.ok && (await res.json() as { disponible?: unknown }).disponible === true;
        try { sessionStorage.setItem(CLAVE(studioId), JSON.stringify({ d, t: Date.now() })); } catch { /* sin almacenamiento: solo en memoria */ }
        return d;
      } catch {
        enCurso.delete(studioId); // un fallo de red no se recuerda: la próxima puerta lo vuelve a intentar
        return false;
      }
    })();
    enCurso.set(studioId, p);
  }
  return p;
}

export function AsistenteProvider({ children }: { children: ReactNode }) {
  const rol = useRol();
  const { user } = useAuth();
  const { studio } = useCore();
  const studioId = studio?.id ?? null;
  const puede = !!studio && !!user && puedeUsarAsistente(rol) && tieneFeature(studio, 'asistente');

  const [disponibles, setDisponibles] = useState<Record<string, boolean>>({});
  const disponible = !puede || !studioId ? false : (disponibles[studioId] ?? null);

  const comprobar = useCallback(() => {
    if (!puede || !studioId || disponibles[studioId] !== undefined) return;
    const guardado = leerGuardado(studioId);
    if (guardado !== null) { setDisponibles(d => ({ ...d, [studioId]: guardado })); return; }
    void preguntarDisponible(studioId).then(v => setDisponibles(d => ({ ...d, [studioId]: v })));
  }, [puede, studioId, disponibles]);

  const router = useRouter();
  const abrir = useCallback((pregunta?: string) => {
    if (!puede) return;
    const t = pregunta?.trim();
    preguntaPendiente = t ? t.slice(0, 500) : null;
    router.push('/asistente');
  }, [puede, router]);

  // ⌘J (Ctrl+J): al chat desde cualquier pantalla, si está disponible.
  useEffect(() => {
    if (!puede || !studioId) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'j' || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const ya = disponibles[studioId] ?? leerGuardado(studioId);
      if (ya !== null && ya !== undefined) { if (ya) abrir(); return; }
      void preguntarDisponible(studioId).then(v => {
        setDisponibles(d => ({ ...d, [studioId]: v }));
        if (v) abrir();
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [puede, studioId, disponibles, abrir]);

  const valor = useMemo<ValorAsistente>(
    () => ({ puede, disponible, comprobar, abrir }),
    [puede, disponible, comprobar, abrir],
  );

  return (
    <Ctx.Provider value={valor}>
      {children}
    </Ctx.Provider>
  );
}

export function useAsistente(): ValorAsistente {
  return useContext(Ctx);
}

/**
 * Para una puerta: `true` solo si el rol, el plan Y el servidor lo permiten.
 * Pregunta al servidor al montarse (una vez por sesión). Mientras no se sabe,
 * `false`: la puerta no se pinta y luego aparece, nunca al revés.
 */
export function usePuertaAsistente(): boolean {
  const { puede, disponible, comprobar } = useAsistente();
  useEffect(() => { if (puede) comprobar(); }, [puede, comprobar]);
  return puede && disponible === true;
}
