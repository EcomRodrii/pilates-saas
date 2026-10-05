'use client';

// Envío de tus registros de facturación a la AEAT (Veri*Factu): el alta.
//
// Solo la propietaria. Es un trámite legal, así que tiene que ser corto: tres
// pasos y, para una autónoma, un solo dato que escribir (el CSV que le da la
// AEAT). Lo que se puede deducir no se pregunta (`lib/verifactu/alta-sencilla.ts`):
// el tipo de emisor sale del NIF y, en una persona física, quien otorga el poder
// es ella. Las fechas y el tipo de poder llevan los valores de la AEAT y solo se
// tocan si se cambiaron allí.
//
// El poder se otorga en la sede de la AEAT, con su certificado o Cl@ve. Tentare
// nunca pide ni ve esas credenciales; solo recoge la prueba (el CSV) y el
// apoderado la verifica en su «Consulta de apoderamientos recibidos». Mientras el
// estudio no esté en producción (lo activa Tentare, a mano), no se envía nada.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, FileCheck2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeader } from '@/lib/api-client';
import { otorganteDeducido, tipoEmisorPorNif } from '@/lib/verifactu/alta-sencilla';

type EstadoEstudio = 'SIN_CONFIGURAR' | 'PENDIENTE_AUTORIZACION' | 'AUTORIZACION_EN_REVISION' | 'VERIFICADO' | 'PRODUCCION' | 'PAUSADO' | 'SUSPENDIDO_AEAT';
type TipoEmisor = 'persona_fisica' | 'sociedad' | 'otra';

interface Estado {
  estado: EstadoEstudio;
  motivo: string | null;
  nifEstudio: string | null;
  nifValido: boolean;
  nombreFiscal: string | null;
  tipoEmisor: TipoEmisor | null;
  esDemo: boolean;
  apoderado: { nombre: string; nif: string } | null;
  tramite: { codigo: string; nombre: string };
  urls: { registro: string; ayuda: string };
  mandato: { version: string; texto: string } | null;
  representacion: { estado: string; estado_motivo: string | null; vigente_hasta: string; tramite: string } | null;
  habilitadoParaEnviar: boolean;
}

const TEXTO_ESTADO: Record<EstadoEstudio, { titulo: string; detalle: string }> = {
  SIN_CONFIGURAR: { titulo: 'Sin dar de alta', detalle: 'Tus facturas salen igual, sin envío a la AEAT. Para enviarlas, sigue estos pasos.' },
  PENDIENTE_AUTORIZACION: { titulo: 'Falta tu autorización', detalle: 'Da el permiso en la AEAT y pega aquí el código que te dan. Hasta que se active el envío, tus facturas salen sin envío a la AEAT.' },
  AUTORIZACION_EN_REVISION: { titulo: 'Comprobando tu autorización', detalle: 'Ya está todo por tu parte. Tentare comprueba tu permiso en la AEAT y activa el envío; no tienes que hacer nada más. Mientras tanto, tus facturas salen sin envío.' },
  VERIFICADO: { titulo: 'Autorización comprobada', detalle: 'Tu permiso está comprobado. Tentare activará el envío: desde ese día, el registro de cada factura se envía a la AEAT.' },
  PRODUCCION: { titulo: 'Enviando a la AEAT', detalle: 'Tus facturas se emiten desde Tentare y sus registros se envían a la AEAT.' },
  PAUSADO: { titulo: 'Envío en pausa', detalle: 'Tus facturas se siguen emitiendo, pero ahora no se envían.' },
  SUSPENDIDO_AEAT: { titulo: 'Envío suspendido por la AEAT', detalle: 'La AEAT ha suspendido temporalmente el envío. Tentare se está ocupando.' },
};

const NOMBRE_TIPO: Record<TipoEmisor, string> = {
  persona_fisica: 'Persona física (autónoma)',
  sociedad: 'Sociedad',
  otra: 'Otra entidad (comunidad de bienes…)',
};

const PASOS = ['Tus datos', 'Permiso en la AEAT', 'Lo comprobamos nosotros'] as const;

function pasoActual(estado: EstadoEstudio): number | null {
  if (estado === 'SIN_CONFIGURAR') return 1;
  if (estado === 'PENDIENTE_AUTORIZACION') return 2;
  if (estado === 'AUTORIZACION_EN_REVISION' || estado === 'VERIFICADO') return 3;
  return null;
}

