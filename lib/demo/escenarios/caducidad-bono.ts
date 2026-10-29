// Escenario «caducidad_bono»: qué le pasa a un bono con fecha de fin cuando la
// alumna avisa de que no va a una clase, y qué ocurre con lo que le queda al
// pasar la fecha.
//
// ⚠️ Todo se calcula con las MISMAS funciones que usa el producto
// (lib/bono-logic.ts y lib/booking-logic.ts). Aquí no hay una segunda copia de
// la regla: si cambia en el producto, esta demo cambia con ella.
//
// Lo que Tentare hace de verdad (y por eso es lo único que la demo afirma):
//   · el bono lleva una fecha de fin (`validezDias` desde la compra); un bono
//     vale TODO ese día y deja de valer el siguiente (`fechaFin >= hoy`);
//   · cancelar a tiempo devuelve la sesión; cancelar tarde la devuelve solo si
//     el estudio lo ha decidido así (`debeDevolverBono`);
//   · una sesión no se devuelve a un bono ya caducado (`bonoDevolvible`);
//   · lo que sobra al pasar la fecha no se arrastra.
// NO hay un proceso que «caduque los bonos cada domingo»: caducan en SU fecha.
import { z } from 'zod';
import type { PlanTarifa, Suscripcion } from '../../types.ts';
import {
  bonoConsumible, bonoDevolvible, calcularConsumoBono, tieneEntitlementActivo,
} from '../../bono-logic.ts';
import { debeDevolverBono, esCancelacionTardia } from '../../booking-logic.ts';
import type { Bloque, Comprobacion, DemoGenerada, PasoDemo } from '../modelo.ts';
import { CONTEXTO_POR_DEFECTO, type ContextoDemo } from '../centros.ts';
import type { PantallaPanel } from '../modelo.ts';
import {
  DIAS, ETIQUETA_DIA, HORA_CLASE, LUNES_DEMO, diaMadrid, etiquetaFecha, fechaDeDia, haceCuanto,
  indiceDia, inicioClaseISO, sumarDias,
} from '../fechas.ts';

export const parametros = z.strictObject({
  sesionesTotales: z.number().int().min(1).max(20).default(10),
  restantesAntesDeReservar: z.number().int().min(1).max(20).default(4),
  caducaDia: z.enum(DIAS).default('domingo'),
  diaClase: z.enum(DIAS).default('miercoles'),
  avisoHorasAntes: z.number().int().min(1).max(72).default(24),
  ventanaCancelacionHoras: z.number().int().min(0).max(48).default(12),
  devolverEnTardia: z.boolean().default(false),
}).superRefine((p, ctx) => {
  if (p.restantesAntesDeReservar > p.sesionesTotales) {
    ctx.addIssue({ code: 'custom', path: ['restantesAntesDeReservar'], message: 'No pueden quedar más sesiones que las del bono.' });
  }
  if (indiceDia(p.caducaDia) < indiceDia(p.diaClase)) {
    ctx.addIssue({ code: 'custom', path: ['caducaDia'], message: 'La clase tiene que ser antes de que caduque el bono.' });
  }
});
export type Parametros = z.infer<typeof parametros>;

const ALUMNA = 'alumna-demo';

