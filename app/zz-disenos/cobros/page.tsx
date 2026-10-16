'use client';

// TEMPORAL — página de maquetas de Cobros e Informes para capturas. No se commitea.
import { Marco, Nota, Tarjeta } from './comun';
import { DisenoDeben, FichaDeudora, MenuRecibo } from './deben';
import { DisenoCobrado } from './cobrado';
import { DisenoCambios, DisenoGestoria, VarianteFacturas } from './gestoria';
import { BarraSeleccion, DialogoNuevoCobro, DialogoRemesa, ProximasCuotas } from './dialogos';
import { DisenoIpad, DisenoMovilCobros } from './movil';
import { DisenoInformes, DisenoInformesMovil } from './informes';
import { DEUDORAS } from './datos';

const DECISIONES: [number, string, string][] = [
  [1, 'Una línea que responde, sin las 4 tarjetas', '«Te deben 696 € · 7 clientas | Cobrado en octubre 1.284 €». Fuera las tarjetas con icono de color y el «ingreso medio por clienta», que no se entendía.'],
  [2, '«Quién me debe» por clienta, con su ficha al lado', 'La deuda más antigua primero. La ficha dice con qué se le puede cobrar (tarjeta, domiciliación o nada) y solo ofrece lo que funciona para ella. WhatsApp con el importe ya escrito.'],
  [3, '«Lo que he cobrado» es solo lo cobrado', 'Hoy, semana o mes, frente al mismo tramo anterior, y cómo te han pagado, para cuadrar la caja. La descarga para la gestoría baja lo cobrado (hoy baja lo que te deben).'],
  [4, 'Un solo «Nuevo cobro»', 'Se va «Nueva factura»: importe con IVA, «¿ya te lo ha pagado?» y cómo. Se apunta en la caja.'],
  [5, '«Cobrar varias» pasa a «Seleccionar varias»', 'Sobre la propia lista, y pregunta cómo pagan. Hoy cobra sin método y no entra en la caja.'],
  [6, 'La remesa, con vista previa y con salida (ya decidido)', 'Qué entra y qué no, y por qué. Lo que está en el banco: «El banco lo ha cobrado» o «El banco lo devolvió». En un cobro, «Le he devuelto el dinero» no es lo mismo que «El banco lo devolvió».'],
  [7, 'Fuera «Ver las suscripciones activas»: «Próximas cuotas»', 'Sus botones «Cambiar plan» y «Cancelar» no hacen nada (eso ya está en la ficha). En su lugar, cómo se va a cobrar cada cuota y aviso si la tarjeta caduca antes.'],
  [8, '«Facturas» pasa a «Para tu gestoría»', 'Si no facturas con Tentare (hoy, todos los estudios): el trimestre, el cierre del año y enviárselo a tu gestoría. Si facturas, una línea con base, IVA y total del mismo periodo.'],
  [9, 'Informes: un titular con tres hechos', 'Y cada uno frente al mismo tramo del periodo anterior. Hoy compara ventanas de distinta forma, y Facturas compara 2 días con un mes entero (sale −33 % el día 2).'],
  [10, 'Mes con flechas, trimestre natural y año', 'Se puede ver un mes ya cerrado. «Últimos 3 meses» pasa a ser el trimestre de la gestoría.'],
  [11, 'Tres bloques: Dinero · Clases · Clientas', 'Fuera «Ingresos del mes» (repetía la primera cifra) y «Clases más populares» (entra en la tabla de Clases). «Las que más vienen» cuenta clases a las que vinieron, no reservas futuras.'],
  [12, '«Ventas por tipo» según el motivo de cada cobro', 'Cuotas, bonos, clases sueltas, sesiones privadas, caja y otros. Hoy las privadas caen en «Otros», y un «Nuevo cobro» a quien tiene cuota cuenta como cuota aunque sea una venta.'],
];

