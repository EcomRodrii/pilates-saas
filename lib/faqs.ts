// Las preguntas frecuentes del panel, en datos y no dentro del componente.
//
// Están aquí para que se puedan comprobar: una respuesta equivocada no es un
// detalle de copia, es la dueña repitiéndole a sus clientas algo que el
// producto no hace. Ver e2e/ayuda-no-miente.spec.ts.

export interface FaqItem {
  pregunta: string;
  respuesta: string;
  categoria: string;
}

export const FAQS: FaqItem[] = [
  { categoria: 'Reservas', pregunta: '¿Cómo reservan clase mis clientas?', respuesta: 'Desde tu página de reservas pública. También puedes reservarles clase tú desde el Calendario del panel.' },
  { categoria: 'Reservas', pregunta: '¿Qué pasa si una clase está completa?', respuesta: 'La clienta entra automáticamente en lista de espera. Si se libera una plaza (cancelación), sube la primera de la lista y se le notifica.' },
  { categoria: 'Reservas', pregunta: '¿Puedo cancelar una clase y avisar a los inscritos?', respuesta: 'Sí, desde Calendario > clase > Cancelar. Se marca como cancelada y las clientas con reserva reciben un aviso.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo creo un nuevo plan o bono?', respuesta: 'En Configuración > Planes y tarifas > Nuevo plan. Define nombre, tipo (mensual, bono o puntual), precio y sesiones incluidas.' },
  { categoria: 'Planes y cobros', pregunta: '¿Cómo cobro a una clienta?', respuesta: 'Desde Transacciones puedes marcar un recibo como cobrado manualmente, o conectar Stripe en Configuración > Integraciones para cobros automáticos con tarjeta guardada.' },
  { categoria: 'Planes y cobros', pregunta: '¿Se generan facturas automáticamente?', respuesta: 'Sí, cada cobro genera su factura correspondiente, disponible en Facturas y descargable en PDF.' },
  // ⚠️ Aquí vivían las dos preguntas de "Portal de clientas". El portal de la
  // alumna se retiró, y una ayuda que sigue mandando a una pantalla que ya no
  // existe es exactamente el fallo que `e2e/ayuda-no-miente.spec.ts` llevaba
  // tres rondas cazando: la dueña lo lee, se lo repite a su clienta, y la
  // manda a la nada. Se sustituyen por lo que SÍ es cierto hoy.
  { categoria: 'Reservas', pregunta: '¿Cómo se apunta una clienta nueva?', respuesta: 'Sola, desde tu página pública de reservas: solo necesita su email. Tú no tienes que darla de alta ni enviarle nada. Si prefieres hacerlo tú, la das de alta desde Clientas > Nueva.' },
  { categoria: 'Gamificación', pregunta: '¿Qué son los créditos y cómo se ganan?', respuesta: 'Recompensan acciones como asistir a clase, completar una semana o renovar un plan. Tú decides cuántos créditos vale cada una en Configuración > Recompensas.' },
  { categoria: 'Gamificación', pregunta: '¿Para qué sirven los créditos?', respuesta: 'Las clientas los canjean por recompensas de tu catálogo (Configuración > Recompensas > Catálogo) — una clase gratis, merchandising, lo que tú ofrezcas.' },
  { categoria: 'Gamificación', pregunta: '¿Cómo funcionan los logros?', respuesta: 'Se desbloquean automáticamente al alcanzar un umbral (ej. 10 clases asistidas). Los defines en Configuración > Logros, con su icono y créditos de regalo.' },
  { categoria: 'Gamificación', pregunta: '¿Y los niveles (Bronce, Plata...)?', respuesta: 'Se calculan sobre el total histórico de créditos ganados por la clienta. Configúralos en Configuración > Niveles — nombres, colores y umbrales son totalmente tuyos.' },
  { categoria: 'Gamificación', pregunta: '¿Qué es la racha?', respuesta: 'Cuenta las semanas consecutivas en las que la clienta ha asistido a al menos una clase. Se muestra en su Home y le avisa si está en riesgo de perderla.' },
  { categoria: 'Automatización', pregunta: '¿Qué hace el sistema autónomo / Automatizaciones?', respuesta: 'Detecta situaciones (clientas inactivas, bonos a punto de acabar, pagos pendientes...) y sugiere o ejecuta acciones automáticas como recordatorios.' },
  { categoria: 'Equipo', pregunta: '¿Puedo dar acceso a mi equipo?', respuesta: 'Sí, en Equipo puedes invitar instructoras o recepción con permisos distintos a los tuyos como propietaria.' },
  { categoria: 'Cuenta', pregunta: '¿Cómo cambio los datos de mi estudio?', respuesta: 'En Configuración > Estudio: nombre, NIF, dirección, color de marca y logo.' },
];

