'use client';

import { Fragment, type ReactNode } from 'react';
import { CreditCard, KeyRound, MessageCircle } from 'lucide-react';
import { useRol, puedeGestionarAppsOAuth } from '@/lib/permisos';
import { agruparConexiones, resumenAppsConAcceso, type ResumenFila } from '@/lib/configuracion/resumenes';
import { seccionPorId, tarjetaPorId, type TarjetaId } from '@/lib/configuracion/secciones';
import { GoogleCalendarIcon, KisiIcon, KlaviyoIcon, MailchimpIcon, ZapierIcon, ZoomIcon } from '@/components/icons/brand-icons';
import { CajonAjuste, useCajonAbierto } from '@/components/configuracion/shell/cajon-ajuste';
import { FilaAjuste, FilaOtraSeccion, GrupoFilas } from '@/components/configuracion/shell/fila-ajuste';
import {
  AccionesZoom, DetalleAppsConAcceso, DetalleConexionConClave, DetalleConexionOAuth, DetalleZapier,
  FilaConexionConClave, FilaConexionOAuth, FilaZapier, SincronizarGoogleCalendar, SincronizarKlaviyo,
  useAppsConAcceso, useConexionConClave, useConexionOAuth, useZapier,
} from '@/components/configuracion/conexiones';

// Conexiones: Tentare con otras herramientas que ya usas (15-sep, v2).
//
// Una fila por conexión con UN estado (conexiones.tsx), agrupadas por cómo
// están: lo que falla arriba, luego lo conectado y lo que falta por conectar
// (`agruparConexiones`). Stripe, WhatsApp y Gmail no se repiten aquí: viven en
// Cobros y facturas y en Cómo me comunico, y aquí solo hay una fila que lleva.
//
// Las anclas de siempre (`#integracion-zoom`, y la vuelta de cada conexión)
// llevan a su fila; si está conectada, abren su cajón.

const CAJONES = [
  'integracion-google_calendar', 'integracion-zoom', 'integracion-kisi', 'integracion-klaviyo',
  'integracion-mailchimp', 'integracion-zapier', 'aplicaciones-con-acceso',
] as const satisfies readonly TarjetaId[];

export function SeccionConexiones({ showToast }: { showToast: (m: string) => void }) {
  const rol = useRol();
  const { cajon, abrir, cerrar } = useCajonAbierto(CAJONES);
  const google = useConexionOAuth('GOOGLE_CALENDAR', showToast);
  const zoom = useConexionOAuth('ZOOM', showToast);
  const klaviyo = useConexionOAuth('KLAVIYO', showToast);
  const kisi = useConexionConClave('KISI');
  const mailchimp = useConexionConClave('MAILCHIMP');
  const apps = useAppsConAcceso();
  const zapier = useZapier(apps);

  function guardado(texto: string) {
    cerrar();
    showToast(texto);
  }

  // En el orden de secciones.ts; `agruparConexiones` las reparte por estado.
  const filas: { id: TarjetaId; resumen: ResumenFila | null; fila: ReactNode }[] = [
    { id: 'integracion-google_calendar', resumen: google.resumen, fila: <FilaConexionOAuth c={google} logo={<GoogleCalendarIcon size={20} />} onAbrir={() => abrir('integracion-google_calendar')} /> },
    { id: 'integracion-zoom', resumen: zoom.resumen, fila: <FilaConexionOAuth c={zoom} logo={<ZoomIcon size={36} />} onAbrir={() => abrir('integracion-zoom')} /> },
    { id: 'integracion-kisi', resumen: kisi.resumen, fila: <FilaConexionConClave c={kisi} logo={<KisiIcon size={36} />} onAbrir={() => abrir('integracion-kisi')} /> },
    { id: 'integracion-klaviyo', resumen: klaviyo.resumen, fila: <FilaConexionOAuth c={klaviyo} logo={<KlaviyoIcon size={20} />} onAbrir={() => abrir('integracion-klaviyo')} /> },
    { id: 'integracion-mailchimp', resumen: mailchimp.resumen, fila: <FilaConexionConClave c={mailchimp} logo={<MailchimpIcon size={36} />} onAbrir={() => abrir('integracion-mailchimp')} /> },
    { id: 'integracion-zapier', resumen: zapier.resumen, fila: <FilaZapier z={zapier} logo={<ZapierIcon size={36} />} onAbrir={() => abrir('integracion-zapier')} /> },
  ];

  return (
    <>
      {agruparConexiones(filas).map(g => (
        <GrupoFilas key={g.grupo} titulo={g.titulo}>
          {g.filas.map(f => <Fragment key={f.id}>{f.fila}</Fragment>)}
        </GrupoFilas>
      ))}

      {/* Quién puede autorizarlas es quien puede quitarlas (puedeGestionarAppsOAuth). */}
      {puedeGestionarAppsOAuth(rol) && (
        <GrupoFilas titulo="Quién puede ver tus datos">
          <FilaAjuste id="aplicaciones-con-acceso" icono={KeyRound} valor={resumenAppsConAcceso(apps.apps)} onAbrir={abrir} />
        </GrupoFilas>
      )}

      <GrupoFilas titulo="En otras secciones">
        <FilaOtraSeccion
          id="fila-a-cobros"
          icono={CreditCard}
          titulo={tarjetaPorId('integracion-stripe').titulo}
          valor={`En «${seccionPorId('cobros').titulo}»`}
          seccion="cobros"
          ancla="integracion-stripe"
        />
        <FilaOtraSeccion
          id="fila-a-comunicacion"
          icono={MessageCircle}
          titulo="WhatsApp y Gmail"
          valor={`En «${seccionPorId('comunicacion').titulo}»`}
          seccion="comunicacion"
          ancla="integracion-whatsapp"
        />
      </GrupoFilas>

      {/* Sin conectar no hay nada que gestionar: su acción está en la fila. */}
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
      <CajonAjuste id="aplicaciones-con-acceso" abierto={cajon === 'aplicaciones-con-acceso'} onCerrar={cerrar}>
        <DetalleAppsConAcceso a={apps} showToast={showToast} />
      </CajonAjuste>
    </>
  );
}
