'use client';

import { useEffect, useState } from 'react';
import { Code2, KeyRound, Mail } from 'lucide-react';
import { useRol, puedeGestionarAppsOAuth, puedeGestionarClavesApi } from '@/lib/permisos';
import { resumenAppsConAcceso } from '@/lib/configuracion/resumenes';
import { seccionDeTarjeta, seccionPorId, tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { hrefDeSeccion } from '@/lib/configuracion/destino';
import { textoFalloConexionSumup } from '@/lib/pos/sumup';
import { GoogleCalendarIcon, KisiIcon, KlaviyoIcon, MailchimpIcon, ZapierIcon, ZoomIcon } from '@/components/icons/brand-icons';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaOtraSeccion, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import {
  AccionesZoom, DetalleAppsConAcceso, DetalleConexionConClave, DetalleConexionOAuth, DetalleZapier,
  FilaConexionConClave, FilaConexionOAuth, FilaZapier, SincronizarGoogleCalendar, SincronizarKlaviyo,
  useAppsConAcceso, useConexionConClave, useConexionOAuth, useZapier,
} from '@/components/configuracion/conexiones';
import { DetalleApiPublica, resumenApiPublica, useApiPublica } from '@/components/configuracion/api-publica';
import { DetalleCobroConTarjeta, FilaCobroConTarjeta, useCobroConTarjeta } from '@/components/configuracion/cobro-con-tarjeta';
import { DetalleDatafono, FilaDatafono } from '@/components/configuracion/datafono';
import { ConectarDatafono } from '@/components/pos/conectar-datafono';
import { useDatafono } from '@/components/pos/use-datafono';
import {
  DetalleGmail, DetalleWhatsapp, FilaGmail, FilaWhatsapp, useGmail, useWhatsapp,
} from '@/components/configuracion/canales-comunicacion';
import { DetallePlataformasExternas, FilasPlataformas } from '@/components/configuracion/plataformas-externas';

// Integraciones: todo lo que Tentare conecta con otras herramientas, en un solo
// sitio (16-oct-2026, petición del fundador).
//
// Una fila por conexión con UN estado (conexiones.tsx), agrupadas por la
// pregunta que se hace la propietaria: cobrar, comunicarte, agenda y
// videollamadas, marketing, plataformas que venden tus clases, y automatizar o
// dar acceso a tus datos (apps y API). Stripe, el datáfono y WhatsApp vivían en
// Cobros y en Cómo me comunico; esas secciones dejan ahora una fila que lleva
// aquí. Gmail (retirado el 1-oct) solo sale a quien lo tiene conectado, para
// desconectarlo. Las anclas de siempre (`#integracion-zoom`, `#integracion-stripe`,
// la vuelta de cada conexión) llevan a su fila; si está conectada, abren su cajón.

const CAJONES = [
  'integracion-stripe', 'datafono', 'integracion-whatsapp', 'integracion-gmail',
  'integracion-google_calendar', 'integracion-zoom', 'integracion-kisi', 'integracion-klaviyo',
  'integracion-mailchimp', 'integracion-zapier', 'aplicaciones-con-acceso', 'plataformas-externas', 'api-publica',
] as const satisfies readonly TarjetaId[];

export function SeccionConexiones({ showToast }: { showToast: (m: string) => void }) {
  const rol = useRol();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  const stripe = useCobroConTarjeta(showToast);
  // El datáfono pregunta a su proveedor (Stripe o SumUp) si está encendido. Se
  // pregunta siempre: un estudio sin Stripe puede tener (o conectar) un SumUp Solo.
  const datafono = useDatafono(true);
  const [conectandoDatafono, setConectandoDatafono] = useState<false | 'inicio' | 'codigo-sumup'>(false);
  const whatsapp = useWhatsapp(showToast);
  const gmail = useGmail();
  const google = useConexionOAuth('GOOGLE_CALENDAR', showToast);
  const zoom = useConexionOAuth('ZOOM', showToast);
  const klaviyo = useConexionOAuth('KLAVIYO', showToast);
  const kisi = useConexionConClave('KISI');
  const mailchimp = useConexionConClave('MAILCHIMP');
  const apps = useAppsConAcceso();
  const zapier = useZapier(apps);
  const api = useApiPublica();
  const e = datafono.estado;
  const datafonoConectado = !!e && e.lector !== null && e.emparejado !== false && (e.proveedor === 'sumup' || stripe.conectado);

  // La vuelta de conectar la cuenta de SumUp: sigue en el código del Solo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const seccion = hrefDeSeccion(seccionDeTarjeta('datafono'));
    if (params.get('sumup_conectado')) {
      showToast('Cuenta de SumUp conectada. Ahora, el código del Solo.');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee window.location.search (?sumup_conectado=1): la URL no existe durante el render en servidor.
      setConectandoDatafono('codigo-sumup');
      window.history.replaceState({}, '', seccion);
    } else if (params.get('sumup_error')) {
      // Un texto fijo por código: nunca lo que venga en la URL.
      showToast(textoFalloConexionSumup(params.get('sumup_error')));
      window.history.replaceState({}, '', seccion);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }
  const props = { showToast, onGuardado: guardado };

  return (
    <>
      <GrupoFilas titulo="Cobrar a tus alumnas">
        <FilaCobroConTarjeta c={stripe} onAbrir={() => abrir('integracion-stripe')} />
        <FilaDatafono d={datafono} stripeConectado={stripe.conectado} onAbrir={() => abrir('datafono')} onConectar={() => setConectandoDatafono('inicio')} />
      </GrupoFilas>

      <GrupoFilas titulo="Escribir a tus alumnas">
        <FilaWhatsapp w={whatsapp} onAbrir={() => abrir('integracion-whatsapp')} />
        <FilaGmail g={gmail} onAbrir={() => abrir('integracion-gmail')} />
        <FilaOtraSeccion
          id="fila-a-comunicacion"
          icono={Mail}
          titulo={tarjetaPorId('integracion-resend').titulo}
          valor={`En «${seccionPorId('comunicacion').titulo}»`}
          seccion="comunicacion"
          ancla="integracion-resend"
        />
      </GrupoFilas>

      <GrupoFilas titulo="Tu agenda y tus clases online">
        <FilaConexionOAuth c={google} logo={<GoogleCalendarIcon size={20} />} onAbrir={() => abrir('integracion-google_calendar')} />
        <FilaConexionOAuth c={zoom} logo={<ZoomIcon size={36} />} onAbrir={() => abrir('integracion-zoom')} />
        <FilaConexionConClave c={kisi} logo={<KisiIcon size={36} />} onAbrir={() => abrir('integracion-kisi')} />
      </GrupoFilas>

      <GrupoFilas titulo="Marketing">
        <FilaConexionOAuth c={klaviyo} logo={<KlaviyoIcon size={20} />} onAbrir={() => abrir('integracion-klaviyo')} />
        <FilaConexionConClave c={mailchimp} logo={<MailchimpIcon size={36} />} onAbrir={() => abrir('integracion-mailchimp')} />
      </GrupoFilas>

      {/* Una fila por plataforma, con su logo, como el resto de conexiones. */}
      <GrupoFilas titulo="Plataformas que venden tus clases">
        <FilasPlataformas onAbrir={() => abrir('plataformas-externas')} />
      </GrupoFilas>

      <GrupoFilas titulo="Automatizar y dar acceso a tus datos">
        <FilaZapier z={zapier} logo={<ZapierIcon size={36} />} onAbrir={() => abrir('integracion-zapier')} />
        {/* Quién puede autorizarlas es quien puede quitarlas (puedeGestionarAppsOAuth). */}
        {puedeGestionarAppsOAuth(rol) && (
          <FilaAjuste id="aplicaciones-con-acceso" icono={KeyRound} valor={resumenAppsConAcceso(apps.apps)} onAbrir={abrir} />
        )}
        {/* Claves de API: solo la propietaria (puedeGestionarClavesApi). La
            sección ya es solo suya; el servidor lo vuelve a comprobar. */}
        {puedeGestionarAppsOAuth(rol) && puedeGestionarClavesApi(rol) && (
          <FilaAjuste id="api-publica" icono={Code2} valor={resumenApiPublica(api)} onAbrir={abrir} />
        )}
      </GrupoFilas>

      {/* Sin conectar no hay nada que gestionar: su acción está en la fila. */}
      <CajonAjuste id="integracion-stripe" abierto={cajon === 'integracion-stripe' && stripe.conectado} onCerrar={cerrar}>
        <DetalleCobroConTarjeta c={stripe} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="datafono" abierto={cajon === 'datafono' && datafonoConectado} onCerrar={cerrar}>
        {/* «Cambiar de datáfono» cierra el cajón antes de abrir el paso a paso: dos diálogos apilados no. */}
        <DetalleDatafono d={datafono} onCambiar={() => { cerrar(); setConectandoDatafono('inicio'); }} onGuardado={guardado} />
      </CajonAjuste>
      {conectandoDatafono && (
        <ConectarDatafono
          direccionEstudio={datafono.estado?.direccion ?? null}
          esTest={datafono.estado?.test ?? false}
          textoVolver="Volver"
          textoFinal="Hecho"
          stripeConectado={stripe.conectado}
          sumup={datafono.estado?.sumup}
          pasoInicial={conectandoDatafono === 'codigo-sumup' ? 'codigo-sumup' : undefined}
          onConectado={datafono.ponerLector}
          onCerrar={() => setConectandoDatafono(false)}
        />
      )}
      {/* Sin conectar y con Meta, no hay nada que pegar: su acción es «Conectar» en la fila. */}
      <CajonAjuste id="integracion-whatsapp" abierto={cajon === 'integracion-whatsapp' && (whatsapp.conectado || !whatsapp.conMeta)} onCerrar={cerrar}>
        <DetalleWhatsapp w={whatsapp} {...props} />
      </CajonAjuste>
      <CajonAjuste id="integracion-gmail" abierto={cajon === 'integracion-gmail' && gmail.conectado} onCerrar={cerrar}>
        <DetalleGmail g={gmail} {...props} />
      </CajonAjuste>
      <CajonAjuste id="integracion-google_calendar" abierto={cajon === 'integracion-google_calendar' && google.conectado} onCerrar={cerrar}>
        <DetalleConexionOAuth c={google} onGuardado={guardado}><SincronizarGoogleCalendar /></DetalleConexionOAuth>
      </CajonAjuste>
      <CajonAjuste id="integracion-zoom" abierto={cajon === 'integracion-zoom' && zoom.conectado} onCerrar={cerrar}>
        <DetalleConexionOAuth c={zoom} onGuardado={guardado}><AccionesZoom /></DetalleConexionOAuth>
      </CajonAjuste>
      <CajonAjuste id="integracion-klaviyo" abierto={cajon === 'integracion-klaviyo' && klaviyo.conectado} onCerrar={cerrar}>
        <DetalleConexionOAuth c={klaviyo} onGuardado={guardado}><SincronizarKlaviyo /></DetalleConexionOAuth>
      </CajonAjuste>
      {/* Las de clave se conectan pegándola: su cajón se abre también sin conectar. */}
      <CajonAjuste id="integracion-kisi" abierto={cajon === 'integracion-kisi'} onCerrar={cerrar}>
        <DetalleConexionConClave c={kisi} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="integracion-mailchimp" abierto={cajon === 'integracion-mailchimp'} onCerrar={cerrar}>
        <DetalleConexionConClave c={mailchimp} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="integracion-zapier" abierto={cajon === 'integracion-zapier' && !!zapier.acceso} onCerrar={cerrar}>
        <DetalleZapier z={zapier} a={apps} onGuardado={guardado} />
      </CajonAjuste>
      <CajonAjuste id="plataformas-externas" abierto={cajon === 'plataformas-externas'} onCerrar={cerrar}>
        <DetallePlataformasExternas showToast={showToast} />
      </CajonAjuste>
      <CajonAjuste id="aplicaciones-con-acceso" abierto={cajon === 'aplicaciones-con-acceso'} onCerrar={cerrar}>
        <DetalleAppsConAcceso a={apps} showToast={showToast} />
      </CajonAjuste>
      <CajonAjuste id="api-publica" abierto={cajon === 'api-publica'} onCerrar={cerrar}>
        <DetalleApiPublica a={api} showToast={showToast} />
      </CajonAjuste>
      {/* El SDK de Meta solo se descarga donde está la fila de WhatsApp. */}
      {whatsapp.script}
    </>
  );
}
