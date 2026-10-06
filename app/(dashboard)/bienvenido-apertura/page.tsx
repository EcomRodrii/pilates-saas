'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Las 3 preguntas de Opening OS (`OnboardingApertura`, las mismas de la
// tarjeta de apertura de Resumen) en una pantalla propia.
//
// ⚠️ Era la pantalla puente entre el asistente de bienvenida y el calendario,
// y desde #2270 ya no lo es: el asistente va directo a su destino
// (components/onboarding/pantalla-bienvenida.tsx) y estas preguntas siguen en
// Resumen. Ningún enlace del producto trae aquí, pero la ruta sigue existiendo:
// retirarla es otra decisión.
//
// Reutiliza EXACTAMENTE el contrato de `apertura-estudio.tsx`
// (`GET /api/opening`, `PATCH { onboarding }` / `{ yaAbierto: true }`) — misma
// fuente de verdad, sin lógica de negocio nueva. Una vez contestado (o
// «ya está abierto»), `mostrarOnboarding` de esa tarjeta pasa a `false` sola:
// la propietaria no vuelve a ver estas preguntas en el dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { OnboardingApertura } from '@/components/dashboard/onboarding-apertura';
import { TentiIcono } from '@/components/tenti/tenti-icono';

const DESTINO_DEFECTO = '/calendario';

function destinoValido(v: string | null): string {
  // Solo rutas internas del panel: nunca se navega a algo que no haya puesto
  // el propio `finalizar()` del asistente.
  // ⚠️ 62ª pasada: la barra invertida también. El parser de URL del navegador
  // (WHATWG, estado «relative slash») trata `\` como `/` para http(s), así que
  // `/\evil.com` pasaba las dos comprobaciones de arriba y navegaba fuera del
  // dominio: redirección abierta sobre una propietaria ya autenticada. Es el
  // mismo criterio que ya aplica `destinoTrasMfa` en lib/interno/mfa.ts.
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return DESTINO_DEFECTO;
  return v;
}

async function pedirApertura(): Promise<{ visible: boolean; onboarding?: unknown } | null> {
  try {
    const res = await fetch('/api/opening', { headers: await authHeader() });
    if (!res.ok) return null;
    const d = await res.json().catch(() => null) as { visible?: unknown; onboarding?: unknown } | null;
    if (!d || typeof d.visible !== 'boolean') return null;
    return { visible: d.visible, onboarding: d.onboarding };
  } catch {
    return null;
  }
}

async function patchApertura(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/opening', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null) as { error?: string } | null;
      return j?.error ?? 'No se pudo guardar. Inténtalo de nuevo.';
    }
    return null;
  } catch {
    return 'Sin conexión. Inténtalo de nuevo.';
  }
}

function Cargando() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <Loader2 size={22} className="animate-spin text-muted-foreground" aria-hidden />
    </main>
  );
}

function PuenteApertura() {
  const router = useRouter();
  const destino = destinoValido(useSearchParams().get('destino'));
  // null = comprobando; true = enseñar las 3 preguntas; false = ya navegando.
  const [mostrar, setMostrar] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void pedirApertura().then((d) => {
      if (!vivo) return;
      // Sin Opening OS visible para este estudio, o ya contestado antes (raro,
      // pero posible si recarga esta misma pantalla): directo al destino, sin
      // que la propietaria vea una pantalla vacía de por medio.
      if (!d || !d.visible || d.onboarding) {
        router.replace(destino);
        return;
      }
      setMostrar(true);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGuardar(onboarding: Record<string, unknown>): Promise<string | null> {
    setGuardando(true);
    const err = await patchApertura({ onboarding });
    setGuardando(false);
    if (!err) router.replace(destino);
    return err;
  }

  async function onYaAbierto() {
    setGuardando(true);
    await patchApertura({ yaAbierto: true });
    setGuardando(false);
    router.replace(destino);
  }

  if (mostrar !== true) return <Cargando />;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        {/* Tenti, donde estaba el Orb: es Tentare quien te propone por dónde
            empezar. 28 es el ancho más grande del icono; el canvas no entra
            en una pantalla sin enlaces solo para ganar tamaño. 'pregunta'
            (lib/tenti/momentos.ts): son tres preguntas, y «Lo veo más tarde»
            deja no contestarlas. Sin sonido. */}
        <div className="flex justify-center">
          <TentiIcono ancho={28} estado="pregunta" />
        </div>
        <h1 className="mt-4 text-center text-[19px] font-bold leading-tight tracking-tight text-foreground">
          Una última cosa antes de entrar
        </h1>
        <p className="mt-1.5 text-center text-[13.5px] leading-snug text-muted-foreground">
          Tres preguntas rápidas y te decimos por dónde empezar con tu apertura.
        </p>
        <div className="mt-5 rounded-2xl border border-border bg-card p-4">
          <OnboardingApertura onGuardar={onGuardar} onYaAbierto={() => void onYaAbierto()} guardando={guardando} />
        </div>
        <button
          type="button"
          onClick={() => router.replace(destino)}
          disabled={guardando}
          className="mt-3 block w-full text-center text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Lo veo más tarde
        </button>
      </div>
    </main>
  );
}

export default function PaginaBienvenidoApertura() {
  return (
    <Suspense fallback={<Cargando />}>
      <PuenteApertura />
    </Suspense>
  );
}
