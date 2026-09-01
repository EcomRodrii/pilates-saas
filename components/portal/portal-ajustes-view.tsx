'use client';

// AJUSTES — pantalla unificada del portal (Claude Design, "Tentare Studio
// App" → sección "AJUSTES"). Reúne en una sola pantalla lo que antes vivía
// repartido en tres rutas (`/perfil` → "Mis datos"/"Métodos de pago"/
// "Avisos", `/preferencias`, `/compras`): datos personales + @handle,
// contraseña, notificaciones y el resumen de la tarjeta guardada.
//
// Las tres rutas de origen SIGUEN existiendo tal cual (con sus propios e2e:
// portal-mis-datos.spec.ts, portal-perfil-v2.spec.ts) — esto no las
// sustituye, las junta en un solo sitio para quien prefiere un único mando
// de ajustes. `/compras` sigue siendo el destino para el catálogo de
// bonos/planes, SEPA y el historial de facturas: aquí solo se resume el
// método de pago con datos reales.
//
// Reutiliza SIEMPRE piezas y flujos ya existentes, nunca reescritos:
//  - `updateSocio()` (studio-context) — el mismo mutador que usa Perfil.
//  - `establecerPassword()` (portal-auth) — el mismo que fija la contraseña
//    tras el magic link en /clave-nueva; aquí se reutiliza sobre una sesión
//    YA autenticada (la socia ya demostró quién es al entrar).
//  - `<AvisosSocia>` (portal-avisos-socia.tsx) — el mismo componente que
//    pinta /preferencias, extraído para no duplicar su lógica de carga. Pinta
//    DOS chips (App/Push) por categoría a propósito, no un interruptor único
//    — decisión ya documentada en ese fichero, no se reabre aquí.
//  - `caducaAntesDe`/`nombreDeMarca` (lib/billing/caducidad-tarjeta.ts) —
//    los mismos cálculos que ya usa el dunning por goteo, no un `LEAST/
//    GREATEST` inventado (ver nota "porcentaje sin respaldo" del repo).
//
// ── Estilos: sistema literal `.ap-*` (Tentare Studio App), no tokens ───────
// Igual que portal-clases-view.tsx: valores hex/px literales de
// `app/portal/[slug]/portal-app.css`, no `useModo()`/`portal-design.ts`. La
// única excepción es `<AvisosSocia t={...}>`, que exige un `ModoTokens`
// completo por su firma — se le pasa un objeto CONSTANTE con los mismos
// valores literales `--ap-*` (ver `AP_TOKENS`, abajo) en vez de tocar ese
// componente compartido (fuera de alcance: lo usan otras pantallas).
// `Input`/`Button`/`BottomSheet`/`Toast`/`AvatarPicker` siguen siendo los de
// `components/portal/ui` — se auto-tematizan con su propio `useModo()`
// interno; no es este fichero quien decide su color.

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePortalAuth } from '@/lib/portal-auth';
import { Input, Button, BottomSheet, Toast, type AvisoToast } from '@/components/portal/ui';
import { ProfileAvatar, AvatarPicker } from '@/components/ui/profile-avatar';
import { subirFotoPerfil, eliminarFotoPerfil, validarFotoPerfil } from '@/lib/portal-storage';
import { AvisosSocia } from '@/components/portal/portal-avisos-socia';
import { caducaAntesDe, nombreDeMarca } from '@/lib/billing/caducidad-tarjeta';
import { sans, transicion, dur } from '@/lib/portal-design';
import type { ModoTokens } from '@/lib/portal-modo';
import type { PortalSession } from '@/lib/portal-auth';

