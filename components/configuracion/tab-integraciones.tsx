'use client';

import { useState, useEffect, useId, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Check,
  ExternalLink,
  BellRing,
  Clock,
} from 'lucide-react';
import { EstadoAjuste } from '@/components/configuracion/shell/estado-ajuste';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import { ZoomIcon, GoogleCalendarIcon, MailchimpIcon, ZapierIcon, KisiIcon, KlaviyoIcon } from '@/components/icons/brand-icons';
import { authHeader } from '@/lib/api-client';
import { saludIntegracion, textoSalud } from '@/lib/integraciones/salud';
import type { TipoIntegracion } from '@/lib/types';
import { inputCls, labelCls, btnPrimary, btnSecondary, cardCls } from '@/components/configuracion/estilos';
import { uuidV4 } from '@/lib/utils';
import { seccionDeTarjeta, tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';

type CampoIntegracion = { key: string; label: string; placeholder: string; tipo?: 'text' | 'password' | 'checkbox' };

type CatalogoIntegracion = {
  tipo: TipoIntegracion;
  nombre: string;
  descripcion: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  // El icono de marca ya es un icono de APLICACIÓN — trae su propio fondo de
  // color (Stripe, Resend, WhatsApp, Zoom, Zapier, Kisi, Mailchimp). Se pinta
  // llenando la casilla de 40 px en
  // vez de un glifo de 20 px sobre la placa gris: si no, queda caja dentro de
  // caja y encima se ve más pequeño que el resto.
  placaPropia?: boolean;
  campos: CampoIntegracion[];
  docsUrl?: string;
  categoria?: string;
  proximamente?: boolean;
  // Pasos numerados que se enseñan en el modal ANTES de los campos — cada
  // negocio pega su propia credencial (su propia cuenta de Kisi, su propio
  // número de WhatsApp Business), así que necesita saber dónde conseguirla,
  // no solo un enlace a documentación en inglés.
  instrucciones?: string[];
  // Si está definida, cuando la integración está conectada aparece un botón
  // "Probar conexión" que llama a esta ruta (POST autenticado) — la ruta lee
  // la credencial guardada de ESE estudio y la valida contra la API real.
  probarUrl?: string;
};

// El nombre y la frase de las tarjetas que tienen sitio propio en otra sección
// (WhatsApp y Gmail en Cómo me comunico…) salen de lib/configuracion/secciones.ts: la fila que lleva hasta
// aquí y la tarjeta tienen que llamarse igual.
const deSecciones = (id: TarjetaId) => ({ nombre: tarjetaPorId(id).titulo, descripcion: tarjetaPorId(id).frase });

// El remitente de los correos, WhatsApp y Gmail son filas de «Cómo me comunico»
// desde el 15-sep (v2), con su estado y su cajón: canales-comunicacion.tsx.
const CATALOGO_INTEGRACIONES: CatalogoIntegracion[] = [
  {
    tipo: 'GOOGLE_CALENDAR',
    // Decía "sincroniza las clases con tu calendario" sin más. Es cierto, pero
    // solo cuando ella pulsa "Sincronizar ahora": no hay ningún proceso que
    // empuje una clase nueva, movida o cancelada por su cuenta. Dicho así, se
    // entiende igual que "sincronizado" y espera que se mantenga solo.
    ...deSecciones('integracion-google_calendar'),
    Icon: GoogleCalendarIcon,
    color: '#4285F4',
    bg: '#F5F5F5',
    categoria: 'Calendario',
    campos: [],
  },
  {
    tipo: 'ZOOM',
    // Cableada de verdad (2026-08-20, pedido explícito del fundador):
    // crearReunionZoom() ya tiene llamador — lib/zoom-sync.ts, cron cada
    // 15 min (app/api/cron/zoom-sync/route.ts) — para cada tipo de clase con
    // esOnline=true (Mis clases y citas → Tipos de clase). Antes estaba en
    // "Próximamente" porque conectar Zoom no hacía nada; ya no es el caso.
    ...deSecciones('integracion-zoom'),
    Icon: ZoomIcon,
    placaPropia: true,
    color: '#0B5CFF',
    bg: '#F5F5F5',
    categoria: 'Contenido digital',
    campos: [],
  },
  {
    tipo: 'KISI',
    nombre: 'Kisi',
    descripcion: 'Abre la puerta de tu estudio sola con cada check-in de tus alumnas.',
    Icon: KisiIcon,
    placaPropia: true,
    color: '#4857F7',
    bg: '#EEF0FE',
    categoria: 'Control de acceso',
    campos: [
      { key: 'apiKey', label: 'Clave API', placeholder: 'kisi_xxxxxxxxxxxxxxxx', tipo: 'password' },
      { key: 'lockId', label: 'ID de la cerradura (opcional si solo tienes una)', placeholder: '12345' },
    ],
    instrucciones: [
      'Inicia sesión en tu panel de Kisi (kisi.io).',
      'Arriba a la derecha, haz clic en tu email y entra en "Mi cuenta".',
      'En el menú de la izquierda, entra en "API".',
      'Pulsa "Agregar clave API" (si ya tenías una para Tentare, bórrala antes).',
      'Ponle de nombre "Tentare" y confirma con tu contraseña de Kisi.',
      'Copia la clave que te genera Kisi.',
      'Pégala aquí abajo y pulsa Guardar.',
      'Con Kisi conectado, la puerta se abre sola con cada check-in. Si tu cuenta tiene varias cerraduras, indica también el ID de la puerta del estudio (Panel de Kisi → Cerraduras).',
    ],
    docsUrl: 'https://api.kisi.io/docs',
    probarUrl: '/api/integrations/kisi/probar',
  },
  {
    tipo: 'KLAVIYO',
    nombre: 'Klaviyo',
    // Funciona de verdad, pero igual que Google Calendar: solo cuando ella
    // pulsa. Sin decirlo, "sincroniza" se lee como continuo.
    descripcion: 'Envía a tu cuenta de Klaviyo las alumnas que han consentido marketing por email, cada vez que pulses «Sincronizar ahora». Se conecta entrando con tu cuenta; no tienes que copiar ninguna clave.',
    Icon: KlaviyoIcon,
    color: '#232325',
    bg: '#F5F5F5',
    categoria: 'Marketing',
    campos: [],
  },
  {
    tipo: 'ZAPIER',
    nombre: 'Zapier',
    descripcion: 'Conecta Tentare con miles de apps: crea reservas, sincroniza alumnas o avisa por Slack cuando pasa algo en tu estudio. La conexión se autoriza desde Zapier, no desde aquí.',
    Icon: ZapierIcon,
    placaPropia: true,
    color: '#FF4F00',
    bg: '#FFF1EB',
    categoria: 'Automatización',
    campos: [],
  },
  {
    tipo: 'MAILCHIMP',
    nombre: 'Mailchimp',
    // Sin OAuth: Mailchimp no ofrece registro de app de terceros self-service
    // (a diferencia de Klaviyo/Google) — la propietaria pega su propia clave
    // API, igual que ya hace con Kisi. Solo sube cuando ella pulsa
    // «Sincronizar ahora», nada se mantiene solo.
    descripcion: 'Envía a tu audiencia de Mailchimp las alumnas que han consentido marketing por email, cada vez que pulses «Sincronizar ahora». Pega tu clave API — no hace falta autorizar nada más.',
    Icon: MailchimpIcon,
    placaPropia: true,
    color: '#FFE01B',
    bg: '#FFF9E0',
    categoria: 'Marketing',
    campos: [
      { key: 'apiKey', label: 'Clave API', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us6', tipo: 'password' },
      { key: 'audienceId', label: 'ID de audiencia', placeholder: 'a1b2c3d4e5' },
      { key: 'serverPrefix', label: 'Prefijo del servidor', placeholder: 'us6' },
    ],
    instrucciones: [
      'Entra en tu cuenta de Mailchimp → icono de tu perfil (abajo a la izquierda) → Extras → Claves API.',
      'Pulsa "Crear una clave API" y cópiala. El prefijo de servidor es la parte final de esa clave (después del guion, ej. "...-us6") — también lo ves en la URL de tu panel: https://us6.admin.mailchimp.com/ → prefijo "us6".',
      'Ve a Audiencia → All contacts → Settings → Audience name and defaults, y copia el "Audience ID".',
      'Pega aquí los tres datos y pulsa Guardar.',
    ],
    docsUrl: 'https://mailchimp.com/help/about-api-keys/',
    probarUrl: '/api/integrations/mailchimp/probar',
  },
];

// Cuando una integración no está lista, lo que faltaba era una variable de
// entorno del SERVIDOR — y eso se le enseñaba tal cual a la dueña del estudio:
// "Falta configurar NEXT_PUBLIC_ZOOM_CLIENT_ID". Ella lleva un estudio de
// pilates; eso no es un mensaje para ella, y además no puede hacer nada al
// respecto porque no es suyo, es nuestro. Se le dice lo que sí le sirve saber, y
// el nombre de la variable queda en el `title` para quien opera la plataforma.
//
// El estado —«No disponible todavía»— ya lo dice la pastilla de la tarjeta; aquí
// solo lo que añade: que no le toca hacer nada.
function NoDisponibleTodavia({ variable }: { variable: string }) {
  return (
    <p className="text-xs text-muted-foreground" title={`Falta configurar ${variable} en el servidor`}>
      Lo estamos terminando de conectar por nuestro lado; no tienes que hacer nada.
    </p>
  );
}

// La sección que pinta una tarjeta, para dejar la URL limpia al volver de una
// conexión. Sale de lib/configuracion/secciones.ts: si la tarjeta cambia de
// sección, la vuelta la sigue sin tocar nada aquí.
const urlDeLaSeccion = (tarjeta: TarjetaId) => hrefDeSeccion(seccionDeTarjeta(tarjeta));

/**
 * Las integraciones de «Conexiones». Stripe es una fila de «Cobros y facturas»
 * (cobro-con-tarjeta.tsx), y el remitente de los correos, WhatsApp y Gmail son
 * filas de «Cómo me comunico» (canales-comunicacion.tsx). `tipos` dice cuáles
 * pinta ESTA sección, y solo esas piden sus datos y leen su aviso de vuelta en la URL.
 *
 * `children` va entre las tarjetas principales y «Más integraciones» (en
 * Conexiones, «Aplicaciones con acceso»).
 */
export function TabIntegraciones({ showToast, tipos, children }: {
  showToast: (m: string) => void;
  tipos: readonly TipoIntegracion[];
  children?: ReactNode;
}) {
  // Declarado en el componente, NO dentro del modal: ese modal es una IIFE
  // dentro del JSX y un hook no puede llamarse ahí. El sufijo por campo.key
  // hace único cada id.
  const uid = useId();
  const { studio, updateStudio, integraciones, upsertIntegracion } = useStudio();
  const pinta = (tipo: TipoIntegracion) => tipos.includes(tipo);
  const pintaZapier = pinta('ZAPIER');
  const [editando, setEditando] = useState<TipoIntegracion | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [probando, setProbando] = useState<TipoIntegracion | null>(null);
  // Kisi/WhatsApp: "Probar conexión" contra la credencial que ESE estudio
  // pegó y guardó (no hay secreto de plataforma que consultar).
  const probarCampos = async (cat: CatalogoIntegracion) => {
    if (!cat.probarUrl) return;
    setProbando(cat.tipo);
    try {
      const res = await fetch(cat.probarUrl, { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok && data.ok ? `Conexión con ${cat.nombre} correcta ✓` : `Error: ${data.error ?? 'no se pudo conectar'}`);
    } finally {
      setProbando(null);
    }
  };

  const getIntegracion = (tipo: TipoIntegracion) => integraciones.find(i => i.tipo === tipo) ?? null;

  // La vuelta de cada OAuth va a esta misma app.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== 'undefined' ? window.location.origin : '');

  // Google Calendar: OAuth real (ver lib/google-calendar.ts). A diferencia de
  // Stripe, desconectar y sincronizar pasan por rutas de servidor
  // autenticadas (no solo estado local) — ver app/api/integrations/google-calendar/*.
  const googleConectado = !!studio?.googleCalendarEmail;
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const puedeConectarGoogle = !!(googleClientId && studio);
  async function conectarGoogle() {
    if (!googleClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      // H-1: same-origin (el valor por defecto, explícito para que no se cambie): esta respuesta fija la cookie HttpOnly del flujo.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'google' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Google'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/google-calendar/callback`);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email');
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
  }
  // CONGELADO (feature-freeze PMF): se quitó la generación del token de kiosko
  // (estado + fetch a /api/kiosk/token). La API sigue viva pero sin llamadas.
  // Reactivar = ver lib/frozen-features.ts.

  const [sincronizando, setSincronizando] = useState(false);

  useEffect(() => {
    if (!pinta('GOOGLE_CALENDAR')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar_connected')) {
      showToast('Google Calendar conectado');
      window.history.replaceState({}, '', urlDeLaSeccion('integracion-google_calendar'));
    } else if (params.get('google_calendar_error')) {
      showToast(`Error al conectar Google Calendar: ${params.get('google_calendar_error')}`);
      window.history.replaceState({}, '', urlDeLaSeccion('integracion-google_calendar'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarGoogle = async () => {
    const res = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      const upd = await updateStudio({ googleCalendarEmail: null });
      showToast(upd.ok ? 'Google Calendar desconectado' : upd.error);
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const sincronizarGoogle = async () => {
    setSincronizando(true);
    try {
      const res = await fetch('/api/integrations/google-calendar/sync', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) { showToast(`Error al sincronizar: ${data.error}`); return; }
      showToast(`Sincronizado: ${data.creadas} clases nuevas, ${data.actualizadas} actualizadas, ${data.borradas} eliminadas`);
    } finally {
      setSincronizando(false);
    }
  };

  // Zoom: mismo patrón OAuth que Google Calendar/Gmail, pero con una app de
  // Zoom Marketplace propia (NEXT_PUBLIC_ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET) —
  // ver lib/zoom.ts. Sustituye a la cuenta única de operador de antes.
  const zoomConectado = !!studio?.zoomEmail;
  const zoomClientId = process.env.NEXT_PUBLIC_ZOOM_CLIENT_ID;
  const puedeConectarZoom = !!(zoomClientId && studio);
  async function conectarZoom() {
    if (!zoomClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      // H-1: same-origin (el valor por defecto, explícito para que no se cambie): esta respuesta fija la cookie HttpOnly del flujo.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'zoom' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Zoom'); return; }
    const { state } = await res.json() as { state: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/zoom/callback`);
    // v2/authorize (marketplace.zoom.us), NO el endpoint legacy zoom.us/oauth/authorize:
    // verificado en vivo el 2026-08-20 — el legacy devuelve "Redirección no válida (4.700)"
    // para cualquier app que no esté publicada en el Marketplace (nuestro caso: solo
    // instalable desde este botón, nunca desde el directorio público). v2/authorize
    // funciona sin exigir esa publicación, con el mismo Client ID/redirect_uri.
    window.location.href = `https://marketplace.zoom.us/v2/authorize?response_type=code&client_id=${zoomClientId}&redirect_uri=${redirect}&state=${encodeURIComponent(state)}`;
  }

  useEffect(() => {
    if (!pinta('ZOOM')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_connected')) {
      showToast('Zoom conectado');
      window.history.replaceState({}, '', urlDeLaSeccion('integracion-zoom'));
    } else if (params.get('zoom_error')) {
      showToast(`Error al conectar Zoom: ${params.get('zoom_error')}`);
      window.history.replaceState({}, '', urlDeLaSeccion('integracion-zoom'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarZoom = async () => {
    const res = await fetch('/api/integrations/zoom/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      const upd = await updateStudio({ zoomEmail: null });
      showToast(upd.ok ? 'Zoom desconectado' : upd.error);
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const probarZoomConexion = async () => {
    setProbando('ZOOM');
    try {
      const res = await fetch('/api/integrations/zoom/probar', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok && data.ok ? 'Conexión con Zoom correcta ✓' : `Error: ${data.error ?? 'no se pudo conectar'}`);
    } finally {
      setProbando(null);
    }
  };

  // Klaviyo (paso 7, docs/marketing-integrations-arquitectura.md §6): mismo
  // patrón OAuth que Google/Zoom, con una diferencia — Klaviyo exige PKCE, así
  // que /api/integrations/oauth-state también devuelve codeChallenge para
  // este proveedor (ver ese route.ts). ⚠️ NO VERIFICADO end-to-end: sin
  // KLAVIYO_CLIENT_ID/SECRET reales (solo Marcos puede registrar la app OAuth
  // en developers.klaviyo.com), este flujo nunca se ha probado contra Klaviyo
  // de verdad — mismo tipo de límite que Stripe Fase 3.
  const klaviyoConectado = !!studio?.klaviyoAccountName;
  const klaviyoClientId = process.env.NEXT_PUBLIC_KLAVIYO_CLIENT_ID;
  const puedeConectarKlaviyo = !!(klaviyoClientId && studio);
  async function conectarKlaviyo() {
    if (!klaviyoClientId) return;
    const res = await fetch('/api/integrations/oauth-state', {
      method: 'POST',
      // H-1: same-origin (el valor por defecto, explícito para que no se cambie): esta respuesta fija la cookie HttpOnly del flujo.
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider: 'klaviyo' }),
    });
    if (!res.ok) { showToast('No se pudo iniciar la conexión con Klaviyo'); return; }
    const { state, codeChallenge } = await res.json() as { state: string; codeChallenge: string };
    const redirect = encodeURIComponent(`${appUrl}/api/integrations/klaviyo/callback`);
    const scope = encodeURIComponent('accounts:read lists:write profiles:write subscriptions:write');
    window.location.href = `https://www.klaviyo.com/oauth/authorize?response_type=code&client_id=${klaviyoClientId}&redirect_uri=${redirect}&scope=${scope}&state=${encodeURIComponent(state)}&code_challenge_method=S256&code_challenge=${encodeURIComponent(codeChallenge)}`;
  }

  useEffect(() => {
    if (!pinta('KLAVIYO')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('klaviyo_connected')) {
      showToast('Klaviyo conectado');
      window.history.replaceState({}, '', urlDeLaSeccion('mas-integraciones'));
    } else if (params.get('klaviyo_error')) {
      showToast(`Error al conectar Klaviyo: ${params.get('klaviyo_error')}`);
      window.history.replaceState({}, '', urlDeLaSeccion('mas-integraciones'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const desconectarKlaviyo = async () => {
    const res = await fetch('/api/integrations/klaviyo/disconnect', { method: 'POST', headers: await authHeader() });
    if (res.ok) {
      const upd = await updateStudio({ klaviyoAccountName: null });
      showToast(upd.ok ? 'Klaviyo desconectado' : upd.error);
    } else {
      const data = await res.json().catch(() => null);
      showToast(`No se pudo desconectar: ${data?.error ?? 'error desconocido'}`);
    }
  };

  const [sincronizandoKlaviyo, setSincronizandoKlaviyo] = useState(false);
  const sincronizarKlaviyo = async () => {
    setSincronizandoKlaviyo(true);
    try {
      const res = await fetch('/api/integrations/klaviyo/sync', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok ? `${data.sincronizadas} alumnas sincronizadas con Klaviyo` : `Error: ${data.error ?? 'no se pudo sincronizar'}`);
    } finally {
      setSincronizandoKlaviyo(false);
    }
  };

  // Mailchimp: sin OAuth — clave API pegada por la propietaria (mismo
  // patrón que Kisi/WhatsApp, ver lib/mailchimp.ts). Conectar/Gestionar y
  // Probar conexión los da el modal genérico (abrirConfig/guardar/
  // probarCampos, más abajo); esto solo añade el botón "Sincronizar ahora",
  // que no existe en Kisi/WhatsApp.
  const [sincronizandoMailchimp, setSincronizandoMailchimp] = useState(false);
  const sincronizarMailchimp = async () => {
    setSincronizandoMailchimp(true);
    try {
      const res = await fetch('/api/integrations/mailchimp/sync', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      showToast(res.ok ? `${data.sincronizadas} alumnas sincronizadas con Mailchimp` : `Error: ${data.error ?? 'no se pudo sincronizar'}`);
    } finally {
      setSincronizandoMailchimp(false);
    }
  };

  // Zapier: al revés que el resto — Tentare es el SERVIDOR OAuth, así que la
  // conexión la inicia Zapier (o quien construye el Zap), nunca un botón de
  // aquí. Esta tarjeta solo refleja el estado (GET /api/oauth/consentimientos,
  // lib/oauth-server.ts) y permite revocar el acceso.
  const [zapierConsentimiento, setZapierConsentimiento] = useState<{ scopes: string[]; otorgadoEn: string } | null | undefined>(undefined);
  useEffect(() => {
    // Solo donde se pinta Zapier: en las otras secciones no hay nada que enseñar con esto.
    if (!pintaZapier) return;
    let cancelado = false;
    (async () => {
      const headers = await authHeader();
      const res = await fetch('/api/oauth/consentimientos', { headers });
      if (!res.ok || cancelado) { if (!cancelado) setZapierConsentimiento(null); return; }
      const data = await res.json();
      const zapier = (data.apps ?? []).find((a: { clienteId: string }) => a.clienteId === 'zapier');
      if (!cancelado) setZapierConsentimiento(zapier ? { scopes: zapier.scopes, otorgadoEn: zapier.otorgadoEn } : null);
    })();
    return () => { cancelado = true; };
  }, [pintaZapier]);
  const zapierConectado = !!zapierConsentimiento;
  const [revocandoZapier, setRevocandoZapier] = useState(false);
  const revocarZapier = async () => {
    setRevocandoZapier(true);
    try {
      const res = await fetch('/api/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ clienteId: 'zapier' }),
      });
      if (!res.ok) { showToast('No se pudo revocar el acceso'); return; }
      setZapierConsentimiento(null);
      showToast('Acceso de Zapier revocado');
    } finally {
      setRevocandoZapier(false);
    }
  };

  // Las credenciales ya no viajan en el arranque del panel, así que se piden al
  // abrir el modal. `configOriginal` guarda lo que había, para saber después si
  // de verdad se cambió algo (y solo entonces reiniciar la salud).
  const [configOriginal, setConfigOriginal] = useState<Record<string, string>>({});
  const [abriendo, setAbriendo] = useState<TipoIntegracion | null>(null);

  const abrirConfig = async (cat: CatalogoIntegracion) => {
    setAbriendo(cat.tipo);
    try {
      const res = await fetch(`/api/integrations/config?tipo=${cat.tipo}`, { headers: await authHeader() });
      // ⚠️ Si no se pueden leer, NO se abre el modal. Abrirlo en blanco es el
      // modo de fallo caro: la propietaria vería sus campos vacíos, pulsaría
      // Guardar y se llevaría por delante un token que estaba bien.
      if (!res.ok) { showToast('No se pudieron cargar las credenciales. Inténtalo otra vez.'); return; }
      const data = (await res.json()) as { config?: Record<string, string> };
      const cfg = data.config ?? {};
      setConfigOriginal(cfg);
      setForm(cfg);
      setEditando(cat.tipo);
    } catch {
      showToast('No se pudieron cargar las credenciales. Inténtalo otra vez.');
    } finally {
      setAbriendo(null);
    }
  };

  // El modal NO se cierra si no se ha guardado: cerrarlo se lleva por delante
  // las credenciales que acaba de pegar, y encima diciendo «conectado».
  const guardar = async (cat: CatalogoIntegracion) => {
    // Un checkbox (p.ej. "plantilla aprobada") no cuenta como credencial: sin
    // esto, marcarlo sin haber pegado token/phoneId activaría la integración
    // como si estuviera conectada.
    const rellenos = cat.campos.filter(c => c.tipo !== 'checkbox').some(c => (form[c.key] ?? '').trim() !== '');
    const res = await upsertIntegracion(cat.tipo, rellenos, form, configOriginal);
    if (!res.ok) { showToast(res.error); return; }
    setEditando(null);
    showToast(`${cat.nombre} ${rellenos ? 'conectado' : 'actualizado'}`);
  };

  const desconectar = async (cat: CatalogoIntegracion) => {
    const res = await upsertIntegracion(cat.tipo, false, {}, configOriginal);
    if (!res.ok) { showToast(res.error); return; }
    setEditando(null);
    showToast(`${cat.nombre} desconectado`);
  };

  const [avisado, setAvisado] = useState<Set<TipoIntegracion>>(new Set());
  const avisarme = (cat: CatalogoIntegracion) => {
    dbInsertSoporteSolicitud({
      // Clave primaria de la fila de soporte, no se pinta en ningún sitio:
      // randomUUID da unicidad sin depender del reloj ni de Math.random.
      // `uuidV4()` y no `crypto.randomUUID()`: este componente es de cliente y
      // corre en el Safari del iPad de recepción, donde `randomUUID` exige
      // contexto seguro y Safari >=15.4. El helper ya trae el fallback real.
      id: uuidV4(),
      tipo: 'MEJORA',
      mensaje: `Quiero que se avise cuando esté disponible la integración con ${cat.nombre}.`,
      contacto: null,
      creadoEn: new Date().toISOString(),
    });
    setAvisado(prev => new Set(prev).add(cat.tipo));
    showToast(`Te avisaremos cuando ${cat.nombre} esté disponible`);
  };

  // Cada integración es su propia tarjeta con ancla (`#integracion-zoom`):
  // ahí llevan los enlaces y la vuelta de cada conexión.
  // `Titulo` baja a h4 dentro de «Más integraciones», que ya pone su h3.
  const pintarTarjeta = (cat: CatalogoIntegracion, Titulo: 'h3' | 'h4') => {
          const intg = getIntegracion(cat.tipo);
          // La salud SOLO aplica a las que viven en `integraciones` (Kisi,
          // Mailchimp). Las de OAuth (Google, Zoom...) no tienen fila aquí, así
          // que salen APAGADA y la tarjeta queda igual que antes.
          const salud = saludIntegracion(intg && {
            activo: intg.activo, ultimoOkEn: intg.ultimoOkEn,
            ultimoError: intg.ultimoError, ultimoErrorEn: intg.ultimoErrorEn,
          });
          const fallando = salud.estado === 'FALLANDO';
          const lineaSalud = textoSalud(salud);
          const conectado = cat.tipo === 'GOOGLE_CALENDAR' ? googleConectado : cat.tipo === 'ZOOM' ? zoomConectado : cat.tipo === 'KLAVIYO' ? klaviyoConectado : cat.tipo === 'ZAPIER' ? zapierConectado : !!intg?.activo;
          // Sin la clave OAuth en el servidor no hay nada que conectar: ese es el
          // ÚNICO estado. Antes la pastilla decía «No conectado» y debajo
          // «Todavía no disponible» — ¿lo conecto yo o no puedo? Mismas
          // condiciones que eligen `NoDisponibleTodavia` más abajo.
          const noDisponible = !conectado && (
            (cat.tipo === 'GOOGLE_CALENDAR' && !puedeConectarGoogle)
            || (cat.tipo === 'ZOOM' && !puedeConectarZoom)
            || (cat.tipo === 'KLAVIYO' && !puedeConectarKlaviyo)
          );
          return (
            <section
              key={cat.tipo}
              id={`integracion-${cat.tipo.toLowerCase()}`}
              aria-labelledby={`integracion-${cat.tipo.toLowerCase()}-titulo`}
              className={cn(cardCls, 'p-4 flex flex-col scroll-mt-32')}
            >
              <div className="flex items-start gap-3">
                {/* El logo en placa neutra y en grises. A color (Stripe morado,
                    WhatsApp verde, Gmail multicolor) era lo más saturado de
                    Configuración y no le dice nada a la propietaria; a color se
                    queda en su ventana de configuración. */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-border bg-muted">
                  <span className="flex grayscale" aria-hidden>
                    <cat.Icon size={cat.placaPropia ? 40 : 22} style={cat.placaPropia ? undefined : { color: 'var(--foreground)' }} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Titulo
                      id={`integracion-${cat.tipo.toLowerCase()}-titulo`}
                      tabIndex={-1}
                      className="text-[14px] font-semibold text-foreground outline-none"
                    >
                      {cat.nombre}
                    </Titulo>
                    {cat.proximamente ? (
                      <EstadoAjuste tono="pendiente">Próximamente</EstadoAjuste>
                    ) : noDisponible ? (
                      <EstadoAjuste tono="neutro" icono={Clock}>No disponible todavía</EstadoAjuste>
                    ) : (
                      // Verde SOLO si el servicio respondió la última vez. Con
                      // el token caducado esto seguía diciendo «Conectado»
                      // mientras las clientas dejaban de recibir nada.
                      <EstadoAjuste tono={fallando ? 'problema' : conectado ? 'activo' : 'neutro'}>
                        {fallando ? 'Con problemas' : conectado ? 'Conectado' : 'No conectado'}
                      </EstadoAjuste>
                    )}
                  </div>
                  {cat.categoria && <p className="text-xs text-muted-foreground mt-0.5">{cat.categoria}</p>}
                  <p className="text-[12px] text-muted-foreground mt-1 leading-snug">{cat.descripcion}</p>
                  {lineaSalud && (
                    <p className={cn(
                      'text-xs mt-1.5 leading-snug',
                      lineaSalud.tono === 'error' ? 'text-destructive font-semibold'
                        : lineaSalud.tono === 'ok' ? 'text-success' : 'text-muted-foreground',
                    )}>
                      {lineaSalud.texto}
                    </p>
                  )}
                  {cat.tipo === 'ZOOM' && zoomConectado && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                      Importante: en zoom.us → Configuración, desactiva &ldquo;Usar ID de reunión
                      personal (PMI) al programar&rdquo; — con PMI activado, todas las clases
                      compartirían la misma sala en vez de tener cada una la suya. Tu cuenta
                      de Zoom necesita un plan de pago para crear reuniones de más de 40 minutos.
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                {cat.proximamente ? (
                  <button
                    onClick={() => avisarme(cat)}
                    disabled={avisado.has(cat.tipo)}
                    className={cn(btnSecondary, avisado.has(cat.tipo) && 'opacity-50')}
                  >
                    <BellRing size={14} /> {avisado.has(cat.tipo) ? 'Ya te avisaremos' : 'Avísame cuando esté disponible'}
                  </button>
                ) : cat.tipo === 'GOOGLE_CALENDAR' ? (
                  googleConectado ? (
                    <>
                      <button onClick={sincronizarGoogle} disabled={sincronizando} className={cn(btnPrimary, sincronizando && 'opacity-50')}>
                        {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
                      </button>
                      <button onClick={desconectarGoogle} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : puedeConectarGoogle ? (
                    <button type="button" onClick={conectarGoogle} className={cn(btnPrimary, 'no-underline')}>Conectar con Google</button>
                  ) : (
                    <NoDisponibleTodavia variable="NEXT_PUBLIC_GOOGLE_CLIENT_ID" />
                  )
                ) : cat.tipo === 'ZOOM' ? (
                  zoomConectado ? (
                    <>
                      <button onClick={probarZoomConexion} disabled={probando === 'ZOOM'} className={cn(btnSecondary, probando === 'ZOOM' && 'opacity-50')}>
                        {probando === 'ZOOM' ? 'Probando…' : 'Probar conexión'}
                      </button>
                      <button onClick={desconectarZoom} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : puedeConectarZoom ? (
                    <button type="button" onClick={conectarZoom} className={cn(btnPrimary, 'no-underline')}>Conectar cuenta de Zoom</button>
                  ) : (
                    <NoDisponibleTodavia variable="NEXT_PUBLIC_ZOOM_CLIENT_ID" />
                  )
                ) : cat.tipo === 'KLAVIYO' ? (
                  klaviyoConectado ? (
                    <>
                      <button onClick={sincronizarKlaviyo} disabled={sincronizandoKlaviyo} className={cn(btnPrimary, sincronizandoKlaviyo && 'opacity-50')}>
                        {sincronizandoKlaviyo ? 'Sincronizando…' : 'Sincronizar ahora'}
                      </button>
                      <button onClick={desconectarKlaviyo} className={btnSecondary}>Desconectar</button>
                    </>
                  ) : puedeConectarKlaviyo ? (
                    <button type="button" onClick={conectarKlaviyo} className={cn(btnPrimary, 'no-underline')}>Conectar con Klaviyo</button>
                  ) : (
                    <NoDisponibleTodavia variable="NEXT_PUBLIC_KLAVIYO_CLIENT_ID" />
                  )
                ) : cat.tipo === 'MAILCHIMP' ? (
                  // Modal genérico de campos (Conectar/Gestionar) + Probar
                  // conexión, igual que Kisi — solo se añade el
                  // botón de sincronización manual, que esos no tienen.
                  <>
                    <button onClick={() => abrirConfig(cat)} disabled={abriendo === cat.tipo} className={cn(conectado ? btnSecondary : btnPrimary, abriendo === cat.tipo && 'opacity-60')}>
                      {conectado ? 'Gestionar' : 'Conectar'}
                    </button>
                    {conectado && (
                      <button onClick={sincronizarMailchimp} disabled={sincronizandoMailchimp} className={cn(btnPrimary, sincronizandoMailchimp && 'opacity-50')}>
                        {sincronizandoMailchimp ? 'Sincronizando…' : 'Sincronizar ahora'}
                      </button>
                    )}
                    {conectado && cat.probarUrl && (
                      <button onClick={() => probarCampos(cat)} disabled={probando === cat.tipo} className={cn(btnSecondary, probando === cat.tipo && 'opacity-50')}>
                        {probando === cat.tipo ? 'Probando…' : 'Probar conexión'}
                      </button>
                    )}
                  </>
                ) : cat.tipo === 'ZAPIER' ? (
                  zapierConectado ? (
                    <button onClick={revocarZapier} disabled={revocandoZapier} className={cn(btnSecondary, revocandoZapier && 'opacity-50')}>
                      {revocandoZapier ? 'Revocando…' : 'Revocar acceso'}
                    </button>
                  ) : (
                    <a href="https://zapier.com/apps/tentare/integrations" target="_blank" rel="noopener noreferrer"
                      className={cn(btnPrimary, 'no-underline')}>
                      Ir a Zapier <ExternalLink size={12} />
                    </a>
                  )
                ) : (
                  <>
                    <button onClick={() => abrirConfig(cat)} disabled={abriendo === cat.tipo} className={cn(conectado ? btnSecondary : btnPrimary, abriendo === cat.tipo && 'opacity-60')}>
                      {conectado ? 'Gestionar' : 'Conectar'}
                    </button>
                    {conectado && cat.probarUrl && (
                      <button onClick={() => probarCampos(cat)} disabled={probando === cat.tipo} className={cn(btnSecondary, probando === cat.tipo && 'opacity-50')}>
                        {probando === cat.tipo ? 'Probando…' : 'Probar conexión'}
                      </button>
                    )}
                    {cat.docsUrl && (
                      <a href={cat.docsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                        Docs <ExternalLink size={11} />
                      </a>
                    )}
                  </>
                )}
              </div>
            </section>
          );
  };

  // Lo que casi ningún estudio necesita el primer día, aparte y con su título:
  // la puerta (Kisi), las listas de marketing y Zapier.
  const MAS_INTEGRACIONES = new Set<TipoIntegracion>(['KISI', 'KLAVIYO', 'ZAPIER', 'MAILCHIMP']);

  const principales = CATALOGO_INTEGRACIONES.filter(c => pinta(c.tipo) && !MAS_INTEGRACIONES.has(c.tipo));
  const mas = CATALOGO_INTEGRACIONES.filter(c => pinta(c.tipo) && MAS_INTEGRACIONES.has(c.tipo));

  return (
    <div className="space-y-5">
      {principales.length > 0 && (
        // Una sola tarjeta va al ancho del resto de tarjetas de su sección; dos o
        // más, en rejilla.
        <div className={cn('grid grid-cols-1 gap-3', principales.length > 1 ? 'max-w-3xl @xl/config:grid-cols-2' : 'max-w-2xl')}>
          {principales.map(cat => pintarTarjeta(cat, 'h3'))}
          {/* CONGELADO (feature-freeze PMF): se quitó la tarjeta "Kiosko de check-in"
              (generación del token del dispositivo). La ruta /api/kiosk/token sigue
              existiendo pero ya no se llama desde el frontend. Ver lib/frozen-features.ts. */}
        </div>
      )}

      {children}

      {mas.length > 0 && (
        <TarjetaAjuste id="mas-integraciones" marco={false} className="max-w-3xl">
          <div className="grid grid-cols-1 gap-3 @xl/config:grid-cols-2">
            {mas.map(cat => pintarTarjeta(cat, 'h4'))}
          </div>
        </TarjetaAjuste>
      )}

      {/* Config modal */}
      {editando && (() => {
        const cat = CATALOGO_INTEGRACIONES.find(c => c.tipo === editando)!;
        const conectado = !!getIntegracion(cat.tipo)?.activo;
        return (
          <Dialog open onOpenChange={() => setEditando(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className={cn('w-7 h-7 rounded-lg flex items-center justify-center', cat.placaPropia && 'overflow-hidden')}
                    style={cat.placaPropia ? undefined : { backgroundColor: cat.bg }}>
                    <cat.Icon size={cat.placaPropia ? 28 : 18} style={cat.placaPropia ? undefined : { color: cat.color }} />
                  </span>
                  Configurar {cat.nombre}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {cat.instrucciones && cat.instrucciones.length > 0 && (
                  <ol className="space-y-1.5 text-[12px] text-muted-foreground bg-muted/50 rounded-lg p-3 list-decimal list-inside">
                    {cat.instrucciones.map((paso, i) => <li key={i}>{paso}</li>)}
                  </ol>
                )}
                {cat.campos.map(campo => campo.tipo === 'checkbox' ? (
                  <label key={campo.key} htmlFor={`${uid}-${campo.key}`} className="flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
                    <input
                      id={`${uid}-${campo.key}`}
                      type="checkbox"
                      checked={form[campo.key] === 'true'}
                      onChange={e => setForm(p => ({ ...p, [campo.key]: e.target.checked ? 'true' : 'false' }))}
                    />
                    {campo.label}
                  </label>
                ) : (
                  <div key={campo.key}>
                    <label htmlFor={`${uid}-${campo.key}`} className={labelCls}>{campo.label}</label>
                    <input
                      id={`${uid}-${campo.key}`}
                      className={inputCls}
                      type={campo.tipo ?? 'text'}
                      value={form[campo.key] ?? ''}
                      placeholder={campo.placeholder}
                      onChange={e => setForm(p => ({ ...p, [campo.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  {conectado ? (
                    <button onClick={() => desconectar(cat)} className="text-[13px] font-medium text-destructive hover:underline">
                      Desconectar
                    </button>
                  ) : <span />}
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(null)} className={btnSecondary}>Cancelar</button>
                    <button onClick={() => guardar(cat)} className={btnPrimary}>
                      <Check size={14} /> Guardar
                    </button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
