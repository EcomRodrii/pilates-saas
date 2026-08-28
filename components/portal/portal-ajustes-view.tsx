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
//    pinta /preferencias, extraído para no duplicar su lógica de carga.
//  - `caducaAntesDe`/`nombreDeMarca` (lib/billing/caducidad-tarjeta.ts) —
//    los mismos cálculos que ya usa el dunning por goteo, no un `LEAST/
//    GREATEST` inventado (ver nota "porcentaje sin respaldo" del repo).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { usePortalAuth } from '@/lib/portal-auth';
import { Input, Button, Card, Badge, BottomSheet, Toast, type AvisoToast } from '@/components/portal/ui';
import { AvisosSocia } from '@/components/portal/portal-avisos-socia';
import { caducaAntesDe, nombreDeMarca } from '@/lib/billing/caducidad-tarjeta';
import { display, micro, sans, texto, radio, transicion, dur, EASE } from '@/lib/portal-design';
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

export function PortalAjustesView({
  session, navegar,
}: {
  session: PortalSession | null;
  navegar: (ruta: string) => void;
}) {
  const { studio, socios, updateSocio } = useStudio();
  const { establecerPassword } = usePortalAuth();
  const { t, noche } = useModo();

  const { slug } = useParams<{ slug: string }>();
  const socio = socios.find(s => s.id === session?.socioId);

  const [hoja, setHoja] = useState<null | 'datos' | 'clave'>(null);
  const [form, setForm] = useState({
    nombre: socio?.nombre ?? '',
    apellidos: socio?.apellidos ?? '',
    email: socio?.email ?? '',
    telefono: socio?.telefono ?? '',
    usuario: socio?.usuario ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [clave, setClave] = useState({ nueva: '', repetir: '' });
  const [errorClave, setErrorClave] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [aviso, setAviso] = useState<AvisoToast | null>(null);

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

  async function guardarDatos(e?: React.FormEvent) {
    e?.preventDefault();
    if (!socio || guardando) return;
    setGuardando(true);
    setAviso(null);
    const r = await updateSocio(socio.id, {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim() || null,
      usuario: form.usuario.trim() || null,
    });
    setGuardando(false);
    if (!r.ok) { setAviso({ texto: r.error, error: true }); return; }
    setHoja(null);
    setAviso({ texto: 'Datos guardados.', error: false });
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

  const fila = (titulo: string, valor: string | null, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 60, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
        borderTop: `1px solid ${t.line}`,
        transition: `padding-left ${dur.control}ms ${EASE}`,
      }}
    >
      <span style={{ ...display(20), color: t.ink }}>{titulo}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {valor && <span style={{ fontFamily: sans, fontSize: 11.5, color: t.muted }}>{valor}</span>}
        <span style={{ fontFamily: sans, fontSize: 13, color: t.heroAccent }}>→</span>
      </span>
    </button>
  );

  return (
    <div style={{ minHeight: '100%', background: t.bg, color: t.ink }}>
      <div style={{ padding: '62px 24px 24px' }}>
        <Link
          href={`/portal/${slug}/perfil`}
          aria-label="Volver a Perfil"
          style={{
            width: 38, height: 38, borderRadius: '50%', border: `1px solid ${t.line}`,
            background: noche ? 'rgba(36,40,32,.7)' : 'rgba(255,255,255,.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: sans, fontSize: 13, color: t.ink, cursor: 'pointer',
            transition: transicion(['background'], dur.color),
          }}
        >
          ←
        </Link>

        <h1 style={{ ...display(50), color: t.ink, marginTop: 20 }}>Ajustes</h1>
        <p style={{ ...display(19, true), color: t.muted, marginTop: 10 }}>Tu cuenta, en un solo sitio.</p>

        {/* ── Perfil ───────────────────────────────────────────────────────── */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 36 }}>Perfil</div>
        <Card style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
          {fila('Mis datos', `${socio.nombre} ${socio.apellidos}`.trim(), () => setHoja('datos'))}
          {fila('Usuario', socio.usuario ? `@${socio.usuario}` : 'Sin definir', () => setHoja('datos'))}
          {fila('Contraseña', null, () => setHoja('clave'))}
        </Card>

        {/* ── Notificaciones ───────────────────────────────────────────────── */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 36 }}>Notificaciones</div>
        <div style={{ marginTop: 12 }}>
          {studio?.id && <AvisosSocia t={t} studioId={studio.id} />}
        </div>

        {/* ── Pago ─────────────────────────────────────────────────────────── */}
        <div style={{ ...micro(9.5, 0.24), color: t.micro, marginTop: 36 }}>Pago</div>
        <div style={{
          marginTop: 12, borderRadius: radio.card, background: t.surface, padding: '20px 24px',
          boxShadow: '0 14px 32px -26px rgba(34,42,30,.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...display(21), color: t.ink }}>
                {tarjeta ? `${tarjeta.marca} ···· ${tarjeta.ultimos4}` : 'Sin tarjeta guardada'}
              </div>
              {tarjeta && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {/* "Principal": es la única tarjeta que guarda una socia hoy
                      (un `stripe_payment_method_id` por ficha) — no hay varias
                      entre las que elegir, así que el badge nunca es dudoso. */}
                  <Badge variant="neutral">Principal</Badge>
                  {tarjeta.caducada
                    ? <Badge variant="danger">Caducada</Badge>
                    : tarjeta.caducaPronto
                      ? <Badge variant="warning">Caduca pronto</Badge>
                      : <Badge variant="success">Activa</Badge>}
                </div>
              )}
              <div style={{ fontFamily: sans, fontSize: 11, color: t.muted, marginTop: 10, textWrap: 'pretty' } as React.CSSProperties}>
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
              fontFamily: sans, fontSize: 12, fontWeight: 700, color: t.heroAccent, cursor: 'pointer',
            }}
          >
            Ver compras y facturas →
          </button>
        </div>

        {/* Marca blanca: el pie es del estudio, no nuestro. */}
        <div style={{ ...micro(9, 0.34), color: t.micro, textAlign: 'center', marginTop: 40 }}>
          {studio?.nombre ?? ''}
        </div>
      </div>

      {/* ── Hoja: mis datos ────────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'datos'} onClose={() => setHoja(null)}>
        <h2 style={{ ...display(26), color: t.ink, marginBottom: 18 }}>Mis datos</h2>
        <form onSubmit={guardarDatos} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nombre" placeholder="Nombre" autoComplete="given-name" value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
          <Input label="Apellidos" placeholder="Apellidos" autoComplete="family-name" value={form.apellidos}
            onChange={e => setForm(f => ({ ...f, apellidos: e.target.value }))} />
          <Input label="Email" placeholder="Email" type="email" autoComplete="email" value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="Teléfono" placeholder="+34 600 000 000" type="tel" autoComplete="tel" inputMode="tel" value={form.telefono}
            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
          {/* @handle — solo el campo (decisión de producto ya tomada, migr
              20260828005124): sin página pública que lo resuelva todavía. */}
          <Input label="Usuario" placeholder="usuario" autoComplete="off" value={form.usuario}
            onChange={e => setForm(f => ({ ...f, usuario: limpiarUsuario(e.target.value) }))} />
          <p style={{ ...micro(9, 0.18, 500), color: t.muted, marginTop: -6, paddingLeft: 4, textTransform: 'none', letterSpacing: 0 }}>
            Minúsculas, números y guion bajo. 3-24 caracteres.
          </p>
          <Button type="submit" disabled={guardando} style={{ width: '100%', marginTop: 6 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </BottomSheet>

      {/* ── Hoja: contraseña ───────────────────────────────────────────────── */}
      <BottomSheet open={hoja === 'clave'} onClose={() => setHoja(null)}>
        <h2 style={{ ...display(26), color: t.ink, marginBottom: 18 }}>Cambiar contraseña</h2>
        <form onSubmit={guardarClave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="Nueva contraseña" type="password" autoComplete="new-password" value={clave.nueva}
            onChange={e => { setClave(c => ({ ...c, nueva: e.target.value })); setErrorClave(''); }} />
          <Input label="Repite la contraseña" type="password" autoComplete="new-password" value={clave.repetir}
            onChange={e => { setClave(c => ({ ...c, repetir: e.target.value })); setErrorClave(''); }} />
          {errorClave && (
            <p role="alert" style={{ fontFamily: sans, fontSize: 12, color: '#B85436' }}>{errorClave}</p>
          )}
          <p style={{ ...texto.nota, color: t.micro }}>Mínimo {MIN_LEN} caracteres.</p>
          <Button type="submit" disabled={guardandoClave} style={{ width: '100%', marginTop: 6 }}>
            {guardandoClave ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </BottomSheet>

      <Toast aviso={aviso} onDismiss={() => setAviso(null)} />
    </div>
  );
}