const hoyIso = () => new Date().toISOString().slice(0, 10);
const masAnos = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function VerifactuAltaPage() {
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  const [nombreFiscal, setNombreFiscal] = useState('');
  const [tipoEmisor, setTipoEmisor] = useState<TipoEmisor>('persona_fisica');
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [csv, setCsv] = useState('');
  const [otorgadoEn, setOtorgadoEn] = useState(hoyIso());
  const [vigenteHasta, setVigenteHasta] = useState(masAnos(hoyIso(), 5));
  const [tramite, setTramite] = useState<'IZ860' | 'GENERAL_46_2'>('IZ860');
  const [otorganteNombre, setOtorganteNombre] = useState('');
  const [otorganteNif, setOtorganteNif] = useState('');
  const [otorganteCargo, setOtorganteCargo] = useState<'representante_legal' | 'apoderado_con_poder_suficiente'>('representante_legal');
  const [aceptaMandato, setAceptaMandato] = useState(false);

  const aplicar = (d: Estado) => {
    setE(d);
    setNombreFiscal(d.nombreFiscal ?? '');
    setTipoEmisor(d.tipoEmisor ?? tipoEmisorPorNif(d.nifEstudio));
    // Sin nombre no hay nada que confirmar: se pregunta directamente.
    setCorrigiendo(!d.nombreFiscal);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/verifactu/estudio', { headers: await authHeader(), cache: 'no-store' });
        const cuerpo = await res.json().catch(() => null);
        if (!vivo) return;
        if (!res.ok) setError((cuerpo as { error?: string } | null)?.error ?? 'No se ha podido cargar.');
        else aplicar(cuerpo as Estado);
      } catch {
        if (vivo) setError('No se ha podido cargar.');
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function enviar(cuerpo: Record<string, unknown>) {
    setEnviando(true);
    setErrores([]);
    setError(null);
    try {
      const res = await fetch('/api/verifactu/estudio', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify(cuerpo),
      });
      const r = await res.json().catch(() => null) as (Estado & { error?: string; errores?: string[] }) | null;
      if (!res.ok) {
        setErrores(r?.errores?.length ? r.errores : [r?.error ?? 'No se ha podido guardar.']);
        return;
      }
      if (r) aplicar(r);
    } catch {
      setError('No se ha podido guardar. Revisa la conexión.');
    } finally {
      setEnviando(false);
    }
  }

  const estado = e ? TEXTO_ESTADO[e.estado] : null;
  const paso = e ? pasoActual(e.estado) : null;
  // Paso 1 a la vista solo al empezar; después, «Cambiar mis datos» (cambiarlos
  // pide autorizar de nuevo: el poder es de un NIF concreto).
  const puedeConfigurar = e && !e.esDemo && e.estado !== 'PRODUCCION';
  const muestraDatos = puedeConfigurar && (e.estado === 'SIN_CONFIGURAR' || corrigiendo);
  const pideAutorizacion = e?.estado === 'PENDIENTE_AUTORIZACION' && !corrigiendo;
  const tieneRepresentacionViva = e?.representacion && ['EN_REVISION', 'VERIFICADA'].includes(e.representacion.estado);
  const tipoGuardado: TipoEmisor = e?.tipoEmisor ?? tipoEmisor;
  const deducido = e?.nombreFiscal && e.nifEstudio
    ? otorganteDeducido({ tipoEmisor: tipoGuardado, nombreFiscal: e.nombreFiscal, nif: e.nifEstudio })
    : null;
  const otorgante = deducido ?? { nombre: otorganteNombre, nif: otorganteNif, cargo: otorganteCargo };
  const faltaOtorgante = !deducido && (!otorganteNombre.trim() || otorganteNif.trim().length !== 9);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Envío a la AEAT"
        description="Con Veri*Factu, Tentare envía a la AEAT el registro de cada factura. Lo autorizas una sola vez y lleva unos 5 minutos."
      />

      {error && <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">{error}</p>}
      {!e && !error && <p className="text-[13.5px] text-muted-foreground">Cargando…</p>}

      {e && estado && (
        <>
          {paso !== null && !e.esDemo && (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13.5px] text-pretty">
              <strong>Es obligatorio por ley.</strong> Con la ley antifraude, tu programa de facturación tiene que
              estar adaptado antes del 1 de enero de 2027 si tu estudio es una sociedad, o del 1 de julio de 2027 si
              eres autónoma. En Tentare se cumple con esto, y se hace una sola vez.
            </p>
          )}

          {paso !== null && !e.esDemo && (
            <ol aria-label="Pasos del alta" className="grid grid-cols-3 gap-2">
              {PASOS.map((nombre, i) => {
                const n = i + 1;
                const estadoPaso = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
                return (
                  <li
                    key={nombre}
                    aria-current={estadoPaso === 'actual' ? 'step' : undefined}
                    className={`rounded-xl border px-3 py-2 text-[12.5px] ${estadoPaso === 'actual' ? 'border-foreground font-semibold text-foreground' : 'border-border text-muted-foreground'}`}
                  >
                    <span className="block">{estadoPaso === 'hecho' ? <Check className="size-3.5" aria-label="Hecho" /> : n}</span>
                    {nombre}
                  </li>
                );
              })}
            </ol>
          )}

          <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5" aria-live="polite">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="text-[15px] font-bold">{estado.titulo}</h2>
            </div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{estado.detalle}</p>
            {e.motivo && <p className="mt-2 text-[13px]">Motivo: {e.motivo}</p>}
            {e.representacion?.estado_motivo && e.representacion.estado === 'RECHAZADA_REVISION' && (
              <p className="mt-2 text-[13px]">No se pudo comprobar tu autorización: {e.representacion.estado_motivo}</p>
            )}
            {e.representacion?.estado === 'VERIFICADA' && (
              <p className="mt-2 text-[13px]">Tu poder vale hasta el {e.representacion.vigente_hasta.split('-').reverse().join('/')}.</p>
            )}
          </section>

          {e.esDemo && (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13.5px]">Este es el estudio de demostración: su envío a la AEAT no se puede activar, porque sus facturas no son reales.</p>
          )}

          {errores.length > 0 && (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] px-4 py-3 text-[13.5px]">
              <ul className="list-disc pl-5 space-y-0.5">{errores.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          )}

          {muestraDatos && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-3">
              <h2 className="text-[15px] font-bold">1 · ¿Son tus datos fiscales?</h2>
              {!e.nifValido ? (
                <p className="text-[13.5px]">
                  Primero pon tu NIF en <Link href="/configuracion" className="underline">Datos fiscales</Link>: el permiso de la AEAT va a nombre de ese NIF.
                </p>
              ) : corrigiendo ? (
                <>
                  <p className="text-[13px] text-muted-foreground">NIF: <strong className="text-foreground">{e.nifEstudio}</strong></p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="vf-nombre">Nombre o razón social, tal como figura en la AEAT</Label>
                      <Input id="vf-nombre" value={nombreFiscal} onChange={ev => setNombreFiscal(ev.target.value)} maxLength={120} autoComplete="off" />
                    </div>
                    <div>
                      <Label htmlFor="vf-tipo">Facturas como</Label>
                      <select id="vf-tipo" value={tipoEmisor} onChange={ev => setTipoEmisor(ev.target.value as TipoEmisor)}
                        className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                        {(Object.keys(NOMBRE_TIPO) as TipoEmisor[]).map(t => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <dl className="grid gap-1 text-[13.5px] sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="text-muted-foreground">Nombre</dt><dd className="font-medium">{nombreFiscal}</dd>
                  <dt className="text-muted-foreground">NIF</dt><dd className="font-medium">{e.nifEstudio}</dd>
                  <dt className="text-muted-foreground">Facturas como</dt><dd className="font-medium">{NOMBRE_TIPO[tipoEmisor]}</dd>
                </dl>
              )}
              {e.nifValido && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={enviando || !nombreFiscal.trim()} onClick={() => void enviar({ accion: 'configurar', nombreFiscal, tipoEmisor })}>
                    {corrigiendo ? 'Guardar mis datos' : 'Sí, son mis datos'}
                  </Button>
                  {!corrigiendo && (
                    <button type="button" className="text-[13px] underline underline-offset-2" onClick={() => setCorrigiendo(true)}>
                      Corregir
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {pideAutorizacion && e.apoderado && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-4">
              <h2 className="text-[15px] font-bold">2 · Da el permiso en la AEAT</h2>
              <ol className="list-decimal pl-5 space-y-1.5 text-[13.5px]">
                <li>Entra en la AEAT con tu certificado o Cl@ve{tipoGuardado === 'sociedad' ? ' (el representante legal de la sociedad)' : ''}.</li>
                <li>Elige «Alta de poder para trámites tributarios específicos» → «Sistemas Informáticos de Facturación y VERI*FACTU».</li>
                <li>
                  Da el permiso a <strong>{e.apoderado.nombre}</strong>, NIF{' '}
                  <strong className="font-mono">{e.apoderado.nif}</strong>, en el trámite <strong>{e.tramite.codigo}</strong>.
                </li>
                <li>Al terminar, la AEAT te da un código (CSV). Pégalo aquí abajo.</li>
              </ol>
              <a
                href={e.urls.registro} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-[14px] font-medium hover:bg-muted/50"
              >
                Abrir la AEAT <ExternalLink className="size-4" aria-hidden />
              </a>

              <div className="max-w-md">
                <Label htmlFor="vf-csv">Código (CSV) que te da la AEAT</Label>
                <Input id="vf-csv" value={csv} onChange={ev => setCsv(ev.target.value)} autoComplete="off" spellCheck={false} />
              </div>

              {!deducido && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="vf-otorgante">Quién lo firmó en la AEAT (nombre)</Label>
                    <Input id="vf-otorgante" value={otorganteNombre} onChange={ev => setOtorganteNombre(ev.target.value)} autoComplete="name" />
                  </div>
                  <div>
                    <Label htmlFor="vf-otorgante-nif">Su NIF</Label>
                    <Input id="vf-otorgante-nif" value={otorganteNif} onChange={ev => setOtorganteNif(ev.target.value.toUpperCase())} maxLength={9} autoComplete="off" />
                  </div>
                  <div>
                    <Label htmlFor="vf-cargo">En calidad de</Label>
                    <select id="vf-cargo" value={otorganteCargo} onChange={ev => setOtorganteCargo(ev.target.value as typeof otorganteCargo)}
                      className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                      <option value="representante_legal">Representante legal</option>
                      <option value="apoderado_con_poder_suficiente">Apoderado con poder suficiente</option>
                    </select>
                  </div>
                </div>
              )}

              <details className="rounded-xl border border-border px-3 py-2 text-[13px]">
                <summary className="cursor-pointer">¿Cambiaste las fechas en la AEAT o diste un poder general?</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="vf-tramite">Qué poder diste</Label>
                    <select id="vf-tramite" value={tramite} onChange={ev => setTramite(ev.target.value as typeof tramite)}
                      className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px]">
                      <option value="IZ860">IZ860 (el recomendado)</option>
                      <option value="GENERAL_46_2">Poder general (art. 46.2 LGT)</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="vf-desde">Fecha en que lo diste</Label>
                    <Input id="vf-desde" type="date" value={otorgadoEn} max={hoyIso()} onChange={ev => { setOtorgadoEn(ev.target.value); setVigenteHasta(masAnos(ev.target.value, 5)); }} />
                  </div>
                  <div>
                    <Label htmlFor="vf-hasta">Vale hasta</Label>
                    <Input id="vf-hasta" type="date" value={vigenteHasta} onChange={ev => setVigenteHasta(ev.target.value)} />
                  </div>
                </div>
                <p className="mt-2 text-muted-foreground">Si no tocaste nada en la AEAT, déjalo así: hoy y 5 años.</p>
              </details>

              <div className="space-y-1">
                <label className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" checked={aceptaMandato} onChange={ev => setAceptaMandato(ev.target.checked)} className="mt-0.5" />
                  <span>Acepto el mandato a Tentare para enviar mis registros a la AEAT y confirmo que los datos son ciertos.</span>
                </label>
                {/* Fuera de la etiqueta: abrir el texto no debe marcar la casilla. */}
                {e.mandato && (
                  <details className="pl-6 text-[13px]">
                    <summary className="cursor-pointer underline underline-offset-2">Leer el mandato</summary>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed">{e.mandato.texto}</pre>
                  </details>
                )}
              </div>
              <Button
                disabled={enviando || !csv.trim() || !aceptaMandato || !e.mandato || faltaOtorgante}
                onClick={() => void enviar({
                  accion: 'autorizar', csv, otorgadoEn, vigenteHasta, tramite,
                  otorgante,
                  aceptaMandato, mandatoVersion: e.mandato?.version,
                })}
              >
                Enviar
              </Button>
              <p className="text-[12.5px] text-muted-foreground">
                Tentare nunca te pedirá tu certificado ni tu Cl@ve. <a href={e.urls.ayuda} target="_blank" rel="noopener noreferrer" className="underline">Ayuda de la AEAT para dar un poder</a>.
              </p>
            </section>
          )}

          {pideAutorizacion && !e.apoderado && (
            <p className="rounded-2xl border border-border bg-muted/40 px-4 py-3 text-[13.5px]">Tentare todavía no ha preparado el envío a la AEAT. Vuelve más adelante.</p>
          )}

          {puedeConfigurar && !muestraDatos && e.estado !== 'SIN_CONFIGURAR' && (
            <p className="text-[13px] text-muted-foreground">
              ¿Han cambiado tu nombre fiscal o tu forma de facturar?{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => setCorrigiendo(true)}>Cambiar mis datos</button>
              {' '}(tendrás que dar el permiso de nuevo).
            </p>
          )}

          {tieneRepresentacionViva && (
            <section className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 space-y-2">
              <h2 className="text-[15px] font-bold">¿Has revocado el poder en la AEAT?</h2>
              <p className="text-[13px] text-muted-foreground">Si lo has retirado en la sede, díselo también a Tentare: dejamos de enviar al momento, y tus facturas siguen saliendo, sin envío.</p>
              <Button variant="outline" disabled={enviando} onClick={() => void enviar({ accion: 'revocar' })}>He revocado el poder</Button>
            </section>
          )}

          <p className="text-[13px]">
            <Link href="/verifactu/declaracion-responsable" className="inline-flex items-center gap-1.5 underline">
              <FileCheck2 className="size-4" aria-hidden /> Declaración responsable del sistema de facturación
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
