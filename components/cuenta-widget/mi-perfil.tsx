'use client';

// Fase 4 (Booking Engine — Mi Cuenta): perfil básico, compartido entre Modo
// A/B. Nombre/apellidos/email en solo lectura aquí (no hay formulario para
// ellos en este componente, ver docs/account-widget-diseno.md §0/§6) — pero
// eso ya no es porque `actualizarSociaPublica` los excluya a todos: nombre y
// apellidos SÍ se guardan si se envían, solo el email se rechaza (identidad
// de sesión pública, ver su comentario). Este formulario solo edita
// teléfono/dirección.
//
// F5 del rediseño de /reservar (29-sep-2026): el «Perfil» de la app de la
// alumna, adaptado. Arriba la tarjeta de quién es (iniciales, nombre, email);
// debajo los grupos con su rótulo en versales —«Tus datos», «Sesión»— en
// tarjetas de filas, en vez de un formulario suelto. Guardar y cerrar sesión
// hacen exactamente lo de antes.
//
// ⚠️ Solo estilos EN LÍNEA: esto también lo compila esbuild para el widget
// nativo, que no tiene Tailwind.
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import type { ModoTokens } from '@/lib/portal-modo';
import type { Socio } from '@/lib/types';
import type { ResultadoEscritura } from '@/lib/errores';
// Auditoría 2026-09-22 (F-6/E-22): antes venía de `@/lib/csv`, que exige
// EXACTAMENTE 9 dígitos españoles porque su trabajo es normalizar un importador
// de CSV. Aplicada a un dato de contacto que la socia teclea, bloqueaba a
// cualquiera con un móvil extranjero. La de `lib/reservar/formato.ts` es la que
// razona este caso («un formato demasiado estricto rechazaría números correctos
// de otros países sin aportar nada») y es la que usa /reservar.
import { telefonoValido } from '@/lib/reservar/formato';
import { iniciales } from '@/lib/mensajeria/presentacion';
import { pesoTitular, sans, serif, textoSemantico } from '@/lib/reservar-publico-tokens';

/** El rótulo en versales de cada grupo (`.t-label` de la app). */
const rotulo = (t: ModoTokens): React.CSSProperties => ({
  margin: '0 0 8px', paddingLeft: 2, fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.1em',
  textTransform: 'uppercase', color: t.muted,
});

/** Una tarjeta de filas (la `.card` de los grupos de la app). */
const grupo = (t: ModoTokens): React.CSSProperties => ({
  background: t.surface, border: `1px solid ${t.line}`, borderRadius: 'var(--reservar-radio-tarjeta, 20px)', overflow: 'hidden',
});

type Campo = 'telefono' | 'direccion';

