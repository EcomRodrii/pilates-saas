'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { traducirAuth } from '@/lib/student/auth-errores';
import { mensajeSeguro } from '@/lib/errores';
import { useCodigoDelCorreo } from '@/lib/student/codigo-del-correo';
import { BotonApple } from '@/components/nativo/BotonApple';
import {
  CLAVE_ULTIMO_ESTUDIO, entradaDirecta, rutaDeEntrada, type EstudioDeLaCuenta,
} from '@/lib/app-nativa/mis-estudios';

/**
 * La entrada de la app «Tentare» del App Store (decisión del fundador, 2-oct-2026).
 *
 * Quien abre la app entra con su usuario de Tentare —el mismo de la app de su
 * estudio: la sesión es una sola en todo el dominio (`supabasePortal`)— y aterriza
 * en la app de SU estudio, con su marca. Si está en varios, elige; la próxima vez
 * entra directo al último. Quien todavía no tiene cuenta busca su estudio y se da
 * de alta allí, que es donde da su consentimiento.
 */

type Estudio = EstudioDeLaCuenta & { icono: string };
type Encontrado = { slug: string; nombre: string; ciudad: string | null; icono: string };
type Fase = 'cargando' | 'entrar' | 'enlace' | 'elegir' | 'sin-estudios' | 'error';

const leerUltimo = () => { try { return localStorage.getItem(CLAVE_ULTIMO_ESTUDIO); } catch { return null; } };
const guardarUltimo = (slug: string) => { try { localStorage.setItem(CLAVE_ULTIMO_ESTUDIO, slug); } catch { /* modo privado */ } };

