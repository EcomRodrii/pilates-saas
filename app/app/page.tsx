'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { SegundoPaso } from '@/components/student/acceso/SegundoPaso';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { portalAuthHeader } from '@/lib/student/api-publica';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CODIGO_SEGUNDO_PASO } from '@/lib/auth/doble-factor-reglas';
import { traducirAuth } from '@/lib/student/auth-errores';
import { mensajeSeguro } from '@/lib/errores';
import { useCodigoDelCorreo } from '@/lib/student/codigo-del-correo';
import { navegoDesdeFueraHaceNada } from '@/lib/nativo/navegacion-desde-fuera';
import { BotonApple } from '@/components/nativo/BotonApple';
import { BotonGoogle } from '@/components/nativo/BotonGoogle';
import {
  CLAVE_ULTIMO_ESTUDIO, conElUltimoPrimero, entradaDirecta, rutaDeEntrada, type EstudioDeLaCuenta,
} from '@/lib/app-nativa/mis-estudios';

/**
 * La entrada de la app «Tentare» del App Store (decisión del fundador, 2-oct-2026;
 * rediseño del 4-oct tras comparar bsport, TIMP, Momence y Mindbody).
 *
 * Se entra con el EMAIL y un código de 6 cifras (o con Apple o Google): entrar y darse de alta es el mismo
 * paso (si el email no tiene cuenta, el código la crea) y no hay contraseña que
 * olvidar —la queja que más se repite en las cuatro—. Quien tiene contraseña la
 * sigue usando con «Usar mi contraseña». La sesión es una sola en todo el dominio
 * (`supabasePortal`) y no caduca mientras se use.
 *
 * Con sesión, a sus estudios: los de sus fichas Y los que la tienen dada de alta con
 * ese email sin haber entrado nunca. Uno, directa; varios, elige (el último, arriba).
 * El consentimiento de cada estudio se da DENTRO del estudio, como siempre.
 *
 * Parámetros: `?elegir=1` enseña la lista sin entrar directa (Perfil → «Cambiar de
 * estudio»); `?estudio=<slug>` lleva a ese estudio al entrar (la ficha del estudio),
 * y si aún no la tiene, a darse de alta en él.
 */

type Estudio = EstudioDeLaCuenta & { icono: string };
type Encontrado = { slug: string; nombre: string; ciudad: string | null; icono: string };
type Fase = 'cargando' | 'puerta' | 'codigo' | 'contrasena' | 'dos-pasos' | 'elegir' | 'sin-estudios' | 'buscar' | 'error';

const leerUltimo = () => { try { return localStorage.getItem(CLAVE_ULTIMO_ESTUDIO); } catch { return null; } };
const guardarUltimo = (slug: string) => { try { localStorage.setItem(CLAVE_ULTIMO_ESTUDIO, slug); } catch { /* modo privado */ } };
const SLUG = /^[a-z0-9-]{1,80}$/;
const emailValido = (e: string) => /.+@.+\..+/.test(e.trim());

const enlace = {
  border: 'none', background: 'none', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', padding: '6px 0',
} as const;

