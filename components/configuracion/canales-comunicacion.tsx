'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { saludIntegracion } from '@/lib/integraciones/salud';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { hayCambios } from '@/lib/configuracion/formulario-sincronizado';
import { resumenGmail, resumenRemitente, resumenWhatsapp, type ResumenFila } from '@/lib/configuracion/resumenes';
import { seccionDeTarjeta, tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import type { TipoIntegracion } from '@/lib/types';
import { useWhatsappEmbeddedSignup } from '@/lib/hooks/use-whatsapp-embedded-signup';
import { GmailIcon, WhatsAppAppIcon } from '@/components/icons/brand-icons';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { btnPrimary, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import { FILA } from '@/components/configuracion/shell/fila-herramienta';
import { TituloFila, ValorFila } from '@/components/configuracion/shell/fila-ajuste';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

// ─────────────────────────────────────────────────────────────────────────────
// Los canales de «Cómo me comunico» (15-sep, v2): el remitente de tus correos,
// WhatsApp y Gmail, en filas con UN estado, como Stripe en Cobros
// (cobro-con-tarjeta.tsx).
//
// Eran tarjetas de integraciones con una pastilla y una frase debajo que podían
// contradecirse, un modal aparte y el logo a color. Ahora el estado
// (lib/configuracion/resumenes.ts) decide también la acción:
//   · sin conectar → «Conectar» en la misma fila;
//   · conectado (o con problemas) → la fila abre su cajón;
//   · no disponible todavía → nada que tocar.
//
// Solo es la pantalla: conectar, guardar credenciales, probar y desconectar van
// por las mismas rutas de servidor y el mismo `upsertIntegracion` que antes.
//
// ⚠️ Las credenciales no viajan con el panel: se piden al abrir el cajón
// (`/api/integrations/config`). Si no se pueden leer, NO se enseñan los campos en
// blanco: se verían vacíos, se pulsaría «Guardar» y se borraría un token bueno.
// ─────────────────────────────────────────────────────────────────────────────

// Las piezas de una fila de conexión (useCredenciales, FilaCanal, el aviso de
// vuelta…) las usan también las de «Conexiones» (conexiones.tsx).

export type Credenciales = Record<string, string>;
export type Carga = Credenciales | 'cargando' | 'error';

/** Las credenciales guardadas de una integración, pedidas al servidor. */
export function useCredenciales(tipo: TipoIntegracion) {
  const [carga, setCarga] = useState<Carga>('cargando');
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/integrations/config?tipo=${tipo}`, { headers: await authHeader() });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { config?: Credenciales };
        if (vivo) setCarga(data.config ?? {});
      } catch {
        if (vivo) setCarga('error');
      }
    })();
    return () => { vivo = false; };
  }, [tipo]);
  return [carga, setCarga] as const;
}

/** Lo que lee el cajón mientras llegan las credenciales, o si no llegan. */
export function EsperandoCredenciales({ carga, que }: { carga: 'cargando' | 'error'; que: string }) {
  return carga === 'cargando'
    ? <p role="status" className="pb-6 text-sm text-muted-foreground">Cargando…</p>
    : <p role="alert" className="pb-6 text-sm font-medium text-destructive text-pretty">No se han podido cargar {que}. Cierra y vuelve a intentarlo.</p>;
}

/** El logo del servicio, en su placa y en grises: a color era lo más saturado de Configuración. */
function Logo({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-foreground grayscale">
      {children}
    </span>
  );
}

/** Una fila de canal: abre su cajón (`onAbrir`) o lleva su acción en la fila. */
export function FilaCanal({ id, logo, resumen, accion, onAbrir, title }: {
  id: TarjetaId;
  logo: ReactNode;
  /** `null` = sin cargar: va su descripción, sin estado. */
  resumen: ResumenFila | null;
  accion?: ReactNode;
  onAbrir?: () => void;
  /** Para quien opera la plataforma (qué variable falta), nunca en el texto. */
  title?: string;
}) {
  const tarjeta = tarjetaPorId(id);
  const texto = (
    <span className="min-w-0 flex-1">
      <TituloFila titulo={tarjeta.titulo} estado={resumen?.estado} />
      <ValorFila valor={resumen?.valor ?? null} descripcion={tarjeta.frase} entero title={title} />
    </span>
  );
  if (onAbrir) {
    return (
      <li>
        <button id={id} type="button" aria-haspopup="dialog" onClick={onAbrir} className={cn(FILA, 'w-full scroll-mt-32 scroll-mb-32 text-left')}>
          <Logo>{logo}</Logo>
          {texto}
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </li>
    );
  }
  return (
    <li id={id} className="flex min-h-16 scroll-mt-32 scroll-mb-32 items-center gap-3 px-4 py-3">
      <Logo>{logo}</Logo>
      {texto}
      {accion}
    </li>
  );
}

/** La vuelta de una conexión trae su aviso en la URL: se enseña y se limpia. */
export function useAvisoDeVuelta(tarjeta: TarjetaId, avisos: Record<string, (valor: string) => string>, showToast: (m: string) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [param, texto] of Object.entries(avisos)) {
      const valor = params.get(param);
      if (valor === null) continue;
      showToast(texto(valor));
      window.history.replaceState({}, '', hrefDeSeccion(seccionDeTarjeta(tarjeta)));
      return;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export const CUERPO = 'flex flex-col gap-5 pb-6';
const EMAIL_VALIDO = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

// ── Nombre y respuesta de tus correos ───────────────────────────────────────
// `fromName` → el nombre del remitente; `fromEmail` → la dirección de respuesta
// (lib/emails/plantillas-server.ts). La que FIRMA es siempre la verificada de la
// plataforma. Lo que no se pone sale del estudio (lib/emails/marca.ts).

export interface Remitente {
  carga: Carga;
  activo: boolean;
  valor: string | null;
  fijar: (credenciales: Credenciales) => void;
}

export function useRemitente(): Remitente {
  const { studio, dataLoaded, integraciones } = useStudio();
  const [carga, setCarga] = useCredenciales('RESEND');
  const activo = !!integraciones.find(i => i.tipo === 'RESEND')?.activo;
  const valor = dataLoaded && studio && typeof carga === 'object'
    ? resumenRemitente({ propio: { activo, fromName: carga.fromName, fromEmail: carga.fromEmail }, nombreEstudio: studio.nombre, emailEstudio: studio.email })
    : null;
  return { carga, activo, valor, fijar: setCarga };
}

type FormRemitenteValores = { fromName: string; fromEmail: string };

export function FormRemitente({ remitente, onGuardado }: { remitente: Remitente } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { studio, upsertIntegracion } = useStudio();
  const { carga } = remitente;
  const guardadas = typeof carga === 'object' ? carga : null;
  const base: FormRemitenteValores = { fromName: guardadas?.fromName ?? '', fromEmail: guardadas?.fromEmail ?? '' };
  const [form, setForm] = useState<FormRemitenteValores>(base);
  // Llegan después de abrir: se ponen en pantalla si no se ha tocado nada.
  const [cargaVista, setCargaVista] = useState(carga);
  if (carga !== cargaVista) {
    setCargaVista(carga);
    if (typeof cargaVista !== 'object') setForm(base);
  }

  if (!guardadas) return <EsperandoCredenciales carga={carga as 'cargando' | 'error'} que="los datos de tus correos" />;

  const email = form.fromEmail.trim();
  const emailMal = email !== '' && !EMAIL_VALIDO.test(email);
  const rellenos = form.fromName.trim() !== '' || email !== '';
  const asi = resumenRemitente({ propio: { activo: rellenos, ...form }, nombreEstudio: studio?.nombre, emailEstudio: studio?.email });

  async function alGuardar(): Promise<string | null> {
    const nuevas = { fromName: form.fromName.trim(), fromEmail: email };
    // «Guardado» solo si la fila entró (upsertIntegracion comprueba el resultado).
    const res = await upsertIntegracion('RESEND', rellenos, nuevas, guardadas ?? {});
    if (!res.ok) return res.error;
    remitente.fijar(nuevas);
    onGuardado('Remitente de tus correos guardado');
    return null;
  }

  return (
    <>
      <div className={CUERPO}>
        <Campo label="Nombre que verán tus alumnas" ayuda="Vacío = el nombre de tu estudio.">
          {id => <input id={id} className={inputCls} value={form.fromName} placeholder={studio?.nombre ?? ''} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, fromName: v })); }} />}
        </Campo>
        <Campo label="Email para respuestas" ayuda="Vacío = el email de tu estudio." error={emailMal ? 'Ese email no es válido: tus alumnas no podrían responderte.' : null}>
          {id => <input id={id} className={inputCls} type="email" inputMode="email" value={form.fromEmail} placeholder={studio?.email ?? 'hola@tuestudio.es'} aria-invalid={emailMal} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, fromEmail: v })); }} />}
        </Campo>
        {asi && <p data-consecuencia="" className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground text-pretty">Así llegan: {asi}.</p>}
      </div>
      <BarraGuardar
        seccion="comunicacion"
        cambios={hayCambios(form, base) ? [tarjetaPorId('integracion-resend').titulo] : []}
        bloqueo={emailMal ? 'Corrige el email para poder guardar.' : null}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ── WhatsApp ────────────────────────────────────────────────────────────────

export interface CanalWhatsapp {
  resumen: ResumenFila | null;
  /** Encendida (funcione o no): hay algo que gestionar en su cajón. */
  conectado: boolean;
  /** Se conecta entrando con Meta; sin ella, pegando los datos a mano en el cajón. */
  conMeta: boolean;
  conectando: boolean;
  conectarConMeta: () => void;
  script: ReactNode;
}

export function useWhatsapp(showToast: (m: string) => void): CanalWhatsapp {
  const { integraciones, dataLoaded } = useStudio();
  // WhatsApp Embedded Signup (ver WHATSAPP_AUDIT.md/META_SETUP.md): solo con
  // NEXT_PUBLIC_META_APP_ID/CONFIG_ID; sin ellos, los datos se pegan a mano.
  const signup = useWhatsappEmbeddedSignup();
  const intg = integraciones.find(i => i.tipo === 'WHATSAPP');
  const salud = saludIntegracion(intg && {
    activo: intg.activo, ultimoOkEn: intg.ultimoOkEn, ultimoError: intg.ultimoError, ultimoErrorEn: intg.ultimoErrorEn,
  });

  useAvisoDeVuelta('integracion-whatsapp', { whatsapp_connected: () => 'WhatsApp conectado' }, showToast);

  async function conectarConMeta() {
    const r = await signup.conectar();
    if (!r.ok) {
      if (r.error) showToast(r.error);
      return;
    }
    // El aviso viaja en la URL: recargar tira la página antes de que React
    // pinte un toast, y el resto del panel lee las integraciones al arrancar.
    window.location.href = `${hrefDeSeccion(seccionDeTarjeta('integracion-whatsapp'))}&whatsapp_connected=1`;
  }

  return {
    resumen: dataLoaded ? resumenWhatsapp(salud) : null,
    conectado: salud.estado !== 'APAGADA',
    conMeta: signup.disponible,
    conectando: signup.conectando,
    conectarConMeta: () => { void conectarConMeta(); },
    script: signup.script,
  };
}

export function FilaWhatsapp({ w, onAbrir }: { w: CanalWhatsapp; onAbrir: () => void }) {
  const logo = <WhatsAppAppIcon size={36} />;
  if (w.conectado) return <FilaCanal id="integracion-whatsapp" logo={logo} resumen={w.resumen} onAbrir={onAbrir} />;
  return (
    <FilaCanal
      id="integracion-whatsapp"
      logo={logo}
      resumen={w.resumen}
      accion={w.resumen && (
        <button
          type="button"
          onClick={w.conMeta ? w.conectarConMeta : onAbrir}
          disabled={w.conectando}
          aria-haspopup={w.conMeta ? undefined : 'dialog'}
          className={cn(btnPrimary, 'shrink-0')}
        >
          {w.conectando ? 'Conectando…' : 'Conectar'}
        </button>
      )}
    />
  );
}

// Cada negocio pega su propia credencial (su número de WhatsApp Business): los
// pasos para conseguirla, en castellano y sin mandar a documentación en inglés.
const PASOS_WHATSAPP = [
  'Entra en developers.facebook.com/apps y crea (o abre) una app de tipo «Business».',
  'Añade el producto «WhatsApp» a tu app.',
  'En WhatsApp → Introducción, copia el «ID del número de teléfono».',
  'En la misma pantalla, genera un token de acceso permanente (token de usuario del sistema, no el temporal de 24 h de prueba).',
  'Pega aquí el token y el ID del número, y pulsa «Guardar».',
  'Los recordatorios los manda un proceso automático, no una respuesta tuya, así que Meta exige una plantilla aprobada para que lleguen pasadas 24 h desde el último mensaje de la alumna. En WhatsApp Manager → Plantillas de mensaje, crea una con nombre exacto «recordatorio_clase», categoría «Utilidad», idioma «Español» y este cuerpo con 5 variables: «Recordatorio · {{1}}. Tienes {{2}} el {{3}} a las {{4}} en {{5}}.» Cuando te la aprueben, marca su casilla.',
  'Los avisos de hueco libre («Rellenar hueco» y el radar de ocupación) necesitan su PROPIA plantilla, porque para Meta son marketing. Crea otra con nombre exacto «hueco_disponible», categoría «Marketing», idioma «Español» y este cuerpo con 6 variables: «¡Hola {{1}}! Se ha quedado un hueco en {{2}} el {{3}} a las {{4}} en {{5}}. Reserva tu plaza aquí: {{6}} ¡Te esperamos!» Cuando te la aprueben, marca su casilla: la del recordatorio no vale para esta.',
  'Si usas las sustituciones, crea también «sustitucion_urgente», categoría «Marketing», idioma «Español», con este cuerpo de 4 variables: «Hola {{1}}, ¿puedes cubrir {{2}} el {{3}}? Confírmalo en un toque aquí: {{4}} Gracias por echar un cable.» Es la que se le manda a la instructora cuando no ha contestado al email. Sí, «Marketing» aunque no venda nada: Meta reserva «Utilidad» para mensajes sobre el pedido o la cuenta de un cliente.',
  'Lo demás (campañas, automatizaciones y los mensajes sueltos de Mensajería) no necesita plantilla ni puede tenerla: llega a quien te haya escrito en las últimas 24 horas, y al resto Meta lo rechaza y verás el motivo en esta fila.',
];

const CASILLAS_WHATSAPP = [
  { key: 'plantillaAprobada', label: 'Ya me aprobaron la plantilla «recordatorio_clase» en Meta' },
  { key: 'plantillaHuecoAprobada', label: 'Ya me aprobaron la plantilla «hueco_disponible» en Meta' },
  { key: 'plantillaSustitucionAprobada', label: 'Ya me aprobaron la plantilla «sustitucion_urgente» en Meta' },
] as const;

export function DetalleWhatsapp({ w, showToast, onGuardado }: { w: CanalWhatsapp } & PropsFormularioCajon) {
  const { upsertIntegracion } = useStudio();
  const [carga] = useCredenciales('WHATSAPP');
  const guardadas = typeof carga === 'object' ? carga : null;
  const [form, setForm] = useState<Credenciales>({});
  const [cargaVista, setCargaVista] = useState<Carga>('cargando');
  if (carga !== cargaVista) {
    setCargaVista(carga);
    if (guardadas) setForm(guardadas);
  }
  const [probando, setProbando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enVuelo = useRef(false);

  if (!guardadas) return <EsperandoCredenciales carga={carga as 'cargando' | 'error'} que="tus datos de WhatsApp" />;

  // `wabaId` solo lo rellena el callback de Embedded Signup: conectado por Meta,
  // no hay token que enseñar ni que sobrescribir con uno vacío.
  const porMeta = !!guardadas.wabaId;

  async function probar() {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setProbando(true);
    try {
      const res = await fetch('/api/integrations/whatsapp/probar', { method: 'POST', headers: await authHeader() });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      showToast(res.ok && data.ok ? 'Conexión con WhatsApp correcta' : `No funciona: ${data.error ?? 'no se ha podido conectar'}`);
    } catch {
      showToast('No hemos podido hablar con el servidor');
    } finally {
      enVuelo.current = false;
      setProbando(false);
    }
  }

  async function desconectar() {
    setDesconectando(true);
    setError(null);
    const res = await upsertIntegracion('WHATSAPP', false, {}, guardadas ?? {});
    setDesconectando(false);
    if (!res.ok) setError(res.error);
    else onGuardado('WhatsApp desconectado');
  }

  async function alGuardar(): Promise<string | null> {
    // Una casilla marcada no es una credencial: sin token ni número, no se enciende.
    const rellenos = ['token', 'phoneId'].some(k => (form[k] ?? '').trim() !== '');
    const res = await upsertIntegracion('WHATSAPP', rellenos, form, guardadas ?? {});
    if (!res.ok) return res.error;
    onGuardado(rellenos ? 'Datos de WhatsApp guardados: pruébalo' : 'WhatsApp actualizado');
    return null;
  }

  const acciones = w.conectado && (
    <div className="flex flex-col gap-2 @sm/config:flex-row">
      <button type="button" onClick={() => { void probar(); }} disabled={probando} className={btnSecondary}>
        {probando ? 'Probando…' : 'Probar conexión'}
      </button>
      <button type="button" onClick={() => setPreguntando(true)} disabled={desconectando} className={cn(btnSecondary, 'text-destructive')}>
        {desconectando ? 'Desconectando…' : 'Desconectar WhatsApp'}
      </button>
    </div>
  );

  return (
    <>
      <div className={CUERPO}>
        {porMeta ? (
          <>
            <p className="text-sm font-medium text-foreground">Conectado a través de Meta</p>
            <div className="rounded-lg bg-muted px-3 py-2.5">
              <p className="text-sm font-semibold text-foreground">{guardadas.verifiedName || 'WhatsApp Business'}</p>
              <p className="text-sm text-muted-foreground">{guardadas.displayPhoneNumber || '—'}</p>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">Los recordatorios salen desde este número. No tienes que pegar ningún dato.</p>
          </>
        ) : (
          <>
            <Campo label="Token de acceso">
              {id => <input id={id} className={inputCls} type="password" autoComplete="off" placeholder="EAAxxxxxxxxxxxx..." value={form.token ?? ''} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, token: v })); }} />}
            </Campo>
            <Campo label="ID de número de teléfono">
              {id => <input id={id} className={inputCls} inputMode="numeric" placeholder="109xxxxxxxxxxx" value={form.phoneId ?? ''} onChange={e => { const v = e.target.value; setForm(f => ({ ...f, phoneId: v })); }} />}
            </Campo>
            {CASILLAS_WHATSAPP.map(c => (
              <label key={c.key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-[var(--brand)]"
                  checked={form[c.key] === 'true'}
                  onChange={e => { const v = e.target.checked ? 'true' : 'false'; setForm(f => ({ ...f, [c.key]: v })); }}
                />
                {c.label}
              </label>
            ))}
          </>
        )}
        {acciones}
        {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
        {!porMeta && (
          <div>
            <h3 className="text-sm font-semibold text-foreground">Cómo conseguir estos datos</h3>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground text-pretty">
              {PASOS_WHATSAPP.map(paso => <li key={paso}>{paso}</li>)}
            </ol>
          </div>
        )}
      </div>
      {!porMeta && (
        <BarraGuardar
          seccion="comunicacion"
          cambios={hayCambios(form, guardadas) ? ['WhatsApp'] : []}
          onGuardar={alGuardar}
          onDescartar={() => setForm(guardadas)}
        />
      )}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo="¿Desconectar WhatsApp?"
        descripcion="Los recordatorios dejan de salir por WhatsApp; el correo y el aviso en su app siguen llegando."
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void desconectar(); }}
      />
    </>
  );
}

// ── Contactos de Gmail ──────────────────────────────────────────────────────
// OAuth de Google (lib/gmail.ts). Ningún correo a una alumna sale por Gmail: lo
// que hace es traer tus contactos como alumnas nuevas, cuando lo pulsas.

export interface CanalGmail {
  resumen: ResumenFila | null;
  conectado: boolean;
  disponible: boolean;
  conectando: boolean;
  conectar: () => void;
  /** `null` = desconectado de verdad; un texto = no, y por qué. */
  desconectar: () => Promise<string | null>;
}

export function useGmail(showToast: (m: string) => void): CanalGmail {
  const { studio, dataLoaded, updateStudio } = useStudio();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [conectando, setConectando] = useState(false);
  const enVuelo = useRef(false);

  useAvisoDeVuelta('integracion-gmail', {
    gmail_connected: () => 'Gmail conectado',
    gmail_error: v => `Error al conectar Gmail: ${v}`,
  }, showToast);

  async function conectar() {
    if (!clientId || enVuelo.current) return;
    enVuelo.current = true;
    setConectando(true);
    const fallo = (texto: string) => { enVuelo.current = false; setConectando(false); showToast(texto); };
    try {
      const res = await fetch('/api/integrations/oauth-state', {
        method: 'POST',
        // H-1: same-origin (el valor por defecto, explícito para que no se cambie): esta respuesta fija la cookie HttpOnly del flujo.
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ provider: 'gmail' }),
      });
      if (!res.ok) { fallo('No se pudo iniciar la conexión con Gmail'); return; }
      const { state } = (await res.json()) as { state: string };
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const redirect = encodeURIComponent(`${appUrl}/api/integrations/gmail/callback`);
      const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/userinfo.email');
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    } catch {
      fallo('No se pudo iniciar la conexión con Gmail. Revisa tu conexión.');
    }
  }

  async function desconectar(): Promise<string | null> {
    try {
      const res = await fetch('/api/integrations/gmail/disconnect', { method: 'POST', headers: await authHeader() });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return `No se pudo desconectar: ${data?.error ?? 'error desconocido'}`;
      }
      const upd = await updateStudio({ gmailEmail: null });
      return upd.ok ? null : upd.error;
    } catch {
      return 'No se ha podido desconectar Gmail. Revisa tu conexión.';
    }
  }

  const email = studio?.gmailEmail ?? null;
  return {
    resumen: dataLoaded && studio ? resumenGmail({ email, disponible: !!clientId }) : null,
    conectado: !!email,
    disponible: !!clientId,
    conectando,
    conectar: () => { void conectar(); },
    desconectar,
  };
}

export function FilaGmail({ g, onAbrir }: { g: CanalGmail; onAbrir: () => void }) {
  const logo = <GmailIcon size={20} />;
  if (g.conectado) return <FilaCanal id="integracion-gmail" logo={logo} resumen={g.resumen} onAbrir={onAbrir} />;
  return (
    <FilaCanal
      id="integracion-gmail"
      logo={logo}
      resumen={g.resumen}
      accion={g.resumen && g.disponible && (
        <button type="button" onClick={g.conectar} disabled={g.conectando} className={cn(btnPrimary, 'shrink-0')}>
          {g.conectando ? 'Conectando…' : 'Conectar'}
        </button>
      )}
    />
  );
}

export function DetalleGmail({ g, showToast, onGuardado }: { g: CanalGmail } & PropsFormularioCajon) {
  const [trayendo, setTrayendo] = useState(false);
  const [probando, setProbando] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function llamar(ruta: string, enCurso: (v: boolean) => void, bien: (data: Record<string, unknown>) => string) {
    enCurso(true);
    try {
      const res = await fetch(ruta, { method: 'POST', headers: await authHeader() });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      showToast(res.ok ? bien(data) : `No se ha podido: ${String(data.error ?? 'error desconocido')}`);
    } catch {
      showToast('No hemos podido hablar con el servidor');
    } finally {
      enCurso(false);
    }
  }

  async function desconectar() {
    setDesconectando(true);
    setError(null);
    const fallo = await g.desconectar();
    setDesconectando(false);
    if (fallo) setError(fallo);
    else onGuardado('Gmail desconectado');
  }

  return (
    <div className={CUERPO}>
      <div className="flex flex-col gap-2 @sm/config:flex-row @sm/config:flex-wrap">
        <button
          type="button"
          disabled={trayendo}
          className={btnPrimary}
          onClick={() => { void llamar('/api/integrations/gmail/sync-contacts', setTrayendo, d => `${d.creadas} alumnas nuevas desde tus contactos de Gmail (${d.yaExistian} ya existían)`); }}
        >
          {trayendo ? 'Trayendo…' : 'Traer contactos'}
        </button>
        <button
          type="button"
          disabled={probando}
          className={btnSecondary}
          onClick={() => { void llamar('/api/integrations/gmail/test', setProbando, () => 'Email de prueba enviado: revisa tu bandeja de entrada'); }}
        >
          {probando ? 'Enviando…' : 'Enviar email de prueba'}
        </button>
        <button type="button" onClick={() => setPreguntando(true)} disabled={desconectando} className={cn(btnSecondary, 'text-destructive')}>
          {desconectando ? 'Desconectando…' : 'Desconectar Gmail'}
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo="¿Desconectar Gmail?"
        descripcion="Dejarás de poder traer tus contactos. Las alumnas que ya trajiste se quedan."
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void desconectar(); }}
      />
    </div>
  );
}