export default function EntradaApp() {
  const r = useRouter();
  const [fase, setFase] = useState<Fase>('cargando');
  const [estudios, setEstudios] = useState<Estudio[]>([]);
  const [f, setF] = useState({ email: '', pass: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();

  const ir = useCallback((e: Pick<EstudioDeLaCuenta, 'slug' | 'como'>) => {
    guardarUltimo(e.slug);
    r.replace(rutaDeEntrada(e));
  }, [r]);

  const cargarEstudios = useCallback(async () => {
    setFase('cargando');
    try {
      const res = await fetch('/api/app/mis-estudios', { headers: await portalAuthHeader(), cache: 'no-store' });
      if (res.status === 401) { setFase('entrar'); return; }
      const datos = (await res.json().catch(() => null)) as { estudios?: Estudio[] } | null;
      if (!res.ok || !Array.isArray(datos?.estudios)) { setFase('error'); return; }
      const directo = entradaDirecta(datos.estudios, leerUltimo());
      if (directo) { ir(directo); return; }
      setEstudios(datos.estudios);
      setFase(datos.estudios.length ? 'elegir' : 'sin-estudios');
    } catch {
      setFase('error');
    }
  }, [ir]);

  // Con sesión (también la que llega del enlace del correo: `detectSessionInUrl`),
  // a sus estudios; sin ella, a entrar.
  useEffect(() => {
    let vivo = true;
    void supabasePortal.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session) void cargarEstudios();
      else setFase('entrar');
    });
    const { data: escucha } = supabasePortal.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'SIGNED_IN' && sesion && vivo) void cargarEstudios();
    });
    return () => { vivo = false; escucha.subscription.unsubscribe(); };
  }, [cargarEstudios]);

  const entrar = async () => {
    const e: Record<string, string> = {};
    if (!/.+@.+\..+/.test(f.email)) e.email = 'Escribe un email válido';
    if (!f.pass) e.pass = 'Escribe tu contraseña';
    setErr(e); setGlobal('');
    if (Object.keys(e).length) return;
    setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }
    const { error } = await supabasePortal.auth.signInWithPassword({
      email: f.email.trim(), password: f.pass, options: { captchaToken: token || undefined },
    });
    if (token) captchaGastado();
    setCargando(false);
    if (error) setGlobal(traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido entrar. Inténtalo de nuevo en unos segundos.'));
    // Con éxito, `onAuthStateChange` carga sus estudios.
  };

  const enviarEnlace = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    const token = await pedirToken();
    if (token === null) return { error: ERROR_CAPTCHA };
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: f.email.trim(),
      // Vuelve aquí: con la app instalada, el enlace universal la abre en la app.
      options: { emailRedirectTo: `${window.location.origin}/app`, captchaToken: token || undefined, shouldCreateUser: false },
    });
    if (token) captchaGastado();
    // Sin cuenta, no se crea una aquí (se crea en la app de su estudio, con su
    // consentimiento) y tampoco se dice: «ese email no existe» enseñaría quién tiene cuenta.
    if (error && /signups not allowed|otp.*disabled/i.test(error.message)) return { ok: true };
    return error ? { error: traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido enviar el enlace.') } : { ok: true };
  }, [f.email, pedirToken]);

  const pedirEnlace = async () => {
    if (!/.+@.+\..+/.test(f.email)) { setErr({ email: 'Escribe tu email y te mandamos el enlace' }); return; }
    setErr({}); setGlobal(''); setCargando(true);
    const res = await enviarEnlace();
    setCargando(false);
    if ('error' in res) { setGlobal(res.error); return; }
    setFase('enlace');
  };

  const codigo = useCodigoDelCorreo(f.email, enviarEnlace, () => void cargarEstudios());

  const salir = async () => {
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem(CLAVE_ULTIMO_ESTUDIO); } catch { /* modo privado */ }
    setEstudios([]);
    setFase('entrar');
  };

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', padding: 'calc(28px + var(--safe-top, 0px)) 22px calc(28px + var(--safe-bottom, 0px))' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 6px' }}>
          <LogoTentare alto={30} />
        </div>

        {fase === 'cargando' && <p className="t-meta" role="status" style={{ textAlign: 'center' }}>Un momento…</p>}

        {fase === 'error' && (
          <div role="alert" className="note note--danger">
            No hemos podido cargar tus estudios. Revisa la conexión.
            <div style={{ marginTop: 10 }}><Button full onClick={() => void cargarEstudios()}>Reintentar</Button></div>
          </div>
        )}

        {fase === 'entrar' && (
          <form onSubmit={(e) => { e.preventDefault(); void entrar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <div>
              <h1 className="t-h1">Entra con tu cuenta</h1>
              <p className="t-meta" style={{ marginTop: 4 }}>La misma con la que reservas en tu estudio.</p>
            </div>
            {global && <div role="alert" className="note note--danger" data-testid="error-acceso">{global}</div>}
            <Input label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
            <Input label="Contraseña" type="password" autoComplete="current-password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} error={err.pass} />
            <Button type="submit" full loading={cargando}>Entrar</Button>
            <button
              type="button" onClick={() => void pedirEnlace()} disabled={cargando}
              style={{ border: 'none', background: 'none', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', padding: '4px 0' }}
            >
              No tengo contraseña — mándame un enlace
            </button>
            {/* Solo en la app de iOS; con éxito, `onAuthStateChange` carga sus estudios. */}
            <BotonApple disabled={cargando} onEntrado={() => undefined} onError={setGlobal} />
            {captcha}
          </form>
        )}

        {fase === 'enlace' && (
          <form onSubmit={(e) => { e.preventDefault(); void codigo.verificar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <div>
              <h1 className="t-h1">Revisa tu correo</h1>
              <p className="t-meta" style={{ marginTop: 4 }}>
                Si <b>{f.email.trim()}</b> tiene cuenta, te hemos escrito. Abre el enlace en este teléfono, o escribe aquí el código si te ha llegado uno.
              </p>
            </div>
            <Input
              label="Código" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={codigo.codigo} onChange={(e) => codigo.escribir(e.target.value)} error={codigo.error}
            />
            <Button type="submit" full loading={codigo.verificando}>Entrar con el código</Button>
            <button
              type="button" onClick={() => void codigo.pedirOtro()} disabled={codigo.espera > 0}
              style={{ border: 'none', background: 'none', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', padding: '4px 0' }}
            >
              {codigo.reenviado && codigo.espera > 0 ? `Te hemos escrito otra vez. Otro en ${codigo.espera} s.` : 'No me ha llegado: volver a enviar'}
            </button>
            <button type="button" onClick={() => setFase('entrar')} className="btn btn--secondary">Volver</button>
            {captcha}
          </form>
        )}

        {fase === 'elegir' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h1 className="t-h1">¿A qué estudio vas?</h1>
              <p className="t-meta" style={{ marginTop: 4 }}>La próxima vez entrarás directo al último que elijas.</p>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {estudios.map((e) => (
                <li key={e.slug}>
                  <button type="button" onClick={() => ir(e)} className="card tap" data-estudio={e.slug}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta */}
                    <img src={e.icono} alt="" width={44} height={44} style={{ borderRadius: 12, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 800 }}>{e.nombre}</span>
                      <span className="t-meta">{e.como === 'instructora' ? 'Instructora' : e.como === 'las-dos' ? 'Alumna e instructora' : 'Alumna'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void salir()} className="btn btn--secondary">Salir</button>
          </section>
        )}

        {fase === 'sin-estudios' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="t-h1">Tu cuenta no está en ningún estudio</h1>
            <p className="t-meta">Busca el tuyo para apuntarte, o pide a tu estudio el enlace de su app.</p>
            <button type="button" onClick={() => void salir()} className="btn btn--secondary" style={{ marginTop: 6 }}>Entrar con otra cuenta</button>
          </section>
        )}

        {(fase === 'entrar' || fase === 'sin-estudios') && <BuscarEstudio conSesion={fase === 'sin-estudios'} />}
      </div>
    </main>
  );
}

/** «¿Primera vez?» → busca tu estudio y date de alta en SU app (ahí da su consentimiento). */
function BuscarEstudio({ conSesion }: { conSesion: boolean }) {
  const [q, setQ] = useState('');
  const [encontrados, setEncontrados] = useState<Encontrado[] | null>(null);
  // Un fallo al buscar no es «no hay ninguno»: se dice.
  const [fallo, setFallo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const turno = useRef(0);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 3) return;
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(`/api/public/app/estudios?q=${encodeURIComponent(texto)}`, { cache: 'no-store' });
        const datos = (await res.json().catch(() => null)) as { estudios?: Encontrado[] } | null;
        if (mio !== turno.current) return;
        const ok = res.ok && Array.isArray(datos?.estudios);
        setFallo(!ok);
        setEncontrados(ok ? datos!.estudios! : null);
      } catch {
        if (mio === turno.current) { setFallo(true); setEncontrados(null); }
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const corto = q.trim().length < 3;
  return (
    <section style={{ marginTop: 10, paddingTop: 18, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!conSesion && <h2 className="t-h2" style={{ margin: 0 }}>¿Primera vez? Busca tu estudio</h2>}
      <Input label="Nombre del estudio" type="search" value={q} onChange={(e) => setQ(e.target.value)} hint="Escribe al menos 3 letras." />
      {!corto && buscando && <p className="t-meta" role="status">Buscando…</p>}
      {!corto && !buscando && fallo && <p className="t-meta" role="alert">No hemos podido buscar. Revisa la conexión y vuelve a intentarlo.</p>}
      {!corto && !buscando && !fallo && encontrados?.length === 0 && <p className="t-meta">No encontramos ningún estudio con ese nombre.</p>}
      {!corto && encontrados && encontrados.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {encontrados.map((e) => (
            <li key={e.slug}>
              <a
                href={conSesion ? `/portal/${encodeURIComponent(e.slug)}` : `/portal/${encodeURIComponent(e.slug)}/acceso/registro`}
                className="tap" data-encontrado={e.slug}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 14, background: 'var(--card)', color: 'inherit', textDecoration: 'none' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta */}
                <img src={e.icono} alt="" width={36} height={36} style={{ borderRadius: 10, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800 }}>{e.nombre}</span>
                  {e.ciudad && <span className="t-meta">{e.ciudad}</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
