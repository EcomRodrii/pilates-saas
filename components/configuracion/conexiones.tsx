'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { cuando, saludIntegracion, type SaludIntegracion } from '@/lib/integraciones/salud';
import { hayCambios } from '@/lib/configuracion/formulario-sincronizado';
import { resumenConexion, type ResumenFila } from '@/lib/configuracion/resumenes';
import type { TarjetaId } from '@/lib/configuracion/secciones';
import type { Studio, TipoIntegracion } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { btnPrimary, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { Campo } from '@/components/configuracion/formulario-estudio';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import {
  CUERPO, EsperandoCredenciales, FilaCanal, useAvisoDeVuelta, useCredenciales, type Carga, type Credenciales,
} from '@/components/configuracion/canales-comunicacion';

// ─────────────────────────────────────────────────────────────────────────────
// Las conexiones de «Conexiones» (15-sep, v2): una fila por conexión con UN
// estado, como Stripe en Cobros y WhatsApp en Cómo me comunico.
//
// Eran tarjetas de un catálogo (tab-integraciones.tsx) con una pastilla, una
// categoría, una frase larga, una línea de salud debajo y un modal aparte. Ahora
// el estado (lib/configuracion/resumenes.ts, `resumenConexion`) decide también
// la acción:
//   · sin conectar → «Conectar» en la misma fila (o «Ir a Zapier»);
//   · conectada, sin probar o con problemas → la fila abre su cajón;
//   · no disponible todavía → nada que tocar.
//
// Solo es la pantalla: conectar, sincronizar, probar, guardar la clave y
// desconectar van por las MISMAS rutas de servidor y el mismo
// `upsertIntegracion` que antes. Google Calendar no guarda cuándo se sincronizó
// por última vez: la fila no lo dice, y el cajón cuenta lo que devolvió la
// última vez que se pulsó.
// ─────────────────────────────────────────────────────────────────────────────

/** La salud de una integración: solo existe si tiene fila en `integraciones`. */
function useSalud(tipo: TipoIntegracion): SaludIntegracion {
  const { integraciones } = useStudio();
  const i = integraciones.find(x => x.tipo === tipo);
  return saludIntegracion(i && { activo: i.activo, ultimoOkEn: i.ultimoOkEn, ultimoError: i.ultimoError, ultimoErrorEn: i.ultimoErrorEn });
}

/** Un botón que llama a una ruta y dice en el cajón lo que ha contestado, bien o mal. */
function AccionServidor({ ruta, texto, textoEnCurso, bien, primario }: {
  ruta: string;
  texto: string;
  textoEnCurso: string;
  bien: (data: Record<string, unknown>) => string;
  primario?: boolean;
}) {
  const [enCurso, setEnCurso] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const enVuelo = useRef(false);

  async function llamar() {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setEnCurso(true);
    setResultado(null);
    try {
      const res = await fetch(ruta, { method: 'POST', headers: await authHeader() });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // Probar contesta `{ ok }`; sincronizar, sus cifras. Un 200 con `ok: false` no es un sí.
      setResultado(res.ok && data.ok !== false
        ? { ok: true, texto: bien(data) }
        : { ok: false, texto: `No se ha podido: ${String(data.error ?? 'error desconocido')}` });
    } catch {
      setResultado({ ok: false, texto: 'No hemos podido hablar con el servidor' });
    } finally {
      enVuelo.current = false;
      setEnCurso(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => { void llamar(); }} disabled={enCurso} className={cn(primario ? btnPrimary : btnSecondary, 'self-start')}>
        {enCurso ? textoEnCurso : texto}
      </button>
      {resultado && (
        <p role={resultado.ok ? 'status' : 'alert'} className={cn('text-sm text-pretty', resultado.ok ? 'text-foreground' : 'font-medium text-destructive')}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}

/** «Desconectar X», que pregunta con lo que va a pasar y no cierra el cajón si falla. */
function Desconectar({ nombre, consecuencia, desconectar, onGuardado }: {
  nombre: string;
  consecuencia: string;
  /** `null` = desconectado de verdad; un texto = no, y por qué. */
  desconectar: () => Promise<string | null>;
} & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const [preguntando, setPreguntando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setDesconectando(true);
    setError(null);
    const fallo = await desconectar();
    setDesconectando(false);
    if (fallo) setError(fallo);
    else onGuardado(`${nombre} desconectado`);
  }

  return (
    <>
      <button type="button" onClick={() => setPreguntando(true)} disabled={desconectando} className={cn(btnSecondary, 'self-start text-destructive')}>
        {desconectando ? 'Desconectando…' : `Desconectar ${nombre}`}
      </button>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo={`¿Desconectar ${nombre}?`}
        descripcion={consecuencia}
        textoConfirmar="Sí, desconectar"
        destructivo
        onConfirm={() => { void confirmar(); }}
      />
    </>
  );
}

const botonConectar = (onClick: () => void, conectando: boolean, dialogo?: boolean) => (
  <button
    type="button"
    onClick={onClick}
    disabled={conectando}
    aria-haspopup={dialogo ? 'dialog' : undefined}
    className={cn(btnPrimary, 'shrink-0')}
  >
    {conectando ? 'Conectando…' : 'Conectar'}
  </button>
);

// ── Las que se conectan entrando con tu cuenta ─────────────────────────────

type TipoOAuth = 'GOOGLE_CALENDAR' | 'ZOOM' | 'KLAVIYO';

interface ConfigOAuth {
  tarjeta: TarjetaId;
  nombre: string;
  /** Sin el id de la app en el servidor no hay nada que conectar. */
  clientId: string | undefined;
  variable: string;
  proveedor: 'google' | 'zoom' | 'klaviyo';
  campo: 'googleCalendarEmail' | 'zoomEmail' | 'klaviyoAccountName';
  ruta: string;
  paraQue: string;
  alDesconectar: string;
  avisos: Record<string, (valor: string) => string>;
  autorizar: (e: { clientId: string; redirect: string; state: string; codeChallenge?: string }) => string;
}

// ⚠️ Cada `process.env.NEXT_PUBLIC_*` escrito entero: Next lo sustituye al
// compilar y no ve un acceso calculado.
const OAUTH: Record<TipoOAuth, ConfigOAuth> = {
  GOOGLE_CALENDAR: {
    tarjeta: 'integracion-google_calendar',
    nombre: 'Google Calendar',
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    variable: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    proveedor: 'google',
    campo: 'googleCalendarEmail',
    ruta: '/api/integrations/google-calendar',
    paraQue: 'Conéctalo para copiar tus clases a tu calendario',
    // La ruta borra el token y no toca los eventos ya creados en Google.
    alDesconectar: 'Las clases que ya copiaste se quedan en tu calendario; no se copia ninguna más.',
    avisos: {
      google_calendar_connected: () => 'Google Calendar conectado',
      google_calendar_error: v => `Error al conectar Google Calendar: ${v}`,
    },
    autorizar: ({ clientId, redirect, state }) => {
      const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email');
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    },
  },
  ZOOM: {
    tarjeta: 'integracion-zoom',
    nombre: 'Zoom',
    clientId: process.env.NEXT_PUBLIC_ZOOM_CLIENT_ID,
    variable: 'NEXT_PUBLIC_ZOOM_CLIENT_ID',
    proveedor: 'zoom',
    campo: 'zoomEmail',
    ruta: '/api/integrations/zoom',
    paraQue: 'Conéctalo para crear las reuniones de tus clases online',
    // Sin `zoom_email`, el cron (lib/zoom-sync.ts) ya no pasa por este estudio.
    alDesconectar: 'Tentare deja de crear reuniones de Zoom para tus clases online. Las ya creadas siguen en tu cuenta de Zoom.',
    avisos: {
      zoom_connected: () => 'Zoom conectado',
      zoom_error: v => `Error al conectar Zoom: ${v}`,
    },
    // v2/authorize (marketplace.zoom.us), NO el legacy zoom.us/oauth/authorize:
    // verificado el 2026-08-20, el legacy devuelve «Redirección no válida (4.700)»
    // para una app que no está publicada en el Marketplace (la nuestra).
    autorizar: ({ clientId, redirect, state }) =>
      `https://marketplace.zoom.us/v2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`,
  },
  KLAVIYO: {
    tarjeta: 'integracion-klaviyo',
    nombre: 'Klaviyo',
    clientId: process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID,
    variable: 'NEXT_PUBLIC_KLAVIYO_CLIENT_ID',
    proveedor: 'klaviyo',
    campo: 'klaviyoAccountName',
    ruta: '/api/integrations/klaviyo',
    paraQue: 'Conéctalo para llevar tus alumnas a tus listas',
    alDesconectar: 'Las alumnas que ya enviaste se quedan en Klaviyo; no se envía ninguna más.',
    avisos: {
      klaviyo_connected: () => 'Klaviyo conectado',
      klaviyo_error: v => `Error al conectar Klaviyo: ${v}`,
    },
    // Klaviyo exige PKCE: oauth-state devuelve también `codeChallenge` para este proveedor.
    // ⚠️ Sin probar de punta a punta contra Klaviyo (sin KLAVIYO_CLIENT_ID real).
    autorizar: ({ clientId, redirect, state, codeChallenge }) => {
      const scope = encodeURIComponent('accounts:read lists:write profiles:write subscriptions:write');
      return `https://www.klaviyo.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirect}&scope=${scope}&state=${encodeURIComponent(state)}&code_challenge_method=S256&code_challenge=${encodeURIComponent(codeChallenge ?? '')}`;
    },
  },
};

export interface ConexionOAuth {
  config: ConfigOAuth;
  cuenta: string | null;
  conectado: boolean;
  disponible: boolean;
  /** `null` = sin cargar el estudio. */
  resumen: ResumenFila | null;
  conectando: boolean;
  conectar: () => void;
  desconectar: () => Promise<string | null>;
}

export function useConexionOAuth(tipo: TipoOAuth, showToast: (m: string) => void): ConexionOAuth {
  const config = OAUTH[tipo];
  const { studio, dataLoaded, updateStudio } = useStudio();
  const salud = useSalud(tipo);
  const [conectando, setConectando] = useState(false);
  const enVuelo = useRef(false);

  useAvisoDeVuelta(config.tarjeta, config.avisos, showToast);

  // C-8: el `state` lo emite firmado una ruta de servidor autenticada y el
  // callback lo verifica. El botón lo pide y redirige.
  async function conectar() {
    const { clientId } = config;
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
        body: JSON.stringify({ provider: config.proveedor }),
      });
      if (!res.ok) { fallo(`No se pudo iniciar la conexión con ${config.nombre}`); return; }
      const { state, codeChallenge } = (await res.json()) as { state: string; codeChallenge?: string };
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const redirect = encodeURIComponent(`${appUrl}${config.ruta}/callback`);
      window.location.href = config.autorizar({ clientId, redirect, state, codeChallenge });
    } catch {
      fallo(`No se pudo iniciar la conexión con ${config.nombre}. Revisa tu conexión.`);
    }
  }

  // Desconecta en servidor (borra el token) y después limpia la cuenta que pinta «Conectado».
  async function desconectar(): Promise<string | null> {
    try {
      const res = await fetch(`${config.ruta}/disconnect`, { method: 'POST', headers: await authHeader() });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return `No se pudo desconectar: ${data?.error ?? 'error desconocido'}`;
      }
      const cambios: Partial<Studio> = {};
      cambios[config.campo] = null;
      const upd = await updateStudio(cambios);
      return upd.ok ? null : upd.error;
    } catch {
      return `No se ha podido desconectar ${config.nombre}. Revisa tu conexión.`;
    }
  }

  const cuenta = studio?.[config.campo] ?? null;
  return {
    config,
    cuenta,
    conectado: !!cuenta,
    disponible: !!config.clientId,
    resumen: dataLoaded && studio ? resumenConexion({ cuenta, salud, disponible: !!config.clientId, paraQue: config.paraQue }) : null,
    conectando,
    conectar: () => { void conectar(); },
    desconectar,
  };
}

export function FilaConexionOAuth({ c, logo, onAbrir }: { c: ConexionOAuth; logo: ReactNode; onAbrir: () => void }) {
  const { tarjeta, variable } = c.config;
  if (c.conectado) return <FilaCanal id={tarjeta} logo={logo} resumen={c.resumen} onAbrir={onAbrir} />;
  return (
    <FilaCanal
      id={tarjeta}
      logo={logo}
      resumen={c.resumen}
      // Lo que falta por nuestro lado es una variable del servidor: no es un
      // mensaje para la propietaria, pero sí para quien opera la plataforma.
      title={c.resumen && !c.disponible ? `Falta configurar ${variable} en el servidor` : undefined}
      accion={c.resumen && c.disponible && botonConectar(c.conectar, c.conectando)}
    />
  );
}

/** El cajón de una conexión por cuenta: con cuál está, sus acciones y desconectar. */
export function DetalleConexionOAuth({ c, onGuardado, children }: { c: ConexionOAuth; children?: ReactNode } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  return (
    <div className={CUERPO}>
      <p className="text-sm text-foreground text-pretty">
        Conectado con <span className="font-semibold">{c.cuenta}</span>.
      </p>
      {children}
      <Desconectar nombre={c.config.nombre} consecuencia={c.config.alDesconectar} desconectar={c.desconectar} onGuardado={onGuardado} />
    </div>
  );
}

export function SincronizarGoogleCalendar() {
  return (
    <AccionServidor
      primario
      ruta="/api/integrations/google-calendar/sync"
      texto="Sincronizar ahora"
      textoEnCurso="Sincronizando…"
      bien={d => {
        const fallidas = Number(d.fallidas ?? 0);
        return `Hecho: ${d.creadas} clases nuevas, ${d.actualizadas} actualizadas y ${d.borradas} quitadas de tu calendario.${fallidas > 0 ? ` ${fallidas} no se han podido copiar.` : ''}`;
      }}
    />
  );
}

export function AccionesZoom() {
  return (
    <>
      {/* Con el PMI, todas las clases compartirían la misma sala. */}
      <p className="text-sm text-muted-foreground text-pretty">
        En Zoom, desactiva «Usar ID de reunión personal (PMI) al programar»: con él, todas tus clases compartirían sala.
        Para reuniones de más de 40 minutos, tu cuenta de Zoom necesita un plan de pago.
      </p>
      <AccionServidor ruta="/api/integrations/zoom/probar" texto="Probar conexión" textoEnCurso="Probando…" bien={() => 'La conexión con Zoom funciona.'} />
    </>
  );
}

export function SincronizarKlaviyo() {
  return (
    <AccionServidor
      primario
      ruta="/api/integrations/klaviyo/sync"
      texto="Sincronizar ahora"
      textoEnCurso="Sincronizando…"
      bien={d => `Hecho: ${d.sincronizadas} alumnas enviadas a Klaviyo.`}
    />
  );
}

// ── Las que piden pegar una clave ───────────────────────────────────────────

type TipoConClave = 'KISI' | 'MAILCHIMP';

interface ConfigConClave {
  tipo: TipoConClave;
  tarjeta: TarjetaId;
  nombre: string;
  paraQue: string;
  campos: readonly { key: string; label: string; placeholder: string; secreto?: boolean }[];
  /** Cada negocio pega SU credencial: dónde conseguirla, en castellano. */
  pasos: readonly string[];
  probar: string;
  sincronizar?: string;
  alDesconectar: string;
}

const CON_CLAVE: Record<TipoConClave, ConfigConClave> = {
  KISI: {
    tipo: 'KISI',
    tarjeta: 'integracion-kisi',
    nombre: 'Kisi',
    paraQue: 'Conéctalo para abrir la puerta con cada check-in',
    campos: [
      { key: 'apiKey', label: 'Clave API', placeholder: 'kisi_xxxxxxxxxxxxxxxx', secreto: true },
      { key: 'lockId', label: 'ID de la cerradura (opcional si solo tienes una)', placeholder: '12345' },
    ],
    pasos: [
      'Inicia sesión en tu panel de Kisi (kisi.io).',
      'Arriba a la derecha, pulsa en tu email y entra en «Mi cuenta».',
      'En el menú de la izquierda, entra en «API».',
      'Pulsa «Agregar clave API» (si ya tenías una para Tentare, bórrala antes).',
      'Ponle de nombre «Tentare» y confirma con tu contraseña de Kisi.',
      'Copia la clave, pégala aquí y pulsa «Guardar».',
      'Si tu cuenta tiene varias cerraduras, pon también el ID de la puerta del estudio (panel de Kisi → Cerraduras).',
    ],
    probar: '/api/integrations/kisi/probar',
    alDesconectar: 'La puerta deja de abrirse sola con cada check-in.',
  },
  MAILCHIMP: {
    tipo: 'MAILCHIMP',
    tarjeta: 'integracion-mailchimp',
    nombre: 'Mailchimp',
    paraQue: 'Conéctalo para llevar tus alumnas a tu audiencia',
    campos: [
      { key: 'apiKey', label: 'Clave API', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us6', secreto: true },
      { key: 'audienceId', label: 'ID de audiencia', placeholder: 'a1b2c3d4e5' },
      { key: 'serverPrefix', label: 'Prefijo del servidor', placeholder: 'us6' },
    ],
    pasos: [
      'En Mailchimp, pulsa en tu perfil (abajo a la izquierda) → Extras → Claves API.',
      'Pulsa «Crear una clave API» y cópiala. El prefijo del servidor es lo que va tras el guion, como «us6».',
      'Ve a Audiencia → All contacts → Settings → Audience name and defaults y copia el «Audience ID».',
      'Pega aquí los tres datos y pulsa «Guardar».',
    ],
    probar: '/api/integrations/mailchimp/probar',
    sincronizar: '/api/integrations/mailchimp/sync',
    alDesconectar: 'Dejas de poder enviar alumnas a Mailchimp. Las que ya enviaste se quedan allí.',
  },
};

export interface ConexionConClave {
  config: ConfigConClave;
  /** Encendida (funcione o no): hay algo que gestionar. */
  conectado: boolean;
  resumen: ResumenFila | null;
}

export function useConexionConClave(tipo: TipoConClave): ConexionConClave {
  const { dataLoaded } = useStudio();
  const config = CON_CLAVE[tipo];
  const salud = useSalud(tipo);
  return {
    config,
    conectado: salud.estado !== 'APAGADA',
    resumen: dataLoaded ? resumenConexion({ salud, disponible: true, paraQue: config.paraQue }) : null,
  };
}

export function FilaConexionConClave({ c, logo, onAbrir }: { c: ConexionConClave; logo: ReactNode; onAbrir: () => void }) {
  if (c.conectado) return <FilaCanal id={c.config.tarjeta} logo={logo} resumen={c.resumen} onAbrir={onAbrir} />;
  return <FilaCanal id={c.config.tarjeta} logo={logo} resumen={c.resumen} accion={c.resumen && botonConectar(onAbrir, false, true)} />;
}

export function DetalleConexionConClave({ c, onGuardado }: { c: ConexionConClave } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  const { upsertIntegracion } = useStudio();
  const { config } = c;
  const [carga] = useCredenciales(config.tipo);
  const guardadas = typeof carga === 'object' ? carga : null;
  const [form, setForm] = useState<Credenciales>({});
  const [cargaVista, setCargaVista] = useState<Carga>('cargando');
  if (carga !== cargaVista) {
    setCargaVista(carga);
    if (guardadas) setForm(guardadas);
  }

  if (!guardadas) return <EsperandoCredenciales carga={carga as 'cargando' | 'error'} que={`tus datos de ${config.nombre}`} />;

  async function alGuardar(): Promise<string | null> {
    // Sin ningún dato pegado no se enciende: guardar en blanco la apaga.
    const rellenos = config.campos.some(campo => (form[campo.key] ?? '').trim() !== '');
    // «Guardado» solo si la fila entró (upsertIntegracion comprueba el resultado).
    const res = await upsertIntegracion(config.tipo, rellenos, form, guardadas ?? {});
    if (!res.ok) return res.error;
    onGuardado(rellenos ? `Datos de ${config.nombre} guardados: pruébalo` : `${config.nombre} actualizado`);
    return null;
  }

  // Lo que compara la barra: solo los campos de este formulario.
  const campos = Object.fromEntries(config.campos.map(campo => [campo.key, form[campo.key] ?? '']));
  const base = Object.fromEntries(config.campos.map(campo => [campo.key, guardadas[campo.key] ?? '']));

  return (
    <>
      <div className={CUERPO}>
        {config.campos.map(campo => (
          <Campo key={campo.key} label={campo.label}>
            {id => (
              <input
                id={id}
                className={inputCls}
                type={campo.secreto ? 'password' : 'text'}
                autoComplete="off"
                placeholder={campo.placeholder}
                value={form[campo.key] ?? ''}
                onChange={e => { const v = e.target.value; setForm(f => ({ ...f, [campo.key]: v })); }}
              />
            )}
          </Campo>
        ))}
        {c.conectado && (
          <>
            {config.sincronizar && (
              <AccionServidor
                primario
                ruta={config.sincronizar}
                texto="Sincronizar ahora"
                textoEnCurso="Sincronizando…"
                bien={d => `Hecho: ${d.sincronizadas} alumnas enviadas a ${config.nombre}.`}
              />
            )}
            <AccionServidor ruta={config.probar} texto="Probar conexión" textoEnCurso="Probando…" bien={() => `La conexión con ${config.nombre} funciona.`} />
            <Desconectar
              nombre={config.nombre}
              consecuencia={config.alDesconectar}
              desconectar={async () => {
                const res = await upsertIntegracion(config.tipo, false, {}, guardadas ?? {});
                return res.ok ? null : res.error;
              }}
              onGuardado={onGuardado}
            />
          </>
        )}
        <div>
          <h3 className="text-sm font-semibold text-foreground">Cómo conseguir estos datos</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-muted-foreground text-pretty">
            {config.pasos.map(paso => <li key={paso}>{paso}</li>)}
          </ol>
        </div>
      </div>
      <BarraGuardar
        seccion="conexiones"
        cambios={hayCambios(campos, base) ? [config.nombre] : []}
        onGuardar={alGuardar}
        onDescartar={() => setForm(guardadas)}
      />
    </>
  );
}

// ── Zapier y las apps con acceso ────────────────────────────────────────────
// Al revés que el resto: Tentare es el SERVIDOR OAuth, así que la conexión la
// inicia Zapier, nunca un botón de aquí. Se lee de los consentimientos
// (GET /api/oauth/consentimientos) y se puede quitar el acceso.

const ZAPIER_URL = 'https://zapier.com/apps/tentare/integrations';

export interface AppConAcceso {
  clienteId: string;
  nombre: string;
  otorgadoEn: string;
}

export interface AppsConAcceso {
  /** `null` = sin cargar (o no se ha podido). */
  apps: AppConAcceso[] | null;
  error: boolean;
  /** `null` = quitado de verdad; un texto = no, y por qué. */
  quitar: (clienteId: string) => Promise<string | null>;
}

export function useAppsConAcceso(): AppsConAcceso {
  const [apps, setApps] = useState<AppConAcceso[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch('/api/oauth/consentimientos', { headers: await authHeader() });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { apps?: unknown };
        // Una respuesta sin `apps` no puede tumbar la sección entera.
        if (vivo) setApps(Array.isArray(data.apps) ? (data.apps as AppConAcceso[]) : []);
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function quitar(clienteId: string): Promise<string | null> {
    try {
      const res = await fetch('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ clienteId }),
      });
      if (!res.ok) return 'No se ha podido quitar el acceso';
      setApps(prev => (prev ?? []).filter(a => a.clienteId !== clienteId));
      return null;
    } catch {
      return 'No hemos podido hablar con el servidor';
    }
  }

  return { apps: error ? null : apps, error, quitar };
}

export interface ConexionZapier {
  acceso: AppConAcceso | null;
  resumen: ResumenFila | null;
}

export function useZapier(a: AppsConAcceso): ConexionZapier {
  const salud = useSalud('ZAPIER');
  const acceso = a.apps?.find(x => x.clienteId === 'zapier') ?? null;
  return {
    acceso,
    resumen: a.apps
      ? resumenConexion({ cuenta: acceso ? `Con acceso desde el ${cuando(acceso.otorgadoEn)}` : null, salud, disponible: true, paraQue: 'Se conecta desde tu cuenta de Zapier' })
      : null,
  };
}

export function FilaZapier({ z, logo, onAbrir }: { z: ConexionZapier; logo: ReactNode; onAbrir: () => void }) {
  if (z.acceso) return <FilaCanal id="integracion-zapier" logo={logo} resumen={z.resumen} onAbrir={onAbrir} />;
  return (
    <FilaCanal
      id="integracion-zapier"
      logo={logo}
      resumen={z.resumen}
      accion={z.resumen && (
        <a href={ZAPIER_URL} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, 'shrink-0 no-underline')}>
          Ir a Zapier <ExternalLink size={14} aria-hidden />
        </a>
      )}
    />
  );
}