function Atras({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} style={{ ...enlace, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>
      <Icono nombre="chevron-izquierda" tamano={16} /> {children}
    </button>
  );
}

export default function EntradaApp() {
  const r = useRouter();
  const [fase, setFase] = useState<Fase>('cargando');
  // A dónde vuelve «Volver» desde el buscador.
  const [antesDeBuscar, setAntesDeBuscar] = useState<Fase>('puerta');
  const [estudios, setEstudios] = useState<Estudio[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();
  // Se leen una vez: vienen en la URL con la que se abre la entrada.
  const parametros = useRef<{ elegir: boolean; estudio: string | null } | null>(null);
  const param = () => {
    if (!parametros.current) {
      const sp = new URLSearchParams(window.location.search);
      const estudio = sp.get('estudio');
      parametros.current = { elegir: sp.get('elegir') === '1', estudio: estudio && SLUG.test(estudio) ? estudio : null };
    }
    return parametros.current;
  };

  const trasSegundoPaso = useRef(false);
  // Si la pantalla ya no está (un aviso o un enlace se llevó a la alumna a otra
  // parte mientras se cargaban sus estudios), no se navega: el router es global
  // y un `replace` tardío pisaría ese destino.
  const montada = useRef(true);
  useEffect(() => { montada.current = true; return () => { montada.current = false; }; }, []);

  const ir = useCallback((e: Pick<EstudioDeLaCuenta, 'slug' | 'como'>) => {
    guardarUltimo(e.slug);
    // Ni si un aviso o un enlace acaba de llevarla a otra parte (arranque en frío).
    if (!montada.current || navegoDesdeFueraHaceNada()) return;
    r.replace(rutaDeEntrada(e));
  }, [r]);

  const cargarEstudios = useCallback(async () => {
    setFase('cargando');
    try {
      const res = await fetch('/api/app/mis-estudios', { headers: await portalAuthHeader(), cache: 'no-store' });
      if (res.status === 401) { setFase('puerta'); return; }
      const datos = (await res.json().catch(() => null)) as { estudios?: Estudio[]; nombre?: string | null; error?: string } | null;
      if (res.status === 403 && datos?.error === CODIGO_SEGUNDO_PASO) {
        // Si la pantalla del código acaba de decir «no hace falta» y el servidor
        // sigue pidiéndolo, otra vuelta sería un bucle: mejor decirlo.
        if (trasSegundoPaso.current) { trasSegundoPaso.current = false; setFase('error'); return; }
        setFase('dos-pasos'); return;
      }
      trasSegundoPaso.current = false;
      if (!res.ok || !Array.isArray(datos?.estudios)) { setFase('error'); return; }
      const { elegir, estudio } = param();
      if (estudio) {
        const suyo = datos.estudios.find((e) => e.slug === estudio);
        // Aún no es suya: a darse de alta en él, con la cuenta que ya tiene.
        if (suyo) ir(suyo);
        else if (montada.current && !navegoDesdeFueraHaceNada()) r.replace(`/portal/${encodeURIComponent(estudio)}/acceso/registro`);
        return;
      }
      const directo = elegir ? null : entradaDirecta(datos.estudios, leerUltimo());
      if (directo) { ir(directo); return; }
      setNombre(datos.nombre ?? null);
      setEstudios(conElUltimoPrimero(datos.estudios, leerUltimo()));
      setFase(datos.estudios.length ? 'elegir' : 'sin-estudios');
    } catch {
      setFase('error');
    }
  }, [ir, r]);

  // Con sesión (también la que llega del enlace del correo: `detectSessionInUrl`),
  // a sus estudios; sin ella, a la puerta.
  useEffect(() => {
    let vivo = true;
    void supabasePortal.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session) void cargarEstudios();
      else setFase('puerta');
    });
    const { data: escucha } = supabasePortal.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'SIGNED_IN' && sesion && vivo) void cargarEstudios();
    });
    return () => { vivo = false; escucha.subscription.unsubscribe(); };
  }, [cargarEstudios]);

  /** Manda el código. Si el email no tiene cuenta, gotrue la crea y el correo trae el mismo código. */
  const enviarCodigo = useCallback(async (): Promise<{ ok: true } | { error: string }> => {
    const token = await pedirToken();
    if (token === null) return { error: ERROR_CAPTCHA };
    const { estudio } = param();
    const { error } = await supabasePortal.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Vuelve aquí: con la app instalada, el enlace universal la abre en la app.
        emailRedirectTo: `${window.location.origin}/app${estudio ? `?estudio=${estudio}` : ''}`,
        captchaToken: token || undefined,
        shouldCreateUser: true,
      },
    });
    if (token) captchaGastado();
    return error ? { error: traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No hemos podido mandarte el código. Inténtalo de nuevo.') } : { ok: true };
  }, [email, pedirToken]);

  const codigo = useCodigoDelCorreo(email, enviarCodigo, () => void cargarEstudios());

  const continuar = async () => {
    if (!emailValido(email)) { setErrEmail('Escribe un email válido'); return; }
    setErrEmail(''); setGlobal(''); setCargando(true);
    const res = await enviarCodigo();
    setCargando(false);
    if ('error' in res) { setGlobal(res.error); return; }
    setFase('codigo');
  };

  const entrarConContrasena = async () => {
    if (!emailValido(email)) { setErrEmail('Escribe un email válido'); return; }
    if (!pass) { setGlobal('Escribe tu contraseña'); return; }
    setErrEmail(''); setGlobal(''); setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }
    const { error } = await supabasePortal.auth.signInWithPassword({
      email: email.trim(), password: pass, options: { captchaToken: token || undefined },
    });
    if (token) captchaGastado();
    setCargando(false);
    if (error) setGlobal(traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No se ha podido entrar. Inténtalo de nuevo en unos segundos.'));
    // Con éxito, `onAuthStateChange` carga sus estudios.
  };

  const salir = async () => {
    await supabasePortal.auth.signOut();
    try { localStorage.removeItem(CLAVE_ULTIMO_ESTUDIO); } catch { /* modo privado */ }
    setEstudios([]); setNombre(null); setPass(''); setGlobal('');
    setFase('puerta');
  };

  const abrirBuscador = () => { setAntesDeBuscar(fase); setFase('buscar'); };

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)', padding: 'calc(28px + var(--safe-top, 0px)) 22px calc(28px + var(--safe-bottom, 0px))' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(fase === 'cargando' || fase === 'puerta' || fase === 'elegir' || fase === 'sin-estudios' || fase === 'error') && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: fase === 'puerta' ? '18px 0 14px' : '4px 0' }}>
            <LogoTentare alto={fase === 'puerta' ? 30 : 24} />
          </div>
        )}

        {fase === 'cargando' && <p className="t-meta" role="status" style={{ textAlign: 'center' }}>Un momento…</p>}

        {fase === 'error' && (
          <div role="alert" className="note note--danger">
            No hemos podido cargar tus estudios. Revisa la conexión.
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button full onClick={() => void cargarEstudios()}>Reintentar</Button>
              <Button full variant="secondary" onClick={() => void salir()}>Entrar con otra cuenta</Button>
            </div>
          </div>
        )}

        {fase === 'puerta' && (
          <form onSubmit={(e) => { e.preventDefault(); void continuar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <div>
              <h1 className="t-h1">Reserva en tu estudio</h1>
              <p className="t-meta" style={{ marginTop: 4 }}>Escribe tu email. Si ya vas a un estudio con Tentare, te reconocemos.</p>
            </div>
            {global && <div role="alert" className="note note--danger" data-testid="error-acceso">{global}</div>}
            <Input
              label="Email" type="email" autoComplete="username email" inputMode="email" autoCapitalize="none"
              value={email} onChange={(e) => setEmail(e.target.value)} error={errEmail}
            />
            <Button type="submit" full loading={cargando}>Continuar</Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted-foreground)', fontSize: 'var(--t-meta)' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />o<span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            {/* Apple solo en la app de iOS. Con éxito, `onAuthStateChange` carga sus estudios. */}
            <BotonApple disabled={cargando} onEntrado={() => undefined} onError={setGlobal} />
            <BotonGoogle disabled={cargando} onEntrado={() => undefined} onError={setGlobal} />
            {captcha}
            <div style={{ marginTop: 6, padding: 14, borderRadius: 16, background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 800, margin: 0 }}>¿Tu estudio te ha pasado un enlace o un QR?</p>
              <p className="t-meta" style={{ margin: '4px 0 0' }}>Ábrelo en este móvil y entrarás directa en su app.</p>
            </div>
            <button type="button" onClick={abrirBuscador} style={{ ...enlace, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icono nombre="buscar" tamano={16} /> Buscar mi estudio
            </button>
            <p className="t-meta" style={{ textAlign: 'center', margin: 0 }}>
              ¿No puedes entrar? <Link href="/soporte" style={{ color: 'var(--accent)', fontWeight: 800 }}>Te ayudamos</Link>
            </p>
          </form>
        )}

        {fase === 'codigo' && (
          <form onSubmit={(e) => { e.preventDefault(); void codigo.verificar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <Atras onClick={() => setFase('puerta')}>Cambiar email</Atras>
            <div>
              <h1 className="t-h1">Mira tu correo</h1>
              <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
                Te hemos mandado un código a <b style={{ overflowWrap: 'anywhere' }}>{email.trim()}</b>. Escríbelo aquí, o abre en este móvil el enlace del correo si te llega uno.
              </p>
            </div>
            <Input
              label="Código de 6 cifras" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
              value={codigo.codigo} onChange={(e) => codigo.escribir(e.target.value)} error={codigo.error}
              style={{ letterSpacing: '.4em', fontSize: 22, fontWeight: 800, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
            />
            <Button type="submit" full loading={codigo.verificando}>Entrar</Button>
            <button type="button" onClick={() => void codigo.pedirOtro()} disabled={codigo.espera > 0} style={{ ...enlace, color: codigo.espera > 0 ? 'var(--muted-foreground)' : 'var(--accent)' }}>
              {codigo.espera > 0 ? `${codigo.reenviado ? 'Te lo hemos vuelto a mandar. ' : ''}Otro en ${codigo.espera} s` : 'No me ha llegado: volver a enviar'}
            </button>
            <button type="button" onClick={() => { setGlobal(''); setFase('contrasena'); }} style={{ ...enlace, color: 'var(--muted-foreground)' }}>
              Usar mi contraseña
            </button>
            {captcha}
          </form>
        )}

        {fase === 'contrasena' && (
          <form onSubmit={(e) => { e.preventDefault(); void entrarConContrasena(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
            <Atras onClick={() => { setGlobal(''); setFase('puerta'); }}>Volver</Atras>
            <h1 className="t-h1">Entra con tu contraseña</h1>
            {global && <div role="alert" className="note note--danger" data-testid="error-acceso">{global}</div>}
            <Input
              label="Email" type="email" autoComplete="username email" inputMode="email" autoCapitalize="none"
              value={email} onChange={(e) => setEmail(e.target.value)} error={errEmail}
            />
            <Input label="Contraseña" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <Button type="submit" full loading={cargando}>Entrar</Button>
            <button type="button" onClick={() => void continuar()} disabled={cargando} style={enlace}>
              ¿No la recuerdas? Entra con un código
            </button>
            {captcha}
          </form>
        )}

        {fase === 'dos-pasos' && (
          <SegundoPaso
            slug={null}
            nombreEstudio={null}
            alTerminar={() => { trasSegundoPaso.current = true; void cargarEstudios(); }}
            alSalir={salir}
            entrarHref="/app"
          />
        )}

        {fase === 'elegir' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <h1 className="t-h1">{nombre ? `Hola, ${nombre}` : 'Tus estudios'}</h1>
              <p className="t-meta" style={{ marginTop: 4 }}>{estudios.length > 1 ? 'Estos estudios ya te tienen. ¿A cuál entras?' : 'Este estudio ya te tiene.'}</p>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {estudios.map((e, i) => {
                const ultimo = i === 0 && leerUltimo() === e.slug;
                return (
                  <li key={e.slug}>
                    <button type="button" onClick={() => ir(e)} className="card tap" data-estudio={e.slug}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'left', border: `1.5px solid ${ultimo ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 18, background: 'var(--card)', color: 'inherit' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta */}
                      <img src={e.icono} alt="" width={48} height={48} style={{ borderRadius: 13, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 800 }}>{e.nombre}</span>
                        {e.ciudad && <span className="t-meta" style={{ display: 'block' }}>{e.ciudad}</span>}
                        <span className="t-meta" style={{ display: 'block', fontSize: 12 }}>
                          {e.como === 'instructora' ? 'Instructora' : e.como === 'las-dos' ? 'Alumna e instructora' : 'Alumna'}
                          {ultimo ? ' · la última que abriste' : ''}
                        </span>
                      </span>
                      <Icono nombre="chevron-derecha" tamano={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={abrirBuscador} style={{ ...enlace, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icono nombre="mas" tamano={16} /> Añadir otro estudio
            </button>
            <button type="button" onClick={() => void salir()} className="btn btn--secondary" style={{ marginTop: 4 }}>Salir</button>
          </section>
        )}

        {fase === 'sin-estudios' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h1 className="t-h1">{nombre ? `Hola, ${nombre}` : 'Aún no tienes estudio'}</h1>
            <p className="t-meta" style={{ margin: 0 }}>Busca el tuyo para apuntarte, o abre en este móvil el enlace que te haya pasado tu estudio.</p>
            <BuscarEstudio />
            <div style={{ marginTop: 8, padding: 14, borderRadius: 16, background: 'var(--muted)' }}>
              <p style={{ fontWeight: 800, margin: 0 }}>¿Tu estudio te tiene con otro email?</p>
              <p className="t-meta" style={{ margin: '4px 0 10px' }}>Entra con ese y te aparecerá.</p>
              <button type="button" onClick={() => void salir()} className="btn btn--secondary btn--full">Entrar con otro email</button>
            </div>
          </section>
        )}

        {fase === 'buscar' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Atras onClick={() => setFase(antesDeBuscar)}>Volver</Atras>
            <h1 className="t-h1">Busca tu estudio</h1>
            <BuscarEstudio autoFocus />
          </section>
        )}
      </div>
    </main>
  );
}

/** El buscador: por nombre, sin tildes ni mayúsculas. Cada resultado abre la ficha del estudio. */
function BuscarEstudio({ autoFocus = false }: { autoFocus?: boolean }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Input
        label="Nombre del estudio" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus}
        hint="Escribe al menos 3 letras. Da igual las tildes o las mayúsculas."
      />
      {!corto && buscando && <p className="t-meta" role="status">Buscando…</p>}
      {!corto && !buscando && fallo && <p className="t-meta" role="alert">No hemos podido buscar. Revisa la conexión y vuelve a intentarlo.</p>}
      {!corto && !buscando && !fallo && encontrados?.length === 0 && (
        <div style={{ padding: 14, borderRadius: 16, background: 'var(--muted)' }}>
          <p style={{ fontWeight: 800, margin: 0 }}>No sale ningún estudio con ese nombre</p>
          <p className="t-meta" style={{ margin: '4px 0 0' }}>Puede que tu estudio todavía no use Tentare. Pídele el enlace de su app.</p>
        </div>
      )}
      {!corto && encontrados && encontrados.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {encontrados.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/app/estudio/${encodeURIComponent(e.slug)}`}
                className="tap" data-encontrado={e.slug}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--card)', color: 'inherit', textDecoration: 'none' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta */}
                <img src={e.icono} alt="" width={42} height={42} style={{ borderRadius: 11, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 800 }}>{e.nombre}</span>
                  {e.ciudad && <span className="t-meta">{e.ciudad}</span>}
                </span>
                <Icono nombre="chevron-derecha" tamano={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