function Leyenda() {
  return (
    <Tarjeta className="w-[1180px] p-6">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que decides tú · cada número sale en las capturas</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
        {DECISIONES.map(([n, t, d]) => (
          <li key={n} className="flex gap-3">
            <Nota n={n} />
            <div>
              <p className="text-[14.5px] font-semibold text-foreground">{t}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{d}</p>
            </div>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

const MAPA: [string, string][] = [
  ['Cobros · Pestañas: Quién me debe · Lo que he cobrado · Facturas · Cambios del equipo', 'Igual. «Facturas» se llama «Para tu gestoría» si no facturas con Tentare (8).'],
  ['Las 4 tarjetas (cobrado, pendiente, clientas con deuda, ingreso medio)', 'La línea de arriba (1). El ingreso medio, en Informes y diciendo sobre quién se calcula.'],
  ['Preparar recibos para el banco', 'Igual, con su nombre y una vista previa antes de generar el fichero (6).'],
  ['Nueva factura · Nuevo cobro', 'Un solo «Nuevo cobro» (4).'],
  ['«Ver»: desplegable con 7 estados', 'Chips con el número de clientas: devuelto por el banco, no se pudo cobrar, sin cobrar, se reintenta solo.'],
  ['Cobrar varias a la vez', '«Seleccionar varias» sobre la lista, preguntando el método (5).'],
  ['Ver las N suscripciones activas', '«Próximas cuotas» (7). Cambiar o cancelar un plan, en la ficha de la clienta, como ya está.'],
  ['Buscar · Desde · Hasta · Orden · CSV', 'Buscar, igual. Orden: la deuda más antigua primero. Fechas y descarga, en «Lo que he cobrado».'],
  ['Por recibo: Cobrar · Online · Marcar devuelto · Sin factura · Devolver · Reintentar · Eliminar', 'En la ficha de la clienta y en el ⋯ de cada recibo. «Cobrar con su tarjeta» pide confirmar. «Devolver» se separa en dos (6).'],
  ['Pedir la tarjeta (enlace)', 'En la ficha, cuando no tiene o le ha caducado.'],
  ['Lo que he cobrado: buscar · mes · estado · exportar', 'Hoy / semana / mes con flechas, buscar, «Descargar para la gestoría» (solo lo cobrado) y «Cerrar la caja».'],
  ['Facturas: CSV · 4 tarjetas · aviso de NIF · Veri*Factu · buscar · por mes o cliente · Ver / PDF', '«Para tu gestoría»; o, si facturas, una línea del periodo, Veri*Factu en una frase y la lista igual.'],
  ['Cambios del equipo (párrafo de 9 líneas + filtros)', 'Una línea y «Qué se registra»; filtros y lista, igual.'],
  ['Informes · Periodo: semana · mes · últimos 3 meses · año', 'Semana · mes con flechas · trimestre natural · año (10).'],
  ['Informes · 4 cifras', 'Titular y 3 cifras con su comparación (9). «Ingresos del mes» se quita: repetía la primera.'],
  ['Evolución de ingresos · Ventas por tipo · Reservas de plataformas', 'En «Dinero»: gráfico de un color con el mes anterior, 6 tipos (12) y las plataformas en una línea.'],
  ['Ocupación por tipo · Clases más populares · Margen por clase', 'Una tabla en «Clases», desplegable por franja, con enlace al Centro de Control si hay propuesta (11).'],
  ['Cohortes · Top 5 clientas', 'En «Clientas», con activas, pausadas, sin renovar y nuevas. Sin medallas.'],
  ['Exportar CSV · Descargar PDF', '«Descargar» arriba, y «Cierre para la gestoría».'],
];

function Mapa() {
  return (
    <Tarjeta className="w-[1180px] p-6">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Dónde queda cada cosa de hoy · no se quita nada sin decirlo</p>
      <div className="mt-3 divide-y divide-border">
        {MAPA.map(([hoy, nuevo]) => (
          <div key={hoy} className="grid grid-cols-[1fr_1fr] gap-6 py-2.5">
            <p className="text-[13.5px] font-medium text-foreground">{hoy}</p>
            <p className="text-[13.5px] text-muted-foreground text-pretty">{nuevo}</p>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

export default function DisenosCobros() {
  return (
    <div className="min-h-screen space-y-16 bg-background p-8">
      <div id="c0" className="w-fit"><Leyenda /></div>
      <div id="c0b" className="w-fit"><Mapa /></div>
      <div id="c1" className="w-fit"><Marco ancho={1440} activo="Cobros" sinRelleno><DisenoDeben /></Marco></div>
      <div id="c2" className="w-fit"><Marco ancho={1440} activo="Cobros" sinRelleno><DisenoCobrado /></Marco></div>
      <div id="c3" className="w-fit">
        <div className="flex items-start gap-8 rounded-3xl bg-foreground/[0.06] p-8">
          <FichaDeudora d={DEUDORAS[1]} />
          <div className="space-y-6"><DialogoNuevoCobro /><MenuRecibo /></div>
          <DialogoRemesa />
        </div>
      </div>
      <div id="c3b" className="w-fit">
        <div className="space-y-8 rounded-3xl bg-foreground/[0.06] p-8">
          <div className="flex items-start gap-8"><BarraSeleccion /><ProximasCuotas /></div>
          <VarianteFacturas />
        </div>
      </div>
      <div id="c4" className="w-fit"><Marco ancho={1440} activo="Cobros" sinRelleno><DisenoGestoria /></Marco></div>
      <div id="c4b" className="w-fit"><Marco ancho={1440} activo="Cobros" sinRelleno><DisenoCambios /></Marco></div>
      <div id="c5" className="w-fit"><DisenoIpad /></div>
      <div id="c6" className="w-fit p-2"><DisenoMovilCobros /></div>
      <div id="i1" className="w-fit"><Marco ancho={1440} activo="Informes" sinRelleno><DisenoInformes /></Marco></div>
      <div id="i2" className="w-fit p-2"><DisenoInformesMovil /></div>
    </div>
  );
}