export function DetalleZapier({ z, a, onGuardado }: { z: ConexionZapier; a: AppsConAcceso } & Pick<PropsFormularioCajon, 'onGuardado'>) {
  if (!z.acceso) return null;
  return (
    <div className={CUERPO}>
      <p className="text-sm text-foreground text-pretty">Zapier tiene acceso a los datos de tu estudio desde el {cuando(z.acceso.otorgadoEn)}.</p>
      <a href={ZAPIER_URL} target="_blank" rel="noopener noreferrer" className={cn(btnSecondary, 'inline-flex items-center gap-1.5 self-start')}>
        Abrir Zapier <ExternalLink size={14} aria-hidden />
      </a>
      <QuitarAcceso app={z.acceso} a={a} onQuitado={() => onGuardado('Acceso de Zapier quitado')} />
    </div>
  );
}

function QuitarAcceso({ app, a, onQuitado }: { app: AppConAcceso; a: AppsConAcceso; onQuitado: () => void }) {
  const [preguntando, setPreguntando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    setQuitando(true);
    setError(null);
    const fallo = await a.quitar(app.clienteId);
    setQuitando(false);
    if (fallo) setError(fallo);
    else onQuitado();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setPreguntando(true)}
        disabled={quitando}
        aria-label={`Quitar el acceso a ${app.nombre}`}
        className={cn(btnSecondary, 'self-start text-destructive')}
      >
        {quitando ? 'Quitando…' : 'Quitar el acceso'}
      </button>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty">{error}</p>}
      <ConfirmDialog
        open={preguntando}
        onOpenChange={setPreguntando}
        titulo={`¿Quitar el acceso a ${app.nombre}?`}
        descripcion={`${app.nombre} deja de ver los datos de tu estudio y lo que tengas montado con Tentare deja de funcionar, hasta que lo vuelvas a conectar desde ${app.nombre}.`}
        textoConfirmar="Sí, quitarlo"
        destructivo
        onConfirm={() => { void confirmar(); }}
      />
    </div>
  );
}

export function DetalleAppsConAcceso({ a, showToast }: { a: AppsConAcceso } & Pick<PropsFormularioCajon, 'showToast'>) {
  if (a.error) {
    return <p role="alert" className="pb-6 text-sm font-medium text-destructive text-pretty">No se ha podido cargar la lista. Cierra y vuelve a intentarlo.</p>;
  }
  if (!a.apps) return <p role="status" className="pb-6 text-sm text-muted-foreground">Cargando…</p>;
  if (a.apps.length === 0) return <p className="pb-6 text-sm text-foreground text-pretty">Ninguna app tiene acceso a los datos de tu estudio.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border pb-6">
      {a.apps.map(app => (
        <li key={app.clienteId} className="flex flex-col gap-2 py-3 first:pt-0">
          <span>
            <span className="block text-sm font-semibold text-foreground">{app.nombre}</span>
            <span className="block text-sm text-muted-foreground">Con acceso desde el {cuando(app.otorgadoEn)}</span>
          </span>
          <QuitarAcceso app={app} a={a} onQuitado={() => showToast(`Acceso de ${app.nombre} quitado`)} />
        </li>
      ))}
    </ul>
  );
}
