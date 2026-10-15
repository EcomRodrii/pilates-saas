'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarOff, ChevronDown } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { ANCLA_DECIDIR, invalidarEstadoEstudio, useAnclaDeAviso } from '@/lib/estado-estudio-cliente';
import { abrirFestivo, cerrarFestivo, listarFestivos, type ListaFestivos } from '@/lib/festivos/festivos-cliente';
import { fechaDelFestivo, fraseFestivo, type FestivoConClases } from '@/lib/festivos/textos';
import { consecuenciasDelCierre } from '@/lib/cierres/dias-de-cierre';
import { tarjetaVisible } from '@/lib/configuracion/secciones';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Festivos oficiales con clases que esperan que el estudio decida (P1.6), dentro
// de la bandeja de Inicio. Mismo alcance que `SeriesPorRenovar`: una lista y sus
// botones, y se oculta sola si no hay nada (o si está apagado: interruptor
// `FESTIVOS_AVISO` o la tabla sin migrar).
//
// Nada se cierra solo. «Cerrar ese día» es el POST /api/cierres de siempre (el
// mismo resultado que «Cerrar el centro», y la confirmación dice lo mismo);
// «Abrimos igualmente» se apunta y no se vuelve a preguntar. Nada optimista: la
// fila se va cuando el servidor lo confirma.
//
// Solo se monta si `puedeGestionarSede` (el mismo gate que el servidor).

