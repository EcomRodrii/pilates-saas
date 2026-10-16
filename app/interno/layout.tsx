'use client';

// Chrome del panel interno. Deliberadamente MUY distinto del panel de un
// estudio (menú lateral oscuro, marca «Tentare · Zona interna»): mirando media
// pantalla tienes que saber si estás en tu backoffice o dentro del negocio de un
// cliente. Confundirlos es como se cometen los errores caros.
//
// El menú va agrupado por para qué sirve cada pantalla (rediseño aprobado por el
// fundador el 16-oct-2026; antes eran 17 pestañas en una barra que se salía de
// la pantalla). Vive en ./menu.tsx; aquí, la guardia y lo que se comparte.
//
// La guardia de aquí es de USABILIDAD, no de seguridad: decide qué se pinta.
// Quien autoriza de verdad es cada ruta de /api/interno, que vuelve a
// comprobar permisos con el JWT. Un cliente manipulado no consigue nada.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { EVENTO_MFA_REQUERIDO, fetchHoy, fetchSesionInterna, SinAcceso, type SesionInterna } from '@/lib/interno/client';
import type { Hoy } from '@/lib/interno/hoy';
import { useAuth } from '@/lib/auth-context';
import { BarraMovil, MarcaInterna, MenuLateral } from './menu';

const Ctx = createContext<SesionInterna | null>(null);
export const useSesionInterna = (): SesionInterna => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSesionInterna fuera del layout de /interno');
  return s;
};

// «Hoy» se pide UNA vez aquí y lo comparten la portada y los contadores del
// menú: es la misma respuesta, y pedirla dos veces sería preguntar dos veces a
// Stripe. `recargar` lo usa la portada al volver a ella.
export interface HoyInterno {
  hoy: Hoy | null;
  error: string | null;
  /** Instante (ms) de la última respuesta buena, para no repetirla al volver enseguida. */
  cargadoEn: number;
  recargar: () => Promise<void>;
}
const HoyCtx = createContext<HoyInterno | null>(null);
export const useHoyInterno = (): HoyInterno => {
  const h = useContext(HoyCtx);
  if (!h) throw new Error('useHoyInterno fuera del layout de /interno');
  return h;
};

