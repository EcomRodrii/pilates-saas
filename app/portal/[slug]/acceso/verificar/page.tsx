'use client';

import { Suspense, useEffect, useState } from 'react';
import { leerReferidor, olvidarReferidor } from '@/lib/student/referido-sesion';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useAuthStudent } from '@/lib/student/auth';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { debeElegirComoEntrar, eligioEntrarComoAlumna, useSesionInstructora } from '@/lib/student/sesion-instructora';
import { leerFirma, olvidarFirma } from '@/lib/student/consentimiento';
import { errorDeRetornoOAuth } from '@/lib/student/oauth-retorno';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { Sello } from '@/components/student/ui/Sello';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { useCodigoDelCorreo } from '@/lib/student/codigo-del-correo';

/**
 * DESIGN CONFLICT #2 — código por correo frente a enlace por correo.
 *
 *  · Pide el diseño: `app/(auth)/verificar-email/page.tsx`, casillas para un
 *    código y un botón «Confirmar».
 *  · Lo que manda gotrue depende del correo. El de ALTA (registro con
 *    contraseña, o «entrar con enlace» con un email que aún no tiene cuenta
 *    confirmada) trae SOLO un código de 6 cifras: la plantilla es común a todo
 *    el proyecto y el alta del equipo la pasó a código. El de entrar de una
 *    cuenta que ya existe, el de recuperar y el de Google vuelven con enlace.
 *  · Así que esta pantalla hace las dos cosas: sin sesión, pide el código
 *    (lib/student/codigo-del-correo.ts); con sesión —la abra el código o un
 *    enlace— elige contraseña si hace falta y firma el alta en el estudio.
 *
 * Es también la pantalla que cierra el callejón que dejó el borrado del portal:
 * `/reservar` enlazaba a `/portal/<slug>/login` y `/portal/<slug>/acceso` para
 * «crear tu contraseña», y las dos redirigían a la misma página de la que se
 * venía.
 */
