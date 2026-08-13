'use client';

import { useMemo } from 'react';

import { construirDatosPortal, horarioDe } from '@/lib/portal-tema/datos';
import { useStudio } from '@/lib/studio-context';

/**
 * Los datos que pinta el kit, construidos desde el contexto del estudio.
 *
 * Vive aquí y no dentro de `PortalTemaMarco` porque los necesitan DOS sitios:
 * el portal de verdad y la previsualización del editor de Apariencia — que
 * hasta ahora pintaba el portal viejo y por eso le enseñaba a la propietaria
 * algo que sus socias ya no veían. Duplicar estas cincuenta líneas sería
 * garantizar que las dos pantallas se vuelvan a separar, esta vez en silencio.
 *
 * ⚠️ `socioId` entra por parámetro en vez de leerse de `usePortalAuth()`: la
 * previa corre SIN sesión de socia a propósito (comparte origen con el portal
 * real, así que un token suyo guardado en el navegador enseñaría avisos de
 * verdad dentro del editor), y `usePortalAuth` revienta sin su provider.
 * `null` = nadie identificado, que es justo el caso de la previa.
 */
export function useDatosPortal(socioId: string | null) {
  const {
    studio, sesiones, reservas, tiposClase, salas, spots, instructores,
    planesTarifa, suscripciones, socios, recibos, studioConfig, rachaSocio,
  } = useStudio();

  // Antes de `datos`: ese `useMemo` la lee al construirse, y declararla
  // después la dejaba en zona muerta (ReferenceError en el primer render).
  const socia = useMemo(() => socios.find((s) => s.id === socioId) ?? null, [socios, socioId]);
  // ⚠️ La racha NO se calcula aquí: viene de `calcularRacha`
  // (`lib/engines/streak-engine.ts`), que ya existía y es la MISMA que alimenta
  // los logros. Se escribió un segundo cálculo para el Inicio de Tentada y era
  // exactamente eso: una segunda fuente de la misma cifra, que habría dejado el
  // Inicio diciendo 6 semanas y su insignia 5.
  //
  // Y se resuelve AQUÍ, fuera del `useMemo` de `datos`: `rachaSocio` es una
  // función que el contexto recrea en cada render, así que meterla en las
  // dependencias recalcularía `datos` siempre y volvería a renderizar el portal
  // entero para nada — justo lo que evitan los refs de `PortalStore`. Con el
  // VALOR en las dependencias, solo cambia cuando cambia la racha.
  const racha = socioId ? rachaSocio(socioId) : null;
  const datos = useMemo(() => construirDatosPortal({
    ahora: new Date(),
    sesiones, reservas, tiposClase, salas, spots, instructores,
    planes: planesTarifa,
    cancelacionVentanaHoras: studio?.cancelacionVentanaHoras ?? null,
    // Para el cierre de pantalla que firma el estudio. `anioFundacion` es el
    // año en que ABRIÓ, no el alta en Tentare (`creadoEn`) — sin él el pie va
    // sin año en vez de inventarse uno.
    estudio: {
      nombre: studio?.nombre ?? '',
      anioFundacion: studio?.anioFundacion ?? null,
      direccion: studio?.direccion ?? '',
      ciudad: studio?.ciudad ?? '',
      codigoPostal: studio?.codigoPostal ?? '',
      telefono: studio?.telefono ?? '',
      email: studio?.email ?? '',
      fotoUrl: studio?.fotoUrl ?? null,
      imagenBienvenidaUrl: studio?.imagenBienvenidaUrl ?? null,
      // Una norma por línea, sin vacías. Se trocea aquí y no al pintar para
      // que el portal reciba el dato ya masticado, como el resto.
      normas: (studio?.normasTexto ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
      horario: horarioDe(studio?.horarioSemana),
      // Del `studioConfig` del contexto, que ya hidrata el texto guardado del
      // estudio (o el por defecto de `lib/legal-textos.ts`) — no de `studio`,
      // donde no vive. Es el mismo texto que la socia acepta al darse de alta.
      privacidad: studioConfig?.politicaPrivacidad ?? null,
    },
    socio: socia,
    // Las SUYAS, con su id de reserva. Sin esto la pantalla de Reservas usaba
    // la lista de demostración del kit —que arranca vacía— y la socia no veía
    // ni una de sus reservas reales.
    reservasPropias: socioId ? reservas.filter((r) => r.socioId === socioId) : undefined,
    racha,
    // Solo las SUYAS: el adaptador elige el bono al que le quedan menos
    // sesiones, y con las de todo el estudio elegiría el de otra persona.
    suscripciones: suscripciones.filter((s) => s.socioId === socioId),
    // Los SUYOS, para el historial de «Mis bonos». Por la vía pública solo
    // llegan los de quien mira (el servidor los acota por `socio_id`), pero se
    // filtra igualmente: el panel carga los de todo el estudio por otra vía y
    // este componente no puede depender de por cuál entró.
    recibos: socioId ? recibos.filter((r) => r.socioId === socioId) : [],
  }), [sesiones, reservas, tiposClase, salas, spots, instructores, planesTarifa, suscripciones, recibos, socia, socioId,
       studio?.nombre, studio?.anioFundacion, studio?.direccion, studio?.ciudad,
       studio?.codigoPostal, studio?.telefono, studio?.email, studio?.fotoUrl, studio?.imagenBienvenidaUrl,
       studio?.normasTexto, studio?.horarioSemana, studioConfig?.politicaPrivacidad, racha,
       studio?.cancelacionVentanaHoras]);

  // `socia` sale también: el marco la necesita para «Mis datos», y
  // recalcularla allí sería el mismo `find` dos veces sobre la misma lista.
  return { datos, socia };
}