export function FestivosPorDecidir({ onToast }: { onToast: (m: string) => void }) {
  const { studio } = useStudio();
  const rol = useRol();
  const devuelveSesion = studio?.cancelacionClaseDevuelveBono ?? true;
  const [lista, setLista] = useState<ListaFestivos | null>(null);
  const [todos, setTodos] = useState(false);
  const [cargandoTodos, setCargandoTodos] = useState(false);
  const [errorTodos, setErrorTodos] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<{ fecha: string; accion: 'abrir' | 'cerrar' } | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cerrando, setCerrando] = useState<FestivoConClases | null>(null);
  const enviandoRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    void listarFestivos('aviso').then(r => { if (vivo) setLista(r); });
    return () => { vivo = false; };
  }, []);

  useAnclaDeAviso(ANCLA_DECIDIR.festivosPorDecidir, lista !== null);

  async function verTodos(si: boolean) {
    setCargandoTodos(true);
    setErrorTodos(null);
    const r = await listarFestivos(si ? 'todos' : 'aviso');
    setCargandoTodos(false);
    if (r) { setLista(r); setTodos(si); }
    else setErrorTodos('No se han podido leer los festivos. Inténtalo de nuevo.');
  }

  async function decidir(f: FestivoConClases, accion: 'abrir' | 'cerrar') {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando({ fecha: f.fecha, accion });
    setErrores(prev => { const { [f.fecha]: _, ...resto } = prev; return resto; });
    try {
      const r = accion === 'abrir' ? await abrirFestivo(f.fecha) : await cerrarFestivo(f);
      if (!r.ok) {
        setErrores(prev => ({ ...prev, [f.fecha]: r.error }));
        return;
      }
      setLista(prev => (prev ? { ...prev, festivos: prev.festivos.filter(x => x.fecha !== f.fecha) } : prev));
      invalidarEstadoEstudio();
      const cuando = fechaDelFestivo(f.fecha, lista?.hoy ?? f.fecha);
      onToast(accion === 'abrir'
        ? `Apuntado: el ${cuando} abres. No te lo volvemos a preguntar; si cambias de idea, ciérralo en Configuración › Mi estudio.`
        : `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)}: ${'texto' in r ? r.texto : 'día cerrado'}`);
    } finally {
      enviandoRef.current = false;
      setEnviando(null);
    }
  }

  if (!lista || (!todos && lista.festivos.length === 0)) return null;
  const { hoy, zona, festivos } = lista;
  const corrigeDireccion = tarjetaVisible('nombre-y-direccion', rol);

  return (
    // Sin marco propio: vive dentro de la bandeja (EstadoDelEstudio), que ya lo pone.
    <div id={ANCLA_DECIDIR.festivosPorDecidir} tabIndex={-1} data-testid="festivos-por-decidir"
      className="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
      <div className="mb-1 flex items-center gap-2">
        <CalendarOff className="size-4 text-muted-foreground" aria-hidden />
        <p className="text-[13px] font-medium text-foreground">
          {/* La línea de la bandeja ya dice «decide si abres o cierras» justo encima. */}
          {todos ? 'Todos los festivos con clases' : festivos.length === 1 ? 'Festivo con clases' : 'Festivos con clases'}
        </p>
      </div>
      {festivos.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No hay más festivos con clases en lo que queda de calendario.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {festivos.map(f => (
            <li key={f.fecha} data-testid="festivo-por-decidir"
              className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] text-foreground text-pretty">{fraseFestivo(f, hoy)}</p>
                <Link href={`/calendario?fecha=${f.fecha}`} className="text-[11px] text-muted-foreground underline underline-offset-2">
                  Ver ese día en el calendario
                </Link>
                {errores[f.fecha] && (
                  <p role="alert" className="mt-1 text-[11px] font-medium text-destructive">{errores[f.fecha]}</p>
                )}
              </div>
              {/* En el móvil, los dos a lo ancho y de 44 px: pesan lo mismo, ninguno empuja a cerrar. */}
              <div className="flex shrink-0 justify-end gap-2 max-md:[&>*]:flex-1">
                <Button size="sm" variant="outline" className="min-h-11 md:min-h-7" disabled={enviando !== null}
                  aria-label={`Abrimos igualmente el ${fechaDelFestivo(f.fecha, hoy)}`}
                  onClick={() => void decidir(f, 'abrir')}>
                  {enviando?.fecha === f.fecha && enviando.accion === 'abrir' ? 'Guardando…' : 'Abrimos igualmente'}
                </Button>
                <Button size="sm" variant="outline" className="min-h-11 md:min-h-7" disabled={enviando !== null}
                  aria-label={`Cerrar el ${fechaDelFestivo(f.fecha, hoy)}`}
                  onClick={() => setCerrando(f)}>
                  {enviando?.fecha === f.fecha && enviando.accion === 'cerrar' ? 'Cerrando…' : 'Cerrar ese día'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button size="sm" variant="ghost" className="-ml-2 mt-1 min-h-11 px-2 text-[12px] font-medium md:min-h-7"
        disabled={cargandoTodos} aria-expanded={todos} onClick={() => void verTodos(!todos)}>
        {cargandoTodos ? 'Cargando…' : todos ? 'Ver solo los próximos 21 días' : 'Ver todos los festivos con clases'}
        <ChevronDown aria-hidden className={todos ? 'size-3.5 rotate-180' : 'size-3.5'} />
      </Button>
      {errorTodos && <p role="alert" className="text-[11px] font-medium text-destructive">{errorTodos}</p>}

      <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
        {zona ? `Festivos oficiales de ${zona}, según la dirección de tu estudio. ` : ''}
        {/* Con festivos propios guardados (módulo Festivos), los locales que añadió también cuentan. */}
        {lista.propios ? 'Y los que has añadido en Festivos.' : 'No incluye las fiestas locales de tu municipio.'}
        {corrigeDireccion
          ? <> Si la dirección no es la de tu sala, <Link href="/configuracion?tab=estudio#datos-y-contacto" className="underline underline-offset-2">corrígela</Link>.</>
          : ' Si la dirección no es la de tu sala, puede corregirla la propietaria en Configuración.'}
      </p>

      <ConfirmDialog
        open={cerrando !== null}
        onOpenChange={v => { if (!v) setCerrando(null); }}
        titulo={cerrando ? `¿Cerrar el ${fechaDelFestivo(cerrando.fecha, hoy)}?` : ''}
        descripcion={cerrando
          ? `${consecuenciasDelCierre({ cuando: 'Ese día', dias: 1, devuelveSesion, clases: cerrando.clases })} `
            + 'Quitar el cierre después no devuelve las clases.'
          : undefined}
        textoConfirmar="Sí, cerrar ese día"
        destructivo
        onConfirm={() => {
          const f = cerrando;
          setCerrando(null);
          if (f) void decidir(f, 'cerrar');
        }}
      />
    </div>
  );
}
