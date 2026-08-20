'use client';

// Donde aterriza el enlace de "he olvidado mi contraseña" del equipo.
//
// Antes no existía. `resetPasswordForEmail` no se llamaba desde ningún sitio
// del código, así que la única forma de mandar ese enlace era el panel de
// Supabase — y el enlace dejaba a la persona en la RAÍZ del sitio, con el token
// ya gastado y sin ninguna pantalla donde escribir la contraseña nueva.
//
// La clienta sí lo tenía (`/portal/[slug]/clave-nueva`). La propietaria de un
// estudio, no: si olvidaba su contraseña se quedaba fuera de su propio negocio.
//
// Aquí NO se pide la contraseña actual. Quien llega ya ha demostrado que
// controla el correo, y pedírsela sería absurdo: no se la sabe, por eso está
// aquí.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authHeader } from '@/lib/api-client';

const MIN_LEN = 8;

export default function ClaveNueva() {
  const router = useRouter();
  const { session, loading, establecerPassword } = useAuth();
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  // El enlace trae la sesión en el fragmento (#access_token=…), y gotrue-js la
  // canjea solo. Hasta que eso termina no se sabe si hay sesión, así que no se
  // puede decidir nada mirando `session` en el primer render.
  const sinSesion = !loading && !session;

  // ⚠️ Antes mandaba SIEMPRE a /dashboard, sin mirar si la identidad tenía
  // estudio de verdad — exactamente el mismo bug que ya se documentó en
  // destino-post-login (docs/NETWORK-AUDIT-2.md §2), aquí sin arreglar: una
  // cuenta de Tentare Network que recuperase su contraseña aterrizaba en el
  // panel de gestión, vacío o ajeno. Recuperar la contraseña no es "entrar en"
  // ningún producto (no hay gate aquí, a diferencia de /login y
  // /network/acceso): se manda a donde esta identidad de verdad tiene algo.
  useEffect(() => {
    if (!hecho) return;
    const t = setTimeout(async () => {
      const destino = await fetch('/api/auth/destino-post-login', { headers: await authHeader() })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
      router.replace(destino?.destino ?? '/dashboard');
    }, 1800);
    return () => clearTimeout(t);
  }, [hecho, router]);

  async function guardar() {
    if (nueva.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setGuardando(true); setError(null);
    const r = await establecerPassword(nueva);
    setGuardando(false);
    if (r.error) { setError(r.error); return; }
    setHecho(true);
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center gap-3 text-center">
        <span className="w-11 h-11 rounded-full bg-brand/10 text-brand-medio grid place-items-center">
          <KeyRound size={20} />
        </span>
        <h1 className="text-[17px] font-bold text-foreground">Elige tu contraseña nueva</h1>

        {loading ? (
          <p className="text-[13.5px] text-muted-foreground">Comprobando el enlace…</p>
        ) : hecho ? (
          <p className="text-[13.5px] text-success">
            Contraseña actualizada. Te llevamos a tu panel…
          </p>
        ) : sinSesion ? (
          // El caso que más despista: el enlace es de un solo uso y caduca. Si
          // ya se gastó (o lo abrió antes el escáner del correo), aquí no hay
          // sesión — y hay que decirlo con la salida, no dejar un formulario
          // que va a fallar al pulsar Guardar.
          <>
            <p className="text-[13.5px] text-muted-foreground">
              Este enlace ya no vale: son de un solo uso y caducan. Pide otro y
              ábrelo en cuanto te llegue.
            </p>
            <Link
              href="/login"
              className="mt-1 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold"
            >
              Pedir otro enlace
            </Link>
          </>
        ) : (
          <>
            <p className="text-[13.5px] text-muted-foreground">
              Entrando como <strong className="text-foreground">{session?.user?.email}</strong>.
            </p>
            <div className="w-full flex flex-col gap-2 mt-1">
              <input
                type="password" autoComplete="new-password" placeholder="Contraseña nueva"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-foreground"
                value={nueva} onChange={e => setNueva(e.target.value)}
              />
              <input
                type="password" autoComplete="new-password" placeholder="Repite la contraseña"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-foreground"
                value={confirmar} onChange={e => setConfirmar(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void guardar(); }}
              />
            </div>
            {error && <p className="text-[12.5px] text-destructive">{error}</p>}
            <button
              type="button" disabled={guardando || !nueva || !confirmar}
              onClick={() => void guardar()}
              className="mt-1 w-full flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold disabled:opacity-40"
            >
              {guardando && <Loader2 className="size-3.5 animate-spin" />}
              Guardar contraseña
            </button>
          </>
        )}
      </div>
    </div>
  );
}