const MIN_LEN = 8;
// Mismo formato que el CHECK de la BD (`socios_usuario_formato`,
// 20260828005124): minúsculas, dígitos y guion bajo, 3-24 caracteres. Vive
// aquí SOLO para limpiar lo que la socia teclea mientras escribe — la
// validación real, la que de verdad puede rechazar, es siempre la del
// servidor (ver `actualizarSociaPublica`).
function limpiarUsuario(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

// `ModoTokens` literal para `<AvisosSocia>`, con los mismos valores que
// `portal-app.css` (`--ap-*`) — así ese componente compartido pinta con la
// paleta literal de esta pantalla sin que este fichero toque su código.
const AP_TOKENS: ModoTokens = {
  bg: '#FAF9F5', surface: '#FFFFFF', surface2: '#EFEDE4', line: '#E5E3DA',
  ink: '#1A1A1A', muted: '#5A5A52', muted2: '#5A5A52', micro: '#98A093',
  accentInk: '#FFFFFF', tabbar: 'rgba(250,249,245,.72)', bar: '#EFEDE4',
  hero: '#FAF9F5', heroLine: '#E5E3DA', heroText: '#1A1A1A', heroSub: '#5A5A52', heroAccent: '#3E6B4A',
  velo: 'rgba(255,255,255,.55)', veloFuerte: 'rgba(255,255,255,.7)', veloSuave: 'rgba(255,255,255,.5)',
};

export function PortalAjustesView({
  session, navegar,
}: {
  session: PortalSession | null;
  navegar: (ruta: string) => void;
}) {
  const { studio, socios, updateSocio } = useStudio();
  const { establecerPassword, actualizarEmail } = usePortalAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { slug } = useParams<{ slug: string }>();
  const socio = socios.find(s => s.id === session?.socioId);

  // "Mis datos" (apellidos/teléfono/fecha/dirección) SIGUE en Perfil, sin
  // tocar — ver cabecera del fichero. Aquí, verificado contra capturas
  // reales, solo van nombre y usuario, INLINE en la página (nunca dentro de
  // una hoja): son los dos únicos campos que el diseño real pone en "Datos y
  // ajustes" bajo el avatar.
  const [hoja, setHoja] = useState<null | 'email' | 'clave' | 'foto'>(null);
  const [form, setForm] = useState({
    nombre: socio?.nombre ?? '',
    usuario: socio?.usuario ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // Solo cambia lo que de verdad cambió — "TU NOMBRE"/"USUARIO" son dos
  // campos independientes en el diseño, no un formulario con un único botón
  // "Guardar" al final.
  const nombreSucio = form.nombre.trim() !== (socio?.nombre ?? '') && form.nombre.trim() !== '';
  const usuarioSucio = form.usuario.trim() !== (socio?.usuario ?? '');
  // Cambio de email de ACCESO — verificado en vivo contra el diseño real
  // ("Cambiar email" es un flujo propio, no un campo dentro de "Mis
  // datos"). Antes "Mis datos" escribía `socios.email` sin verificar nada:
  // el mismo campo que `fetchPublicStudioData` compara contra el email del
  // JWT como prueba de identidad — un typo ahí bloqueaba a la socia de sus
  // propios datos en silencio (ver memoria del repo sobre socia.dev).
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [cambiandoEmail, setCambiandoEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ error: boolean; texto: string } | null>(null);
  const [clave, setClave] = useState({ nueva: '', repetir: '' });
  const [errorClave, setErrorClave] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);
  // I-13 (auditoría 29-ago): guarda al vuelo, no dentro del formulario de
  // "Mis datos" — es un interruptor, no un campo que se edita y se confirma.
  // `updateSocio` ya es optimista con reversión en fallo (I-10, mismo
  // patrón que los toggles de AvisosSocia).
  const [guardandoVisible, setGuardandoVisible] = useState(false);

  // Sin `tarjetaUltimos4` no hay tarjeta que enseñar — `null` en
  // `tarjeta_exp_*` significa "todavía no se le ha preguntado a Stripe", NO
  // "no caduca" (mismo criterio que /compras). Hook SIEMPRE antes del
  // `return null` de abajo — nunca condicionado a que haya socia, mismo
  // motivo que ya siguen los `useMemo` de PortalPerfilView.
  const tarjeta = useMemo(() => {
    const ultimos4 = socio?.tarjetaUltimos4 ?? '';
    if (!ultimos4) return null;
    const mes = socio?.tarjetaExpMes ?? null;
    const anio = socio?.tarjetaExpAnio ?? null;
    const ahora = new Date();
    const en30dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      marca: nombreDeMarca(socio?.tarjetaMarca),
      ultimos4,
      caduca: mes && anio ? `${String(mes).padStart(2, '0')}/${String(anio).slice(-2)}` : '',
      caducada: caducaAntesDe({ expMes: mes, expAnio: anio }, ahora),
      caducaPronto: !caducaAntesDe({ expMes: mes, expAnio: anio }, ahora) && caducaAntesDe({ expMes: mes, expAnio: anio }, en30dias),
    };
  }, [socio?.tarjetaUltimos4, socio?.tarjetaMarca, socio?.tarjetaExpMes, socio?.tarjetaExpAnio]);

  // Igual que en Perfil: sin socia cargada no hay NINGÚN formulario que
  // pueda pisar datos reales (mismo motivo que ya cubre
  // portal-mis-datos.spec.ts sobre PortalPerfilView).
  if (!socio || !session) return null;

  async function guardarDatos() {
    if (!socio || guardando || (!nombreSucio && !usuarioSucio)) return;
    setGuardando(true);
    setAviso(null);
    // SIN `email`: el servidor lo rechaza a propósito (CAMPOS_SOCIA_EDITABLES
    // en lib/db/supabase-data-admin.ts — cambiarlo aquí desincronizaría
    // `socios.email` del email de login y auto-bloquearía a la socia). El
    // email tiene su propio flujo, "Cambiar email", más abajo.
    const r = await updateSocio(socio.id, {
      nombre: form.nombre.trim(),
      usuario: form.usuario.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
    setAviso({ texto: 'Datos guardados.', error: false });
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !socio) return;
    const invalido = validarFotoPerfil(file);
    if (invalido) { setAviso({ texto: invalido, error: true }); return; }
    setAviso(null);
    setSubiendoFoto(true);
    const result = await subirFotoPerfil(socio.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso({ texto: result.error, error: true }); return; }
    void updateSocio(socio.id, { fotoUrl: result.url });
    setHoja(null);
  }

  async function quitarFoto() {
    if (!socio) return;
    setSubiendoFoto(true);
    const result = await eliminarFotoPerfil(socio.id);
    setSubiendoFoto(false);
    if ('error' in result) { setAviso({ texto: result.error, error: true }); return; }
    void updateSocio(socio.id, { fotoUrl: null });
    setHoja(null);
  }

  function elegirAvatar(id: string | null) {
    void updateSocio(socio!.id, { avatar: id });
    setHoja(null);
  }

  async function cambiarEmail(e?: React.FormEvent) {
    e?.preventDefault();
    if (!nuevoEmail.trim() || cambiandoEmail) return;
    setCambiandoEmail(true);
    setEmailMsg(null);
    const r = await actualizarEmail(nuevoEmail.trim());
    setCambiandoEmail(false);
    if ('error' in r) { setEmailMsg({ error: true, texto: r.error }); return; }
    setEmailMsg({
      error: false,
      // Enlace, no código: es lo que de verdad manda Supabase por defecto
      // al cambiar el email — decir "código" sería prometer algo que este
      // proyecto no envía.
      texto: r.pendiente
        ? 'Te hemos mandado un enlace de confirmación al email nuevo. El cambio se aplica cuando lo abras.'
        : 'Email actualizado.',
    });
    setNuevoEmail('');
  }

  async function guardarClave(e?: React.FormEvent) {
    e?.preventDefault();
    setErrorClave('');
    if (clave.nueva.length < MIN_LEN) { setErrorClave(`Mínimo ${MIN_LEN} caracteres.`); return; }
    if (clave.nueva !== clave.repetir) { setErrorClave('Las dos no coinciden.'); return; }
    setGuardandoClave(true);
    const r = await establecerPassword(clave.nueva);
    setGuardandoClave(false);
    if ('error' in r) { setErrorClave(r.error); return; }
    setClave({ nueva: '', repetir: '' });
    setHoja(null);
    setAviso({ texto: 'Contraseña actualizada.', error: false });
  }

  // Fila de "Cuenta y seguridad" — literal, mismo patrón que las filas de
  // clase en portal-clases-view.tsx (borde 1px #E5E3DA, chevron en verde de
  // marca `--ap-verde`). "Contraseña" pasa un `valor` de puntos: antes no
  // enseñaba nada, y la captura real muestra el campo enmascarado junto al
  // chevron, no una fila muda — cambio de texto, cero lógica nueva.
  const fila = (titulo: string, valor: string | null, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 60, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
        borderTop: '1px solid #E5E3DA',
        transition: transicion(['padding-left'], dur.control),
      }}
    >
      <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: '#1A1A1A' }}>{titulo}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {valor && <span style={{ fontFamily: sans, fontSize: 11.5, color: '#5A5A52' }}>{valor}</span>}
        <span style={{ fontFamily: sans, fontSize: 16, color: '#3E6B4A' }}>›</span>
      </span>
    </button>
  );

  return (
    <div style={{ minHeight: '100%', background: '#FAF9F5', color: '#1A1A1A' }}>
      <div style={{ padding: '62px 24px 24px' }}>
        <Link
          href={`/portal/${slug}/perfil`}
          aria-label="Volver a Perfil"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: '1px solid #E5E3DA',
            background: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: sans, fontSize: 13, color: '#1A1A1A', cursor: 'pointer',
            transition: transicion(['background'], dur.color),
          }}
        >
          ←
        </Link>

        {/* "Datos y ajustes", no "Ajustes" — verificado contra capturas
            reales. El diseño no lleva subtítulo. */}
        <h1 className="ap-h1" style={{ color: '#1A1A1A', marginTop: 20 }}>Datos y ajustes</h1>

        {/* ── Avatar + nombre + "Cambiar foto" ─────────────────────────────────
            Mismo flujo de subida/avatar-picker que ya usa Perfil
            (subirFotoPerfil/eliminarFotoPerfil/AvatarPicker) — no se
            reimplementa, se repite el pintado porque el diseño lo pone
            también aquí. La chapa con el lápiz sobre el avatar es solo un
            segundo disparador visual del MISMO `setHoja('foto')` que ya
            abría el enlace de texto de debajo — verificado contra la
            captura real, que la pinta sobre la foto, no solo como texto. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28 }}>
          <button
            type="button"
            onClick={() => setHoja('foto')}
            aria-label="Cambiar tu foto"
            style={{ position: 'relative', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block', flexShrink: 0 }}
          >
            <ProfileAvatar avatarId={socio.avatar} fotoUrl={socio.fotoUrl} nombre={socio.nombre} apellidos={socio.apellidos} size="lg" />
            <span
              aria-hidden
              style={{
                position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: '50%',
                background: '#1A1A1A', border: '2px solid #FAF9F5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Pencil size={11} color="#F1ECE1" strokeWidth={2.5} />
            </span>
          </button>
          <div>
            <div className="ap-h2" style={{ color: '#1A1A1A' }}>{socio.nombre}</div>
            <button
              type="button"
              onClick={() => setHoja('foto')}
              style={{ background: 'none', border: 'none', padding: 0, marginTop: 2, fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: '#3E6B4A', cursor: 'pointer' }}
            >
              Cambiar foto
            </button>
          </div>
        </div>

        {/* ── Nombre / Usuario — INLINE, no en una hoja ────────────────────── */}
        <div style={{ marginTop: 28 }}>
          <label className="ap-label" style={{ display: 'block', marginBottom: 8 }}>Tu nombre</label>
          <Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" autoComplete="given-name" />
          <p className="ap-meta" style={{ marginTop: 6 }}>Se actualiza en toda la app al guardar.</p>
        </div>
        <div style={{ marginTop: 20 }}>
          <label className="ap-label" style={{ display: 'block', marginBottom: 8 }}>Usuario</label>
          <Input
            value={form.usuario ? `@${form.usuario}` : ''}
            onChange={e => setForm(f => ({ ...f, usuario: limpiarUsuario(e.target.value.replace(/^@/, '')) }))}
            placeholder="@usuario" autoComplete="off"
          />
          <p className="ap-meta" style={{ marginTop: 6 }}>
            {form.usuario ? `Tu enlace: tentare.app/u/${form.usuario}` : 'Minúsculas, números y guion bajo. 3-24 caracteres.'}
          </p>
        </div>
        {(nombreSucio || usuarioSucio) && (
          <button
            type="button"
            onClick={() => void guardarDatos()}
            disabled={guardando}
            className="ap-btn ap-btn--primario"
            style={{ width: '100%', marginTop: 14, opacity: guardando ? 0.7 : 1 }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}

        {/* ── Cuenta y seguridad ────────────────────────────────────────────── */}
        <div className="ap-label" style={{ marginTop: 32 }}>Cuenta y seguridad</div>
        <div className="ap-card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
          {fila('Email', socio.email || null, () => setHoja('email'))}
          {fila('Contraseña', '••••••••', () => setHoja('clave'))}
        </div>

        {/* ── Privacidad ───────────────────────────────────────────────────── */}
        <div className="ap-label" style={{ marginTop: 36 }}>Privacidad</div>
        <div className="ap-card" style={{
          marginTop: 12, padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: sans, fontSize: 14.5, fontWeight: 700, color: '#1A1A1A' }}>Mostrar mi nombre en clase</div>
            <div style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 4, textWrap: 'pretty' } as React.CSSProperties}>
              Otras alumnas verán tu nombre de pila en &quot;quién más va&quot; a una clase.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!!socio.visibleEnClase}
            disabled={guardandoVisible}
            onClick={async () => {
              setGuardandoVisible(true);
              const r = await updateSocio(socio.id, { visibleEnClase: !socio.visibleEnClase });
              setGuardandoVisible(false);
              if (!r.ok) setAviso({ texto: r.error, error: true });
            }}
            style={{
              width: 46, height: 27, borderRadius: 999, border: 'none', flexShrink: 0,
              padding: 3, display: 'flex', justifyContent: socio.visibleEnClase ? 'flex-end' : 'flex-start',
              background: socio.visibleEnClase ? '#4F8A5B' : '#E5E3DA',
              opacity: guardandoVisible ? 0.6 : 1,
              cursor: guardandoVisible ? 'default' : 'pointer',
              transition: transicion(['background', 'opacity'], dur.color),
            }}
          >
            <span style={{ width: 21, height: 21, borderRadius: '50%', background: '#fff', display: 'block' }} />
          </button>
        </div>

        {/* ── Notificaciones ───────────────────────────────────────────────── */}
        <div className="ap-label" style={{ marginTop: 36 }}>Notificaciones</div>
        <div style={{ marginTop: 12 }}>
          {studio?.id && <AvisosSocia t={AP_TOKENS} studioId={studio.id} />}
        </div>

        {/* ── Métodos de pago ──────────────────────────────────────────────── */}
        <div className="ap-label" style={{ marginTop: 36 }}>Métodos de pago</div>
        <div className="ap-card" style={{ marginTop: 12, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 800, color: '#1A1A1A' }}>
                {tarjeta ? `${tarjeta.marca} ···· ${tarjeta.ultimos4}` : 'Sin tarjeta guardada'}
              </div>
              {tarjeta && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {/* "Principal": es la única tarjeta que guarda una socia hoy
                      (un `stripe_payment_method_id` por ficha) — no hay varias
                      entre las que elegir, así que el badge nunca es dudoso.
                      Sin variante "neutral" en el catálogo `.ap-badge--*`
                      (ok/pocas/llena/res son todos semánticos de aforo): pill
                      neutra en línea con los mismos literales `--ap-pill`/
                      `--ap-sec` de portal-app.css. */}
                  <span className="ap-badge" style={{ background: '#EFEDE4', color: '#5A5A52' }}>Principal</span>
                  {tarjeta.caducada
                    ? <span className="ap-badge ap-badge--llena">Caducada</span>
                    : tarjeta.caducaPronto
                      ? <span className="ap-badge ap-badge--pocas">Caduca pronto</span>
                      : <span className="ap-badge ap-badge--ok">Activa</span>}
                </div>
              )}
              <div style={{ fontFamily: sans, fontSize: 11, color: '#5A5A52', marginTop: 10, textWrap: 'pretty' } as React.CSSProperties}>
                {tarjeta
                  ? (tarjeta.caduca ? `Caduca ${tarjeta.caduca}` : 'Se usa para tus bonos, cuotas y renovaciones.')
                  : 'Añádela desde Compras para pagar sin hacerlo a mano cada vez.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navegar(`/portal/${slug}/compras`)}
            style={{
              marginTop: 16, background: 'none', border: 'none', padding: 0,
              fontFamily: sans, fontSize: 12, fontWeight: 700, color: '#3E6B4A', cursor: 'pointer',
            }}
          >
            Ver compras y facturas →
          </button>
        </div>

        {/* Marca blanca: el pie es del estudio, no nuestro. */}
        <div style={{ fontFamily: sans, fontSize: 9, letterSpacing: '.34em', textTransform: 'uppercase', color: '#98A093', textAlign: 'center', marginTop: 40 } as React.CSSProperties}>
          {studio?.nombre ?? ''}
        </div>
      </div>

      {/* ── Hoja: foto ─────────────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'foto'} onClose={() => setHoja(null)}>
        <h2 style={{ fontFamily: sans, fontSize: 20, fontWeight: 800, color: '#1A1A1A', marginBottom: 18 }}>Tu foto</h2>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={subirFoto} style={{ display: 'none' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button onClick={() => fileInputRef.current?.click()} disabled={subiendoFoto} style={{ width: '100%' }}>
            {subiendoFoto ? 'Subiendo…' : 'Subir una foto'}
          </Button>
          {socio.fotoUrl && (
            <Button variant="secondary" onClick={() => void quitarFoto()} disabled={subiendoFoto} style={{ width: '100%' }}>
              Quitar la foto
            </Button>
          )}
          <div className="ap-label" style={{ marginTop: 14 }}>O elige un avatar</div>
          <AvatarPicker value={socio.avatar ?? null} onChange={elegirAvatar} />
        </div>
      </BottomSheet>

      {/* ── Hoja: cambiar email ───────────────────────────────────────────────
          Verificado en vivo contra el diseño real: flujo propio, no un
          campo dentro de "Mis datos". Cambia el email de ACCESO
          (auth.updateUser), no `socios.email` directamente — ver comentario
          de `actualizarEmail` en lib/portal-auth.tsx. */}
      <BottomSheet open={hoja === 'email'} onClose={() => { setHoja(null); setEmailMsg(null); setNuevoEmail(''); }}>
        <h2 style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, color: '#1A1A1A', marginBottom: 18 }}>Cambiar email</h2>
        <p style={{ fontFamily: sans, fontSize: 11.5, color: '#5A5A52', marginBottom: 18 }}>
          Ahora: {socio.email || 'sin email'}. Te mandamos un enlace al nuevo para confirmarlo.
        </p>
        <form onSubmit={cambiarEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nuevo email" placeholder="tu@email.com" type="email" autoComplete="email" value={nuevoEmail}
            onChange={e => { setNuevoEmail(e.target.value); setEmailMsg(null); }} />
          {emailMsg && (
            <p role={emailMsg.error ? 'alert' : undefined} style={{ fontFamily: sans, fontSize: 11, color: emailMsg.error ? '#C2503A' : '#5A5A52' }}>
              {emailMsg.texto}
            </p>
          )}
          <Button type="submit" disabled={cambiandoEmail || !nuevoEmail.trim()} style={{ width: '100%', marginTop: 6 }}>
            {cambiandoEmail ? 'Enviando…' : 'Enviarme el enlace'}
          </Button>
        </form>
      </BottomSheet>

      {/* ── Hoja: contraseña ───────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'clave'} onClose={() => setHoja(null)}>
        <h2 style={{ fontFamily: sans, fontSize: 22, fontWeight: 800, color: '#1A1A1A', marginBottom: 18 }}>Cambiar contraseña</h2>
        <form onSubmit={guardarClave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nueva contraseña" type="password" autoComplete="new-password" value={clave.nueva}
            onChange={e => { setClave(c => ({ ...c, nueva: e.target.value })); setErrorClave(''); }} />
          <Input label="Repite la contraseña" type="password" autoComplete="new-password" value={clave.repetir}
            onChange={e => { setClave(c => ({ ...c, repetir: e.target.value })); setErrorClave(''); }} />
          {errorClave && (
            <p role="alert" style={{ fontFamily: sans, fontSize: 12, color: '#C2503A' }}>{errorClave}</p>
          )}
          <p style={{ fontFamily: sans, fontSize: 11, color: '#98A093' }}>Mínimo {MIN_LEN} caracteres.</p>
          {/* Cierto de verdad, no solo un aviso: establecerPassword cierra
              las demás sesiones al confirmar (ver lib/portal-auth.tsx). */}
          <p style={{ fontFamily: sans, fontSize: 11, color: '#98A093' }}>Cerraremos tu sesión en otros dispositivos.</p>
          <Button type="submit" disabled={guardandoClave} style={{ width: '100%', marginTop: 6 }}>
            {guardandoClave ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </BottomSheet>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
