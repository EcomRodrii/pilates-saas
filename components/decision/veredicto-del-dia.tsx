'use client';

import { ANCLA_LISTO } from '@/lib/opening/listo';
import Link from 'next/link';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AccionesRecomendacion } from './acciones-recomendacion';
import { severidad } from './severidad';
import { SeveridadBadge } from './severidad-badge';
import type { EstadoAnalisis, VeredictoAPI } from './use-decisiones';
import { TentiIcono } from '@/components/tenti/tenti-icono';
import { efectoDe } from '@/lib/decision/efecto-aprobar';
import { HECHO_BREVE_MS, estadoDelVeredicto } from '@/lib/tenti/momentos';
import { useDuranteUnMomento } from '@/lib/tenti/durante-un-momento';
import {
  lineaDelPiloto, lineaEnSeguimiento, SIGUE_EN_EL_DETALLE, TEXTO_SIN_ANALIZAR, TITULO_POSPUESTA,
  TITULO_RESPONDIDO, TITULO_SILENCIO, TITULO_YA_NO_PENDIENTE,
} from '@/lib/decision/veredicto-copy';

// El Umbral (lib/decision/umbral.ts), en pantalla: el elemento principal de
// Centro de Control ya no es una lista — es una sola frase, o silencio. La
// evidencia y el resto de detalle quedan ocultos hasta que se piden (ver
// nota de diseño "un mensaje, uno").
//
// Tenti, en lugar del anillo que había (decisión del fundador, 5-oct): un solo
// Tenti de 28 px, con el estado que decide `estadoDelVeredicto`
// (lib/tenti/momentos.ts): pensando mientras se analiza, 'hecho' breve al
// terminar el análisis o al responder, 'pregunta' en el mensaje del día,
// 'error' si el piloto no pudo con algo, y la firma si no. NUNCA junto a un
// cobro: si aprobar el mensaje cobra, no hay Tenti. Sin sonido ni emociones:
// el Contrato promete no interrumpir.

const QUE_REVISO = [
  'reservas y ocupación de las clases',
  'pagos y renovaciones',
  'asistencia y patrones de baja',
  'carga de trabajo del equipo',
];

// Ejemplo de un día CON mensaje, para un estudio que todavía no tiene
// historial del que sacar uno propio. No es un dato real ni pretende parecerlo:
// va rotulado como ejemplo y sin botones de acción.
//
// Existe porque durante la prueba de 7 días esta pantalla —la primera del menú,
// y el argumento que justifica el plan Estudio— no tiene nada que decir los
// siete días. Quien la mira no puede distinguir «es brillante» de «no hace
// nada», y decide sobre lo segundo.
function EjemploDelUmbral() {
  return (
    <div className="mt-4 w-full max-w-md rounded-xl border border-dashed border-border p-4 text-left">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        Ejemplo · así se verá cuando tenga algo que decirte
      </p>
      <p className="mt-2 text-[14px] font-semibold text-foreground">
        Marta lleva 3 semanas sin venir y su bono caduca el viernes.
      </p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Venía dos veces por semana desde marzo. Le quedan 4 sesiones sin usar. Escribirle hoy
        cuesta un minuto; recuperarla cuando se dé de baja, mucho más.
      </p>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Con tus datos reales, aquí tendrás su nombre, la evidencia y un botón para resolverlo.
      </p>
    </div>
  );
}