export default function LayoutInterno({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [sesion, setSesion] = useState<SesionInterna | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  // La pantalla de MFA vive dentro de /interno pero NO puede depender de la
  // sesión interna: con la exigencia activa, esa llamada es justo la que
  // responde MFA_REQUERIDO y la mandaría aquí en bucle.
  const esPantallaMfa = pathname === '/interno/mfa';
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [errorHoy, setErrorHoy] = useState<string | null>(null);
  const [hoyCargadoEn, setHoyCargadoEn] = useState(0);
  const pidiendoHoy = useRef(false);

  const recargarHoy = useCallback(async () => {
    if (pidiendoHoy.current) return;
    pidiendoHoy.current = true;
    try {
      const r = await fetchHoy();
      // Sin dar por hecha la forma: un `{}` no puede tumbar el menú entero.
      if (!Array.isArray(r?.tareas) || !Array.isArray(r?.cifras)) throw new Error('Respuesta incompleta');
      setHoy(r); setErrorHoy(null); setHoyCargadoEn(Date.now());
    } catch (e) {
      // Sin «Hoy» el resto del panel sigue sirviendo: el menú se queda sin
      // contadores y la portada dice qué ha pasado.
      setErrorHoy(e instanceof Error ? e.message : 'No se ha podido cargar.');
    } finally {
      pidiendoHoy.current = false;
    }
  }, []);

  const irAMfa = useCallback(() => {
    const volver = `${window.location.pathname}${window.location.search}`;
    router.replace(`/interno/mfa?volver=${encodeURIComponent(volver)}`);
  }, [router]);

  const cargar = useCallback(async () => {
    try {
      setSesion(await fetchSesionInterna());
      setCargando(false);
      void recargarHoy();
    } catch (e) {
      // Se queda en «Comprobando acceso…» mientras navega: pintar el error
      // diría «no eres del equipo» a quien sí lo es.
      if (e instanceof SinAcceso && e.tipo === 'mfa-requerido') { irAMfa(); return; }
      setError(e instanceof SinAcceso ? e.message : 'No se ha podido comprobar tu acceso.');
      setCargando(false);
    }
  }, [irAMfa, recargarHoy]);

  // setState tras await, no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!esPantallaMfa) void cargar(); }, [cargar, esPantallaMfa]);

  // Cualquier llamada de una pantalla (no solo la de sesión) puede toparse con
  // MFA_REQUERIDO si la exigencia se activa con la pestaña abierta.
  useEffect(() => {
    if (esPantallaMfa) return;
    window.addEventListener(EVENTO_MFA_REQUERIDO, irAMfa);
    return () => window.removeEventListener(EVENTO_MFA_REQUERIDO, irAMfa);
  }, [irAMfa, esPantallaMfa]);

  if (esPantallaMfa) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-[#14161c] text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
            <MarcaInterna />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 sm:px-6 py-5 sm:py-6">{children}</main>
      </div>
    );
  }

  if (cargando) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Comprobando acceso…</div>;
  }

  if (!sesion) {
    // Dos situaciones muy distintas que antes se contaban igual, y la segunda
    // dejaba sin salida: estar dentro con la cuenta equivocada. La identidad de
    // empresa y la de cliente son cuentas separadas a propósito, así que hay que
    // decir CON CUÁL estás y ofrecer el cambio.
    const conCuentaAjena = Boolean(user);
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-amber-500/10 text-warning grid place-items-center">
            <ShieldAlert size={20} />
          </span>
          <h1 className="text-[17px] font-bold text-foreground">Zona interna de Tentare</h1>
          {conCuentaAjena ? (
            <>
              <p className="text-[13.5px] text-muted-foreground">
                Has entrado como <strong className="text-foreground">{user?.email}</strong>, que no es una cuenta
                del equipo de Tentare. Entra con tu cuenta de empresa.
              </p>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => {
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga dura a propósito: al cambiar de cuenta no puede quedar en memoria nada de la anterior.
                    window.location.href = '/login?destino=/interno';
                  });
                }}
                className="mt-1 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
                Cambiar de cuenta
              </button>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-muted-foreground">{error}</p>
              <Link href="/login?destino=/interno" className="mt-1 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
                Iniciar sesión
              </Link>
            </>
          )}
          <Link href="/" className="text-[12.5px] font-semibold text-muted-foreground">Volver a Tentare</Link>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={sesion}>
      <HoyCtx.Provider value={{ hoy, error: errorHoy, cargadoEn: hoyCargadoEn, recargar: recargarHoy }}>
        <div className="min-h-screen bg-background lg:flex">
          <MenuLateral sesion={sesion} hoy={hoy} />
          <div className="min-w-0 flex-1">
            <BarraMovil sesion={sesion} hoy={hoy} />
            {/* Con el default fail-closed (SEC-2 paso 2), aal1 solo llega hasta
                aquí con INTERNO_EXIGIR_MFA=0 explícito (un entorno de
                desarrollo) — en producción, `comprobarAdminInterno` ya habría
                mandado a /interno/mfa antes de que este layout pintara nada. */}
            {sesion.nivel === 'aal1' && (
              <div className="bg-amber-500/10 border-b border-amber-500/20">
                <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-foreground">
                  <ShieldAlert size={14} className="text-warning shrink-0" />
                  <span>Esta sesión no ha pasado la verificación en dos pasos.</span>
                  <Link href={`/interno/mfa?volver=${encodeURIComponent(pathname)}`} className="font-bold underline">
                    Configurarla
                  </Link>
                </div>
              </div>
            )}
            <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-5 sm:py-6 lg:py-8">{children}</main>
          </div>
        </div>
      </HoyCtx.Provider>
    </Ctx.Provider>
  );
}