export function MiPerfil({
  t, socio, onActualizarPerfil, onLogout,
}: {
  t: ModoTokens;
  socio: Socio;
  onActualizarPerfil: (cambios: Record<string, unknown>) => ResultadoEscritura | void | Promise<ResultadoEscritura | void>;
  onLogout: () => void;
}) {
  const [telefono, setTelefono] = useState(socio.telefono ?? '');
  const [direccion, setDireccion] = useState(socio.direccion ?? '');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  // La fila con el foco se marca entera: el campo va sin borde dentro de su
  // fila, y un `:focus-within` no se puede escribir en línea.
  const [enfocado, setEnfocado] = useState<Campo | null>(null);

  const hayCambios = telefono !== (socio.telefono ?? '') || direccion !== (socio.direccion ?? '');

  async function guardar() {
    if (guardando) return;
    if (telefono && !telefonoValido(telefono)) {
      setMensaje({ tipo: 'error', texto: 'Revisa el teléfono.' });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const r = await onActualizarPerfil({ telefono: telefono || null, direccion: direccion || null });
    setGuardando(false);
    if (r && !r.ok) { setMensaje({ tipo: 'error', texto: r.error }); return; }
    setMensaje({ tipo: 'ok', texto: 'Guardado.' });
  }

  const nombre = [socio.nombre, socio.apellidos].filter(Boolean).join(' ');
  // Los colores de estado, medidos contra lo que tienen detrás (antes `#B45309`
  // y `#047857` fijos: en Carbón no llegaban a AA): «Cerrar sesión», contra su
  // tarjeta; el aviso de guardado, contra el fondo de la página. Rojo para el
  // error, que es lo que es, y no el ámbar de antes.
  const rojo = textoSemantico('danger', t);
  const colorMensaje = textoSemantico(mensaje?.tipo === 'error' ? 'danger' : 'success', t, t.bg);
  const desactivado = !hayCambios || guardando;

  const fila = (campo: Campo, etiqueta: string, tipo: 'tel' | 'text', valor: string, cambiar: (v: string) => void, autoComplete: string) => (
    <div style={{
      padding: '10px 16px 12px',
      // La marca como texto (legible sobre la tarjeta) para el anillo: una
      // marca pastel no se vería.
      boxShadow: enfocado === campo ? 'inset 0 0 0 2px var(--portal-brand-texto, var(--portal-brand))' : 'none',
      borderRadius: 'inherit', transition: 'box-shadow .15s ease',
    }}>
      <label htmlFor={`cuenta-widget-${campo}`} style={{
        display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: t.muted,
      }}>
        {etiqueta}
      </label>
      <input
        id={`cuenta-widget-${campo}`}
        type={tipo}
        value={valor}
        autoComplete={autoComplete}
        inputMode={tipo === 'tel' ? 'tel' : undefined}
        onChange={e => cambiar(e.target.value)}
        onFocus={() => setEnfocado(campo)}
        onBlur={() => setEnfocado(c => (c === campo ? null : c))}
        style={{
          display: 'block', width: '100%', marginTop: 4, padding: 0, minHeight: 28,
          border: 'none', outline: 'none', background: 'transparent', color: t.ink, fontFamily: sans,
          // 16 y no 14: por debajo de 16 px el iPhone amplía la página entera
          // al enfocar el campo (el mismo motivo que en «Tus datos», F4).
          fontSize: 16, fontWeight: 600,
        }}
      />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: sans }}>
      {/* Quién es. Las iniciales van sobre la marca, con su texto de marca: el
          mismo disco que la cabecera de /reservar. */}
      <div style={{ ...grupo(t), display: 'flex', alignItems: 'center', gap: 14, padding: 16, overflow: 'visible' }}>
        <span aria-hidden="true" style={{
          width: 52, height: 52, borderRadius: 999, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
          fontFamily: sans, fontSize: 18, fontWeight: 800, letterSpacing: '.02em',
        }}>
          {iniciales(socio.nombre, socio.apellidos || undefined)}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{
            margin: 0, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 17, lineHeight: 1.25,
            letterSpacing: '-.01em', color: t.ink, overflowWrap: 'anywhere',
          }}>
            {nombre}
          </p>
          <p style={{
            margin: '2px 0 0', fontSize: 12.5, color: t.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {socio.email}
          </p>
        </div>
      </div>

      <section aria-labelledby="cuenta-widget-tus-datos">
        <h3 id="cuenta-widget-tus-datos" style={rotulo(t)}>Tus datos</h3>
        <div style={grupo(t)}>
          {fila('telefono', 'Teléfono', 'tel', telefono, setTelefono, 'tel')}
          <div aria-hidden="true" style={{ height: 1, marginInline: 16, background: t.line }} />
          {fila('direccion', 'Dirección', 'text', direccion, setDireccion, 'street-address')}
        </div>

        {mensaje && (
          <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} style={{ margin: '10px 2px 0', fontSize: 13, fontWeight: 700, color: colorMensaje }}>
            {mensaje.texto}
          </p>
        )}

        <button type="button" disabled={desactivado} onClick={guardar} aria-busy={guardando || undefined} className="reservar-foco" style={{
          width: '100%', minHeight: 50, marginTop: 12, padding: '0 20px', border: 'none',
          borderRadius: 'var(--reservar-radio-boton, 999px)',
          background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
          fontFamily: sans, fontSize: 14.5, fontWeight: 800,
          cursor: desactivado ? 'default' : 'pointer',
          // Apagado de verdad mientras no hay nada que guardar: un botón lleno
          // que no hace nada promete algo que no cumple.
          opacity: desactivado ? 0.45 : 1, transition: 'opacity .25s ease',
        }}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </section>

      <section aria-labelledby="cuenta-widget-sesion">
        <h3 id="cuenta-widget-sesion" style={rotulo(t)}>Sesión</h3>
        <div style={grupo(t)}>
          {/* El anillo de foco, por DENTRO (`outlineOffset` en línea gana al
              de la clase): la tarjeta recorta lo que sobresale. */}
          <button type="button" onClick={onLogout} className="reservar-foco" style={{
            width: '100%', minHeight: 52, padding: '0 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            outlineOffset: -3,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            fontFamily: sans, fontSize: 14, fontWeight: 700, color: rojo, textAlign: 'left',
          }}>
            Cerrar sesión
            <LogOut size={17} aria-hidden="true" style={{ flexShrink: 0 }} />
          </button>
        </div>
      </section>
    </div>
  );
}