export function generar(p: Parametros, ctx: ContextoDemo = CONTEXTO_POR_DEFECTO): DemoGenerada {
  const caducaISO = fechaDeDia(p.caducaDia);
  const diaSiguiente = sumarDias(caducaISO, 1);
  const inicio = inicioClaseISO(p.diaClase);
  const ahoraAviso = new Date(new Date(inicio).getTime() - p.avisoHorasAntes * 3_600_000);
  const fechaAviso = diaMadrid(ahoraAviso);
  const fechaReserva = sumarDias(fechaAviso, -1);

  const plan = {
    id: 'plan-bono', studioId: 'demo', nombre: `Bono ${p.sesionesTotales} clases`, descripcion: null, precio: 0,
    tipo: 'BONO', sesiones: p.sesionesTotales, validezDias: null, activo: true,
  } as unknown as PlanTarifa;
  const suscripcion = (restantes: number): Suscripcion => ({
    id: 'sus-demo', studioId: 'demo', socioId: ALUMNA, planId: plan.id, estado: 'ACTIVA',
    fechaInicio: LUNES_DEMO, fechaFin: caducaISO, sesionesRestantes: restantes, stripeSubscriptionId: null,
  });
  const estadoBono = (restantes: number, hoyISO: string): 'vigente' | 'caducado' | 'agotado' =>
    caducaISO < hoyISO ? 'caducado' : restantes === 0 ? 'agotado' : 'vigente';
  const bonoBloque = (restantes: number, hoyISO: string): Bloque => ({
    tipo: 'bono', nombre: plan.nombre, restantes, total: p.sesionesTotales, caducaEl: caducaISO,
    caducaEtiqueta: ETIQUETA_DIA[p.caducaDia], estado: estadoBono(restantes, hoyISO),
  });

  // 1 · Reservar: se descuenta una sesión (el bono elegido por la regla del producto).
  const elegido = bonoConsumible(ALUMNA, [suscripcion(p.restantesAntesDeReservar)], [plan], fechaReserva, null);
  const restantesTrasReservar = calcularConsumoBono(elegido?.sesionesRestantes ?? 0).nuevasRestantes;

  // 2 · Avisar de que no va: ¿a tiempo o tarde? ¿se devuelve la sesión?
  const tardia = esCancelacionTardia(inicio, ahoraAviso, p.ventanaCancelacionHoras);
  const quiereDevolver = debeDevolverBono(inicio, ahoraAviso, p.ventanaCancelacionHoras, p.devolverEnTardia);
  const sitioParaDevolver = bonoDevolvible(ALUMNA, [suscripcion(restantesTrasReservar)], [plan], fechaAviso, null);
  const devuelta = quiereDevolver && sitioParaDevolver !== null;
  const restantesTrasAviso = restantesTrasReservar + (devuelta ? 1 : 0);

  // 3 · El último día vale; el siguiente ya no.
  const vigenteElUltimoDia = tieneEntitlementActivo(ALUMNA, [suscripcion(restantesTrasAviso)], [plan], caducaISO);
  const vigenteAlSiguiente = tieneEntitlementActivo(ALUMNA, [suscripcion(restantesTrasAviso)], [plan], diaSiguiente);
  const consumibleAlSiguiente = bonoConsumible(ALUMNA, [suscripcion(restantesTrasAviso)], [plan], diaSiguiente, null);
  const sesionesPerdidas = restantesTrasAviso;

  // Excepciones calculadas con las mismas funciones.
  const avisoTardio = new Date(new Date(inicio).getTime() - 3_600_000);
  const devolveriaTardio = debeDevolverBono(inicio, avisoTardio, p.ventanaCancelacionHoras, p.devolverEnTardia);
  const devolveriaTrasCaducar = bonoDevolvible(ALUMNA, [suscripcion(restantesTrasReservar)], [plan], diaSiguiente, null) !== null;

  const eventosSemana = DIAS.map((d) => {
    const eventos: { texto: string; tono: 'neutro' | 'ok' | 'aviso' | 'malo' }[] = [];
    if (d === p.diaClase) eventos.push({ texto: `${ctx.clase} · ${HORA_CLASE}`, tono: 'neutro' });
    if (fechaDeDia(d) === fechaAviso) eventos.push({ texto: `Avisa: no va (${haceCuanto(p.avisoHorasAntes)})`, tono: tardia ? 'aviso' : 'ok' });
    if (d === p.caducaDia) eventos.push({ texto: 'Último día del bono', tono: 'aviso' });
    return { dia: ETIQUETA_DIA[d], eventos };
  });

  // La clienta de ejemplo del panel real (`soc-1`) con SU bono en cada paso, contado en días desde el «hoy» de ese paso.
  const dias = (de: string, a: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
  const ficha = (restantes: number, hoy: string, titular?: string, detalle?: string): PantallaPanel => ({
    ruta: '/clientas/soc-1',
    bonos: [{ nombre: plan.nombre, restantes, total: p.sesionesTotales, caducaEnDias: dias(hoy, caducaISO) }],
    titular, detalle, foco: plan.nombre,
  });

  const regla = {
    ventana: {
      texto: p.ventanaCancelacionHoras > 0
        ? `Cancelar con menos de ${p.ventanaCancelacionHoras} h de antelación es «tardío».`
        : 'No hay ventana de cancelación: toda cancelación cuenta como a tiempo.',
      fuente: 'esCancelacionTardia · ventana de cancelación del estudio',
    },
    devolucion: {
      texto: p.devolverEnTardia
        ? 'El estudio devuelve la sesión aunque se avise tarde.'
        : 'Si se avisa tarde, la sesión no se devuelve; si se avisa a tiempo, sí.',
      fuente: 'debeDevolverBono · «devolver sesión en cancelación tardía»',
    },
    vigencia: {
      texto: 'El bono vale todo su último día y deja de valer al siguiente. Lo que sobra no se arrastra.',
      fuente: 'tieneEntitlementActivo / bonoConsumible: fechaFin >= hoy',
    },
    caducado: {
      texto: 'A un bono ya caducado no se le devuelve ninguna sesión.',
      fuente: 'bonoDevolvible: solo bonos vigentes',
    },
  };

  const pasos: PasoDemo[] = [
    {
      pantalla: { ruta: '/configuracion?tab=reservas', reglas: { ventanaCancelacionHoras: p.ventanaCancelacionHoras, devolverBonoEnTardia: p.devolverEnTardia }, foco: 'Plazo para cancelar sin perder la sesión', titular: 'Las reglas del estudio', detalle: 'El plazo para cancelar y si se devuelve la sesión si se avisa tarde.' },
      id: 'configuracion', titulo: 'Las reglas del estudio',
      proposito: 'Antes de que ocurra nada, el estudio decide dos cosas: cuánta antelación pide y si devuelve la sesión cuando se avisa tarde.',
      bloques: [
        { tipo: 'tabla', filas: [
          { k: 'Ventana de cancelación', v: p.ventanaCancelacionHoras > 0 ? `${p.ventanaCancelacionHoras} h antes de la clase` : 'Sin ventana' },
          { k: 'Devolver sesión si se avisa tarde', v: p.devolverEnTardia ? 'Sí' : 'No' },
          { k: 'Bono', v: `${p.sesionesTotales} clases, vale hasta el ${ETIQUETA_DIA[p.caducaDia]}` },
        ] },
      ],
      porQue: [regla.ventana, regla.devolucion],
      configura: [
        { donde: 'Configuración → Reservas → Cancelar y recuperar', ajuste: 'Plazo para cancelar sin perder la sesión (horas antes)', valor: p.ventanaCancelacionHoras > 0 ? `${p.ventanaCancelacionHoras} h` : 'Sin ventana' },
        { donde: 'Configuración → Reservas → Cancelar y recuperar', ajuste: 'Devolver la sesión del bono en cancelaciones tardías', valor: p.devolverEnTardia ? 'Activado' : 'Desactivado' },
        { donde: 'Productos → plan de tipo bono', ajuste: 'Validez (días desde la compra)', valor: `hasta el ${ETIQUETA_DIA[p.caducaDia]}` },
      ],
    },
    {
      pantalla: ficha(p.restantesAntesDeReservar, fechaReserva, 'El bono de la alumna', `Le quedan ${p.restantesAntesDeReservar} sesiones y vale hasta el ${ETIQUETA_DIA[p.caducaDia]}.`),
      id: 'bono', titulo: 'La alumna y su bono',
      proposito: 'Este es el punto de partida: un bono con sesiones por gastar y una fecha de fin.',
      bloques: [bonoBloque(p.restantesAntesDeReservar, fechaReserva), { tipo: 'semana', dias: eventosSemana.map((d) => ({ ...d, eventos: [] })) }],
      porQue: [regla.vigencia],
    },
    {
      pantalla: ficha(restantesTrasReservar, fechaReserva, 'Reserva la clase', `Se descuenta una sesión: ${p.restantesAntesDeReservar} → ${restantesTrasReservar}.`),
      id: 'reserva', titulo: 'Reserva la clase',
      proposito: 'Al reservar, Tentare descuenta una sesión del bono que corresponde.',
      bloques: [
        bonoBloque(restantesTrasReservar, fechaReserva),
        { tipo: 'texto', texto: `Reserva la clase del ${ETIQUETA_DIA[p.diaClase]}. El bono pasa de ${p.restantesAntesDeReservar} a ${restantesTrasReservar} sesiones.` },
      ],
      porQue: [{ texto: 'La sesión se descuenta al reservar, no al asistir.', fuente: 'bonoConsumible + calcularConsumoBono' }],
    },
    {
      pantalla: ficha(restantesTrasAviso, fechaAviso, tardia ? 'Aviso tardío' : 'Aviso a tiempo', devuelta ? `Se le devuelve la sesión: vuelve a ${restantesTrasAviso}.` : `No se le devuelve la sesión: se queda en ${restantesTrasAviso}.`),
      id: 'aviso', titulo: 'Avisa de que no puede ir',
      proposito: 'Aquí se decide si la sesión vuelve al bono. Depende solo de cuándo avisa.',
      bloques: [
        { tipo: 'semana', dias: eventosSemana },
        { tipo: 'resultado',
          titular: tardia ? 'Aviso tardío' : 'Aviso a tiempo',
          detalle: devuelta
            ? `Se le devuelve la sesión: el bono vuelve a ${restantesTrasAviso}.`
            : quiereDevolver
              ? 'La regla pediría devolverla, pero el bono ya no está vigente: no hay dónde devolverla.'
              : `No se le devuelve la sesión: el bono se queda en ${restantesTrasAviso}.`,
          tono: devuelta ? 'ok' : 'aviso' },
      ],
      porQue: [regla.ventana, regla.devolucion],
    },
    {
      pantalla: ficha(restantesTrasAviso, caducaISO, `El último día (${ETIQUETA_DIA[p.caducaDia]})`, 'Hoy el bono todavía vale. Mañana ya no.'),
      id: 'caducidad', titulo: `Llega el final del ${ETIQUETA_DIA[p.caducaDia]}`,
      proposito: 'Comprobamos qué vale el bono el último día y qué pasa cuando termina.',
      bloques: [
        bonoBloque(restantesTrasAviso, caducaISO),
        { tipo: 'tabla', filas: [
          { k: `El ${etiquetaFecha(caducaISO)}`, v: vigenteElUltimoDia ? 'Todavía vale' : 'Sin sesiones que gastar', tono: vigenteElUltimoDia ? 'ok' : 'neutro' },
          { k: `El ${etiquetaFecha(diaSiguiente)}`, v: vigenteAlSiguiente ? 'Vale' : 'Caducado: ya no se puede reservar con él', tono: 'malo' },
        ] },
        bonoBloque(restantesTrasAviso, diaSiguiente),
      ],
      porQue: [regla.vigencia],
    },
    {
      pantalla: ficha(restantesTrasAviso, diaSiguiente, sesionesPerdidas === 0 ? 'No se pierde ninguna sesión' : `Caducan ${sesionesPerdidas} sesiones`, 'El bono ya está caducado: lo que sobra no se arrastra.'),
      id: 'resultado', titulo: 'El resultado',
      proposito: 'Qué se queda la alumna y qué se pierde, y por qué.',
      bloques: [
        { tipo: 'resultado',
          titular: sesionesPerdidas === 0 ? 'No se pierde ninguna sesión' : `Caducan ${sesionesPerdidas} ${sesionesPerdidas === 1 ? 'sesión' : 'sesiones'}`,
          detalle: sesionesPerdidas === 0
            ? 'La alumna gastó todo el bono dentro de su vigencia.'
            : `Las sesiones sin gastar al terminar el ${ETIQUETA_DIA[p.caducaDia]} no se arrastran. Que avisara de su ausencia no cambia la fecha de fin: solo decide si recupera esa sesión antes.`,
          tono: sesionesPerdidas === 0 ? 'ok' : 'aviso' },
        { tipo: 'tabla', filas: [
          { k: 'Sesiones al reservar', v: String(p.restantesAntesDeReservar) },
          { k: 'Tras reservar', v: String(restantesTrasReservar) },
          { k: devuelta ? 'Tras avisar (devuelta)' : 'Tras avisar (no devuelta)', v: String(restantesTrasAviso) },
          { k: 'Al caducar', v: String(sesionesPerdidas), tono: sesionesPerdidas ? 'aviso' : 'ok' },
        ] },
      ],
      porQue: [regla.vigencia, regla.devolucion],
    },
    {
      pantalla: ficha(restantesTrasAviso, diaSiguiente, 'Otros casos', 'Con el bono ya caducado, no se devuelve ninguna sesión.'),
      id: 'excepciones', titulo: 'Qué cambiaría en otros casos',
      proposito: 'Las dos situaciones que más preguntan los estudios, calculadas con las mismas reglas.',
      bloques: [
        { tipo: 'tabla', filas: [
          { k: 'Si avisara con solo 1 h de margen', v: devolveriaTardio ? 'Se devolvería la sesión' : 'No se devolvería la sesión', tono: devolveriaTardio ? 'ok' : 'aviso' },
          { k: `Si avisara después del ${ETIQUETA_DIA[p.caducaDia]}`, v: devolveriaTrasCaducar ? 'Se devolvería' : 'No se devolvería: el bono ya caducó', tono: devolveriaTrasCaducar ? 'ok' : 'aviso' },
        ] },
      ],
      porQue: [regla.devolucion, regla.caducado],
    },
  ];

  const comprobaciones: Comprobacion[] = [
    { id: 'saldo-cuadra', descripcion: 'Las sesiones al caducar son las de partida, menos la reservada, más la devuelta.',
      ok: sesionesPerdidas === p.restantesAntesDeReservar - 1 + (devuelta ? 1 : 0) },
    { id: 'vale-el-ultimo-dia', descripcion: 'El bono sigue valiendo todo su último día si le quedan sesiones.',
      ok: vigenteElUltimoDia === (restantesTrasAviso > 0) },
    { id: 'no-vale-al-siguiente', descripcion: 'Al día siguiente no se puede reservar con él.',
      ok: !vigenteAlSiguiente && consumibleAlSiguiente === null },
    { id: 'devolucion-coherente', descripcion: 'Solo se devuelve la sesión si la regla lo pide y el bono sigue vigente.',
      ok: devuelta === (quiereDevolver && fechaAviso <= caducaISO) },
  ];

  return {
    escenario: 'caducidad_bono',
    titulo: 'Caducidad de un bono y ausencia de la alumna',
    objetivo: 'Entender qué pasa con las sesiones de un bono cuando la alumna avisa de que no va y el bono llega a su fecha de fin.',
    modulos: ['Planes y bonos', 'Reservas y cancelaciones'],
    reglasAplicables: [regla.ventana, regla.devolucion, regla.vigencia, regla.caducado],
    entidades: [
      { tipo: 'Estudio', descripcion: `${ctx.estudio} (ficticio), con su política de cancelación.` },
      { tipo: 'Alumna', descripcion: 'Alumna de ejemplo (no es ninguna persona real).' },
      { tipo: 'Bono', descripcion: `${p.sesionesTotales} clases con fecha de fin el ${ETIQUETA_DIA[p.caducaDia]}.` },
      { tipo: 'Clase', descripcion: `${ctx.clase} el ${ETIQUETA_DIA[p.diaClase]} a las ${HORA_CLASE}.` },
    ],
    estadoInicial: `Bono con ${p.restantesAntesDeReservar} sesiones que vale hasta el ${ETIQUETA_DIA[p.caducaDia]}.`,
    acciones: ['Reservar la clase', `Avisar de la ausencia (${haceCuanto(p.avisoHorasAntes)})`, `Llegar al final del ${ETIQUETA_DIA[p.caducaDia]}`],
    resultadoEsperado: devuelta
      ? `Se devuelve la sesión y al caducar ${sesionesPerdidas === 0 ? 'no se pierde nada' : `se pierden ${sesionesPerdidas}`}.`
      : `No se devuelve la sesión y al caducar ${sesionesPerdidas === 0 ? 'no se pierde nada' : `se pierden ${sesionesPerdidas}`}.`,
    pasos,
    excepciones: [
      'Un bono vale todo su último día: caducar «hoy» todavía cuenta como vigente.',
      'Si la alumna tiene una cuota mensual que cubre la clase, no se descuenta sesión del bono.',
      'Un bono congelado no corre mientras dura la congelación (la fecha de fin se desplaza).',
    ],
    comprobaciones,
  };
}