function Verificar() {
  const sp = useSearchParams();
  const r = useRouter();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { fijarPassword, entrarConGoogle, reenviarCodigoAlta } = useAuthStudent(slug);
  const { socia, usuarioEmail, autenticado, isLoading, refrescar } = useSesionStudent(slug);
  // Una instructora del estudio NO se da de alta como alumna: entra a su parte
  // (la app es la misma para las dos, 14-sep-2026). `forzar`: quien aterriza
  // aquí viene de un enlace —invitación, recuperación, Google— y un «no es
  // instructora» recordado de antes no puede decidir por ella.
  const { instructora, isLoading: cargandoInstructora } = useSesionInstructora(slug, autenticado && !socia, true);

  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const [listo, setListo] = useState(false);

  const emailMostrado = usuarioEmail ?? sp.get('email') ?? 'tu email';

  // El correo de alta trae un CÓDIGO de 6 cifras, no un enlace (ver
  // lib/student/codigo-del-correo.ts). Con el código bueno se abre la sesión
  // aquí mismo y el efecto de aterrizaje de abajo hace el resto: firma el alta
  // y la deja dentro, igual que si hubiera abierto un enlace.
  const [emailCodigo, setEmailCodigo] = useState(() => sp.get('email') ?? '');
  const { widget: captcha, pedirToken } = useCaptcha();
  const codigoCorreo = useCodigoDelCorreo(emailCodigo, async () => {
    const token = await pedirToken();
    if (token === null) return { error: ERROR_CAPTCHA };
    return reenviarCodigoAlta(emailCodigo, token || undefined);
  });

  /**
   * A dónde iba antes de que le pidieran entrar, si venía de un enlace
   * profundo. Lo dejó `/acceso/login` antes de salir hacia Google.
   *
   * Se valida que sea una ruta de ESTE estudio, igual que hace login con su
   * `?next=`: sin esa comprobación, cualquiera que pueda escribir en el
   * `sessionStorage` de la pestaña convierte esta pantalla en un redirector
   * abierto.
   */
  const destinoTrasEntrar = () => {
    try {
      const n = sessionStorage.getItem(`st_next_${slug}`);
      sessionStorage.removeItem(`st_next_${slug}`);
      return n && n.startsWith(href() + '/') ? n : href();
    } catch {
      return href();
    }
  };

  // ⚠️ Se lee UNA vez, en el inicializador de estado, y no en cada render:
  // `errorDeRetornoOAuth` mira `window.location`, que cambia por debajo cuando
  // auth-js limpia la URL. Leerlo en render haría que el aviso desapareciera
  // solo, a mitad de leerlo.
  const [errorOAuth, setErrorOAuth] = useState(
    () => (typeof window === 'undefined' ? null : errorDeRetornoOAuth(window.location.href)),
  );
  // `?crear=1` lo pone el enlace de recuperación: quien viene de ahí SIEMPRE
  // tiene que elegir contraseña, aunque ya tuviera una.
  const forzarPassword = sp.get('crear') === '1';

  /**
   * Con sesión ya válida, crea la ficha de socia con la firma recogida en el
   * registro.
   *
   * ⚠️ TRAZA LEGAL. Sin firma no se crea la ficha: `socios.aceptacion_origen`
   * tiene un CHECK puesto citando el art. 7.1 del RGPD, y un alta sin
   * consentimiento persistido es justo lo que esa columna existe para impedir.
   * El `origen` NO se manda desde aquí — lo fija el servidor.
   */
  const firmarAlta = async () => {
    const firma = leerFirma(slug);
    if (!firma) return { ok: false as const, motivo: 'sin-firma' as const };

    const { data: { session } } = await supabasePortal.auth.getSession();
    if (!session?.access_token) return { ok: false as const, motivo: 'sin-sesion' as const };

    const res = await fetch('/api/public/socio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        accion: 'registrar',
        studioId: estudio.id,
        id: crypto.randomUUID(),
        nombre: firma.firma,
        telefono: firma.telefono ?? '',
        aceptacion: { fecha: firma.fecha, firma: firma.firma, versionTexto: firma.versionTexto },
        // Solo si marcó la casilla: no marcarla no retira nada.
        ...(firma.marketing === true ? { marketing: true } : {}),
        // ⚠️ Quien la invitó, si llegó por un enlace de invitación. El endpoint
        // aceptaba `referidoPor` desde siempre y esta pantalla no lo mandaba
        // NUNCA, así que la cadena entera de referidos —el crédito a quien
        // invita, el logro de amigas invitadas— no se disparaba jamás.
        //
        // El servidor lo comprueba contra la base (misma socia, mismo estudio)
        // y lo descarta en silencio si no cuadra: el alta nunca depende de que
        // el enlace estuviera bien.
        referidoPor: leerReferidor(slug),
        // Si el estudio la tiene como instructora, solo llega aquí habiendo
        // elegido «alumna» en `/acceso/elegir`; sin esto el servidor la para.
        eligioAlumna: eligioEntrarComoAlumna(slug, session.user.id),
      }),
    });
    if (!res.ok) {
      // Las dos negativas que tienen salida propia: es instructora (va a su
      // parte) o el estudio la tiene como instructora y aún no ha elegido.
      const cuerpo = await res.json().catch(() => null) as { code?: unknown } | null;
      if (cuerpo?.code === 'INVITACION_INSTRUCTORA') return { ok: false as const, motivo: 'invitacion-instructora' as const };
      if (cuerpo?.code === 'ES_INSTRUCTORA') return { ok: false as const, motivo: 'es-instructora' as const };
      return { ok: false as const, motivo: 'servidor' as const };
    }

    olvidarFirma(slug);
    // Igual que la firma: el trámite terminó. Dejarlo permitiría que un
    // segundo alta en la misma pestaña heredara una atribución que no es suya.
    olvidarReferidor(slug);
    invalidarCatalogo(slug);
    await refrescar();
    return { ok: true as const };
  };

  // Si el enlace ya dejó sesión Y la alumna ya es socia y no viene a cambiar
  // contraseña, no hay nada que hacer aquí: adentro.
  //
  // Esta pantalla es también donde ATERRIZA el retorno de Google, que es lo que
  // cierra el callejón: `signInWithOAuth` vuelve aquí y no a `/acceso/login`,
  // porque login no mira la sesión y dejaba a la alumna mirando el formulario
  // de entrada con la sesión ya guardada.
  useEffect(() => {
    if (isLoading || !autenticado || forzarPassword) return;
    if (socia) {
      // Ya es alumna, pero el estudio también la ha dado de alta como
      // instructora: se le pregunta por dónde entra. Una vez por inicio de
      // sesión; si elige «alumna», no se le vuelve a preguntar.
      void debeElegirComoEntrar(slug).then((elegir) => {
        r.replace(elegir ? href('/acceso/elegir') : destinoTrasEntrar());
      });
      return;
    }
    // Sin ficha de alumna: antes de intentar el alta, ¿es instructora del
    // estudio? Entonces no hay alta de alumna que firmar — va a su parte.
    if (cargandoInstructora) return;
    if (instructora) { r.replace(href('/equipo')); return; }
    void (async () => {
      // ⚠️ El estudio la tiene dada de alta como instructora y aún no ha entrado
      // como tal: NO se la da de alta como alumna sin preguntar (15-sep-2026:
      // aparecía como clienta en el panel). Elige ella.
      if (await debeElegirComoEntrar(slug)) { r.replace(href('/acceso/elegir')); return; }
      // Autenticada pero sin ficha en este estudio: se intenta firmar el alta.
      // Un fallo de red aquí no puede dejarla en «Entrando…» para siempre: se
      // trata como un alta rechazada, que sí tiene mensaje y salida.
      const res = await firmarAlta().catch(() => ({ ok: false as const, motivo: 'servidor' as const }));
      if (res.ok) { r.replace(destinoTrasEntrar()); return; }
      if (res.motivo === 'invitacion-instructora') { r.replace(href('/acceso/elegir')); return; }
      if (res.motivo === 'es-instructora') { r.replace(href('/equipo')); return; }
      // Sesión válida, sin ficha y sin firma: un alta a medias. Antes caía en
      // la pantalla de elegir contraseña, que no dice nada de lo que falta y
      // termina mandándola dentro sin ficha. Se le pide lo único que falta.
      if (res.motivo === 'sin-firma') { r.replace(`${href('/acceso/registro')}?firma=1`); return; }
      // ⚠️ Y si el servidor RECHAZA el alta, aquí no pasaba absolutamente
      // nada: ni redirección ni mensaje. La pantalla se quedaba en «Elige tu
      // contraseña», que a quien viene de Google no le dice nada.
      // El caso realista no es un 500 — es el 403 de `LIMITE_SOCIAS`: el
      // estudio ha llenado el cupo de socias de su plan. Con la vuelta de
      // Google esto es más fácil de alcanzar que antes, porque el abandono
      // ocurre DESPUÉS de que gotrue haya creado la sesión.
      setGlobal('No hemos podido darte de alta en este estudio. Habla con el estudio o inténtalo de nuevo en un rato.');
    })();
    // `firmarAlta` se recrea en cada render y meterlo en las dependencias
    // volvería a lanzarlo en bucle; lo que decide es el estado de sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, autenticado, socia, forzarPassword, instructora, cargandoInstructora]);

  const guardar = async () => {
    if (pass.length < 8) { setErr('Mínimo 8 caracteres'); return; }
    setErr(''); setGlobal(''); setCargando(true);

    const res = await fijarPassword(pass);
    if ('error' in res) { setCargando(false); setGlobal(res.error); return; }

    // Una instructora que llega por la invitación del estudio solo elige su
    // contraseña: no hay alta de alumna que firmar.
    if (instructora) {
      setCargando(false);
      setListo(true);
      setTimeout(() => r.replace(href('/equipo')), 900);
      return;
    }

    // Con contraseña puesta, se intenta también el alta si estaba pendiente.
    const alta = await firmarAlta();
    setCargando(false);

    // ⚠️ Aquí solo se contemplaba `'servidor'`, y los otros dos motivos caían
    // en el camino feliz: check verde, «Todo listo», y adentro SIN FICHA.
    // Alcanzable de verdad por el enlace de recuperación (`?crear=1`), que hace
    // que el efecto de aterrizaje salga temprano y la red de seguridad
    // «sin-firma → ?firma=1» no llegue a correr; y la firma vive en
    // `sessionStorage`, que en la pestaña que abre el correo nunca existe.
    // En producción hay 3 personas con identidad de Google y sin ficha.
    if (!alta.ok) {
      if (alta.motivo === 'invitacion-instructora') { r.replace(href('/acceso/elegir')); return; }
      if (alta.motivo === 'es-instructora') { r.replace(href('/equipo')); return; }
      if (alta.motivo === 'sin-firma') {
        // Le falta el consentimiento, y eso tiene pantalla: se la damos en vez
        // de dejarla dentro a medias.
        r.replace(`${href('/acceso/registro')}?firma=1`);
        return;
      }
      setGlobal(alta.motivo === 'sin-sesion'
        ? 'Tu contraseña se ha guardado, pero tu sesión ha caducado. Vuelve a entrar.'
        : 'Tu contraseña se ha guardado, pero no hemos podido completar el alta. Inténtalo de nuevo.');
      return;
    }
    setListo(true);
    setTimeout(() => r.replace(destinoTrasEntrar()), 900);
  };

  // Sin sesión, y la URL dice que la vuelta de Google se torció: cancelada,
  // caída o rechazada. Antes caía en «Verifica tu email», que describe un
  // trámite que nadie había empezado — ver `lib/student/oauth-retorno.ts`.
  if (!isLoading && !autenticado && errorOAuth) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 className="t-h1">No has entrado</h2>
          <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
            {errorOAuth.mensaje}
          </p>
        </div>
        {errorOAuth.reintentable && (
          <Button
            full
            data-testid="reintentar-google"
            onClick={() => {
              // Se limpia el aviso ANTES de salir: si gotrue vuelve a fallar,
              // el mensaje que se pinte será el nuevo y no el de hace un rato.
              setErrorOAuth(null);
              void entrarConGoogle();
            }}
          >
            Volver a intentarlo con Google
          </Button>
        )}
        <Button variant="secondary" full onClick={() => r.push(href('/acceso/login'))}>
          Entrar con mi email
        </Button>
      </div>
    );
  }

  // Sin sesión: todavía no ha puesto el código del correo (o no ha abierto el
  // enlace, si lo que le llegó fue un enlace).
  if (!isLoading && !autenticado) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); void codigoCorreo.verificar(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        noValidate
      >
        <div>
          <h2 className="t-h1">Revisa tu correo</h2>
          <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
            Te hemos enviado un código de 6 cifras a <b>{emailMostrado}</b>. Escríbelo aquí para activar tu cuenta.
          </p>
        </div>

        {/* Sin email en la dirección no hay a quién comprobar el código. */}
        {!sp.get('email') && (
          <Input
            label="Email" type="email" autoComplete="email" inputMode="email"
            value={emailCodigo} onChange={(e) => setEmailCodigo(e.target.value)}
          />
        )}
        <Input
          label="Código" data-testid="codigo-correo"
          inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={12}
          value={codigoCorreo.codigo} onChange={(e) => codigoCorreo.escribir(e.target.value)}
          error={codigoCorreo.error || undefined}
          hint="Caduca a los 10 minutos. Mira también en spam o promociones."
        />
        <Button type="submit" full loading={codigoCorreo.verificando}>Activar mi cuenta</Button>

        <p className="t-meta" style={{ textAlign: 'center', lineHeight: 1.5 }}>
          {codigoCorreo.reenviado && codigoCorreo.espera > 0
            ? <>Te hemos enviado otro código. Podrás pedir uno más en {codigoCorreo.espera} s.</>
            : (
              <button
                type="button" onClick={() => void codigoCorreo.pedirOtro()} disabled={codigoCorreo.espera > 0 || !emailCodigo.trim()}
                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 800, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                No me ha llegado: enviar otro código
              </button>
            )}
        </p>
        <Button type="button" variant="secondary" full onClick={() => r.push(href('/acceso/login'))}>Volver a acceso</Button>
        {captcha}
      </form>
    );
  }

  if (listo) {
    return (
      <div className="a-pop" style={{ textAlign: 'center' }}>
        <Sello />
        <h2 className="t-h1" style={{ marginTop: 16 }}>Todo listo</h2>
        <p className="t-meta" style={{ marginTop: 6 }}>Te llevamos a tu estudio…</p>
      </div>
    );
  }

  // Con sesión y sin `?crear=1`, el efecto de aterrizaje de arriba decide solo
  // a dónde va (dentro, a elegir, a su parte de instructora o a terminar el
  // alta), y tarda lo que tardan sus consultas: 2-3 s tras poner el código.
  // Antes, ese rato se pintaba «Elige tu contraseña» a quien acababa de crear
  // la cuenta CON contraseña, y la hacía dudar de si la había puesto. Ese
  // formulario queda para quien viene a elegirla (`?crear=1`) y como salida si
  // el alta falla (`global`). Lo mismo mientras aún no se sabe si hay sesión.
  if (isLoading || (autenticado && !forzarPassword && !global)) {
    return (
      <div className="a-pop" role="status" aria-busy style={{ textAlign: 'center', padding: '24px 0' }}>
        <h2 className="t-h1">{autenticado ? `Entrando en ${estudio.nombre}…` : 'Un momento…'}</h2>
        {autenticado && <p className="t-meta" style={{ marginTop: 6 }}>Estamos preparando tu cuenta.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void guardar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }} noValidate>
      <div>
        <h2 className="t-h1">Elige tu contraseña</h2>
        <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
          Ya has verificado <b>{emailMostrado}</b>. Con una contraseña entras sin esperar al correo.
        </p>
      </div>

      {global && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
          {global}
        </p>
      )}

      <Input
        label="Contraseña" type="password" autoComplete="new-password"
        value={pass} onChange={(e) => setPass(e.target.value)} error={err}
        hint="Al menos 8 caracteres."
      />
      <Button type="submit" full loading={cargando}>Guardar y entrar</Button>
    </form>
  );
}

export default function Page() {
  // `useSearchParams` exige Suspense en App Router.
  return <Suspense fallback={null}><Verificar /></Suspense>;
}