export function VeredictoDelDia({ veredicto, onAprobar, onYaContactada, onYaLoSe, onPosponer, procesando, tardando, whatsappHref, nAutonomasHoy = 0, nAutonomasFallidasHoy = 0, totalPendiente = 0, onVerPendiente, sinHistorial = false, bandejaHoy, analisis = 'quieto' }: {
  veredicto: VeredictoAPI;
  /** «Analizar ahora», visto desde la pantalla (use-decisiones.ts): Tenti piensa mientras dura. */
  analisis?: EstadoAnalisis;
  onAprobar: () => void;
  onYaContactada: () => void;
  onYaLoSe: () => void;
  onPosponer: () => void;
  procesando?: boolean;
  /** Su cobro aprobado agotó el tope de preguntar cómo ha ido (use-decisiones.ts). */
  tardando?: boolean;
  whatsappHref?: string | null;
  /** Reorganización Centro de Control §2 (PR2): "Para hoy" (BandejaHoy) ya no
   * es su propia Card suelta detrás del desplegable — se pinta aquí, dentro
   * del mismo Card que el mensaje del día, para que lo operativo del estudio
   * no dependa de un clic aparte. Se ve en las 4 ramas (incluida SIN_ANALIZAR
   * y SILENCIO): no depende de que el Decision OS haya terminado su análisis. */
  bandejaHoy?: React.ReactNode;
  /** Cuántas acciones del piloto automático salieron hoy (EJECUTADA): se
   * dice en los días sin mensaje, para que se note que Tentare trabajó. */
  nAutonomasHoy?: number;
  /** Las que el piloto intentó hoy y no salieron (FALLIDA): se dicen aparte. */
  nAutonomasFallidasHoy?: number;
  /** Cuántas situaciones sigue habiendo en Prioridades + Más situaciones
   * aunque El Umbral haya decidido no interrumpir hoy — el mismo número que
   * ya suma el Action Center del Dashboard. Sin esto, un «no hay nada»
   * contradecía a un clic de distancia a "9 cosas necesitan tu atención". */
  totalPendiente?: number;
  onVerPendiente?: () => void;
  /** Estudio recién creado, sin historial del que sacar un mensaje propio.
   *  Enseña un ejemplo rotulado para que se pueda entender qué hace esta
   *  pantalla antes de tener datos — durante la prueba, es la diferencia entre
   *  parecer brillante y parecer vacía. */
  sinHistorial?: boolean;
}) {
  const [porQueAbierto, setPorQueAbierto] = useState(false);
  const [queRevisoAbierto, setQueRevisoAbierto] = useState(false);

  // Lo pendiente sigue ahí aunque hoy no interrumpa por ello: se dice cuánto y
  // dónde está, sin calificarlo (lib/decision/veredicto-copy.ts).
  const enSeguimiento = lineaEnSeguimiento(totalPendiente);
  const puente = enSeguimiento && onVerPendiente && (
    <button
      type="button"
      onClick={onVerPendiente}
      className="max-w-sm text-[12.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {enSeguimiento}
    </button>
  );
  const piloto = lineaDelPiloto(nAutonomasHoy, nAutonomasFallidasHoy);
  // Tenti, con el dato que lo decide (lib/tenti/momentos.ts). «Recién» = durante
  // HECHO_BREVE_MS después de que pase: el análisis acaba de terminar, o la
  // respuesta acaba de confirmarse (un cobro aprobado no se va de la pantalla:
  // `respondido` nunca viene de un COBRAR).
  const recienTerminado = useDuranteUnMomento(analisis === 'quieto', HECHO_BREVE_MS);
  const recienRespondido = useDuranteUnMomento(!!veredicto.respondido, HECHO_BREVE_MS);
  const rec = veredicto.recomendacion;
  const estadoTenti = estadoDelVeredicto({
    tipo: veredicto.tipo,
    hayRecomendacion: !!rec,
    pospuesta: !!veredicto.pospuesta && rec?.estado === 'PENDIENTE',
    // El mismo efecto que decide el botón principal (AccionesRecomendacion).
    efectoCobra: !!rec && efectoDe(rec) === 'COBRAR',
    analisis,
    recienTerminado,
    recienRespondido,
    fallidasHoy: nAutonomasFallidasHoy,
  });
  const tenti = estadoTenti && <TentiIcono ancho={28} estado={estadoTenti} />;

  // El análisis corre una vez al día, por la tarde (14:30 UTC): hasta entonces
  // no hay mensaje de hoy, y el texto lo dice en vez de prometer que será pronto.
  if (veredicto.tipo === 'SIN_ANALIZAR') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-6 text-center">
          {tenti}
          <p className="text-[14px] text-muted-foreground">
            {TEXTO_SIN_ANALIZAR}
          </p>
          {bandejaHoy}
        </CardContent>
      </Card>
    );
  }

  if (veredicto.tipo === 'SILENCIO') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          {tenti}
          <h2 className="font-heading text-[18px] font-semibold text-foreground">{TITULO_SILENCIO}</h2>
          {piloto && <p className="max-w-sm text-[13.5px] text-muted-foreground">{piloto}</p>}
          {puente}
          {veredicto.porApertura && (
            <p className="max-w-sm text-[12.5px] text-muted-foreground">
              Estás abriendo tu estudio y hoy ya te he avisado de tu apertura: lo pendiente está en{' '}
              <Link href={`/dashboard#${ANCLA_LISTO}`} className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-secondary)' }}>Resumen</Link>.
            </p>
          )}
          {veredicto.semanaTranquila && (
            <p className="max-w-sm text-[12.5px] text-muted-foreground">
              Esta semana no hubo nada que mereciera interrumpirte.
            </p>
          )}
          <button
            type="button"
            onClick={() => setQueRevisoAbierto(v => !v)}
            className="mt-2 text-[12px] font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-secondary)' }}
          >
            {queRevisoAbierto ? 'Ocultar' : '¿Qué he estado mirando?'}
          </button>
          {queRevisoAbierto && (
            <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-muted-foreground">
              {QUE_REVISO.map(item => <li key={item}>{item}</li>)}
            </ul>
          )}
          {sinHistorial && totalPendiente === 0 && <EjemploDelUmbral />}
          {bandejaHoy}
        </CardContent>
      </Card>
    );
  }

  const r = veredicto.recomendacion;
  // MENSAJE sin recomendación que enseñar. O acaba de responderlo en esta
  // pantalla (`respondido`: la tarjeta se va con el sí del servidor), o el
  // servidor no la encuentra viva ni resuelta hoy. Una resuelta HOY sí llega
  // (por su id o por su clave), y entonces no se pinta esta rama: se pinta su
  // tarjeta, con lo que pasó de verdad (`AccionesRecomendacion`, abajo) —un
  // cobro rechazado o un mensaje que no salió no se tapan con un titular.
  if (!r) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          {tenti}
          <h2 className="font-heading text-[18px] font-semibold text-foreground">
            {veredicto.respondido ? TITULO_RESPONDIDO : TITULO_YA_NO_PENDIENTE}
          </h2>
          {piloto && <p className="max-w-sm text-[13.5px] text-muted-foreground">{piloto}</p>}
          {puente}
          {bandejaHoy}
        </CardContent>
      </Card>
    );
  }

  // «Recuérdamelo» hoy: sigue PENDIENTE y sigue en el detalle, con sus botones.
  // Aquí no se le vuelve a pedir lo mismo (antes, al recargar, volvía como si
  // nadie lo hubiera tocado).
  if (veredicto.pospuesta && r.estado === 'PENDIENTE') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          {tenti}
          <h2 className="font-heading text-[18px] font-semibold text-foreground">{TITULO_POSPUESTA}</h2>
          <p className="max-w-sm text-[13.5px] text-muted-foreground">{r.titulo}</p>
          {onVerPendiente ? (
            <button
              type="button"
              onClick={onVerPendiente}
              className="text-[12.5px] font-semibold underline underline-offset-2"
              style={{ color: 'var(--brand-secondary)' }}
            >
              {SIGUE_EN_EL_DETALLE}
            </button>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">{SIGUE_EN_EL_DETALLE}</p>
          )}
          {bandejaHoy}
        </CardContent>
      </Card>
    );
  }

  const nivelSev = severidad(r.prioridad, r.riesgo, r.confianza.nivel);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          {tenti}
          <SeveridadBadge nivel={nivelSev} />
        </div>
        <h2 className="font-heading text-[20px] leading-snug font-semibold text-foreground">{r.titulo}</h2>
        <p className="text-[14.5px] leading-relaxed text-muted-foreground">{r.motivo}</p>

        {veredicto.fraseConfianza && (
          <p className="text-[13px] font-medium text-foreground">{veredicto.fraseConfianza}</p>
        )}

        <button
          type="button"
          onClick={() => setPorQueAbierto(v => !v)}
          className="w-fit text-[12px] font-semibold underline underline-offset-2"
          style={{ color: 'var(--brand-secondary)' }}
        >
          {porQueAbierto ? 'Ocultar evidencia' : '¿Por qué?'}
        </button>
        {porQueAbierto && (
          <ul className="flex flex-col gap-1 border-l-2 pl-3 text-[12.5px] text-muted-foreground" style={{ borderColor: 'var(--border)' }}>
            {r.confianza.evidencia.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        {/* Antes, un «Hecho» para todo que, según la recomendación, cobraba la
            tarjeta de la socia o le mandaba un mensaje sin decirlo. El botón
            principal lo decide lib/decision/efecto-aprobar.ts, igual que en
            las filas de situación. */}
        <AccionesRecomendacion
          recomendacion={r}
          procesando={procesando}
          tardando={tardando}
          whatsappHref={whatsappHref}
          onAprobar={onAprobar}
          onYaContactada={onYaContactada}
          onYaLoSe={onYaLoSe}
          onPosponer={onPosponer}
        />
        {bandejaHoy}
      </CardContent>
    </Card>
  );
}
