# Graph Report - .  (2026-07-23)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3527 nodes · 9676 edges · 168 communities (152 shown, 16 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 156 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b22929e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- supabase-data.ts
- studio-context.tsx
- cn
- types.ts
- theme-editor.tsx
- types.ts
- fetchExterno
- page.tsx
- page.tsx
- director.ts
- getSupabaseAdmin
- permisos.ts
- fetchCriticalStudioData
- Reserva
- useModo
- QrCode
- utils.ts
- dependencies
- route.ts
- auth-server.ts
- db.ts
- api-client.ts
- uid
- errorInterno
- page.tsx
- enviarMensajeTwilio
- useStudio
- page.tsx
- nuevos-especialistas.test.ts
- page.tsx
- senales.ts
- page.tsx
- page.tsx
- confianza.ts
- automatizaciones.ts
- page.tsx
- bloqueoPorFeature
- cierre-engine.ts
- page.tsx
- page.tsx
- use-team-chat-store.ts
- ficha-clinica.ts
- csv.ts
- layout.tsx
- entitlements.ts
- tipos.ts
- backup-engine.ts
- route.ts
- route.ts
- page.frozen.tsx
- contacto.ts
- route.ts
- page.tsx
- ficha-salud.tsx
- route.ts
- agenda.ts
- page.tsx
- components.json
- global-search.tsx
- panel-pendientes.tsx
- page.frozen.tsx
- redaccion.ts
- compilerOptions
- auth-context.tsx
- reserva-calendario.tsx
- billing-guard.ts
- page.tsx
- email.ts
- valoraciones.ts
- tipos-muertos.test.ts
- verifactu.test.ts
- route.ts
- page.tsx
- tab-estudio.tsx
- custom-charts.tsx
- confirmacion-riesgo.ts
- page.tsx
- seed.ts
- profile-avatar.tsx
- booking-logic.test.ts
- achievement-engine.ts
- reward-engine.ts
- route.ts
- route.ts
- page.tsx
- home-editor.tsx
- dunning-server.ts
- captacion.ts
- page.tsx
- tab-integraciones.tsx
- help-widget.tsx
- agenda.test.ts
- ingresos.test.ts
- supabase-admin.ts
- escenarios-reales.test.ts
- retencion.test.ts
- page.tsx
- page.tsx
- page.tsx
- ReservaCalendario
- email.ts
- memoria.test.ts
- motor.test.ts
- page.tsx
- ai-client.ts
- serializeCsv
- seed-dependency-risk.mjs
- page.frozen.tsx
- page.frozen.tsx
- citas-publica.tsx
- calendar-logic.test.ts
- page.tsx
- onboarding-checklist.tsx
- bono-logic.test.ts
- route.ts
- route.ts
- route.ts
- Tentare Brand Icon Mark (logo-mark.png)
- baja-form.tsx
- factura-pdf.ts
- tab-horario-citas.tsx
- portal-notifications.ts
- use-discount-codes-store.ts
- page.tsx
- catalogo-estudio.ts
- context7
- CI Pipeline
- booking.spec.ts
- ocupacion.ts
- generarRecordatoriosRevision
- register
- Next.js Breaking Changes Notice (AGENTS.md)
- page.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- vercel.json
- file.svg (Next.js boilerplate file icon)
- Globe Icon (Next.js Boilerplate)
- Tentare Logo (Horizontal)
- Tentare Brand Icon Mark (Logo Icon PNG)
- Tentare Logo (Stacked)
- Tentare Wordmark Logo
- Vercel Logo (vercel.svg)
- window.svg (Next.js boilerplate icon)

## God Nodes (most connected - your core abstractions)
1. `cn()` - 250 edges
2. `getSupabaseAdmin()` - 171 edges
3. `useStudio()` - 152 edges
4. `reportDbError()` - 141 edges
5. `verificarSesionStaff()` - 133 edges
6. `errorInterno()` - 103 edges
7. `authHeader()` - 64 edges
8. `StudioContextValue` - 60 edges
9. `uid()` - 55 edges
10. `Reserva` - 50 edges

## Surprising Connections (you probably didn't know these)
- `MiPlanPage()` --indirect_call--> `factura()`  [INFERRED]
  app/portal/[slug]/mi-plan/page.tsx → lib/fiscal/cierre-engine.test.ts
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon Mark (Favicon 256x256)`  [INFERRED]
  public/logo-mark.png → app/icon1.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (48x48 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon2.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (32x32 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon3.png
- `Tentare Brand Icon Mark (logo-mark.png)` --source_of--> `Tentare Brand Icon (16x16 Favicon)`  [INFERRED]
  public/logo-mark.png → app/icon4.png

## Import Cycles
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-recompensas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-clases-salas.tsx -> components/configuracion/tab-salas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-retos.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-citas.tsx -> components/configuracion/tab-horario-citas.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-logros.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-gamificacion.tsx -> components/configuracion/tab-niveles.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-clases-salas.tsx -> components/configuracion/tab-clases.tsx -> app/(dashboard)/configuracion/page.tsx`
- 3-file cycle: `app/(dashboard)/configuracion/page.tsx -> components/configuracion/tab-citas.tsx -> components/configuracion/tab-servicios-cita.tsx -> app/(dashboard)/configuracion/page.tsx`

## Communities (168 total, 16 thin omitted)

### Community 0 - "supabase-data.ts"
Cohesion: 0.03
Nodes (112): RowAchievementDefinitions, RowAchievementHistory, RowAchievementProgress, RowActividadReciente, RowAutomationLogs, RowAutomationRules, RowAutomatizaciones, RowBackups (+104 more)

### Community 1 - "studio-context.tsx"
Cohesion: 0.03
Nodes (110): useContentStore(), useDiscountCodesStore(), defaultStudioConfig, StudioConfig, StudioContext, StudioProvider(), cambiarSedeActiva(), condicionSaludToDb() (+102 more)

### Community 2 - "cn"
Cohesion: 0.03
Nodes (70): Leyenda(), CampoEdit(), IconBtn(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount() (+62 more)

### Community 3 - "types.ts"
Cohesion: 0.04
Nodes (81): CitasPublicaProps, calcularNivel(), NivelInfo, niveles, DIAS_SEMANA, disponibilidadVacia(), DURACIONES, FRANJAS (+73 more)

### Community 4 - "theme-editor.tsx"
Cohesion: 0.05
Nodes (67): POST(), GET(), PUT(), metadata, PortalLayout(), viewport, generateMetadata(), ReservarSlugLayout() (+59 more)

### Community 5 - "types.ts"
Cohesion: 0.08
Nodes (58): BibliotecaPage(), CalendarioContenidoPage(), dateKey(), DiaCelda(), DIAS_SEMANA, MESES, PostChip(), sameDay() (+50 more)

### Community 6 - "fetchExterno"
Cohesion: 0.07
Nodes (54): GET(), GET(), POST(), GET(), POST(), POST(), GET(), fetchExterno() (+46 more)

### Community 7 - "page.tsx"
Cohesion: 0.05
Nodes (51): CentroDeControlPage(), accion(), EspecialistaCartera(), ESTADO, eur(), porque(), TarjetaDetalle(), ActivityList() (+43 more)

### Community 8 - "page.tsx"
Cohesion: 0.06
Nodes (52): ColorInput(), ColorSwatch(), ConfiguracionPage(), ConfirmDialog(), Field(), NivelBadge(), SUB_CITAS, SUB_CLASES_SALAS (+44 more)

### Community 9 - "director.ts"
Cohesion: 0.08
Nodes (50): A, B, NOW, rechazadaA, calcularEstadoGeneral(), calcularResumenEjecutivo(), construirMientrasDormias(), construirResumenDiario() (+42 more)

### Community 10 - "getSupabaseAdmin"
Cohesion: 0.09
Nodes (41): POST(), POST(), GET(), GET(), mapRow(), POST(), appUrl(), DELETE() (+33 more)

### Community 11 - "permisos.ts"
Cohesion: 0.07
Nodes (45): DashboardLayout(), btnPrimary, BULLETS, SuscripcionPage(), AppearancePanel(), ProfileMenu(), BottomNavItem(), MasDrawer() (+37 more)

### Community 12 - "fetchCriticalStudioData"
Cohesion: 0.06
Nodes (57): asignarSpotReserva(), cargarContextoGamificacion(), cargarPoliticaEstudio(), checkinPublico(), consumirBonoServidor(), crearReservaPublica(), datosClaseParaEmail(), devolverBonoServidor() (+49 more)

### Community 13 - "Reserva"
Cohesion: 0.10
Nodes (44): EntradaMientrasDormias, IndicesSenal, SnapshotEstudio, MetricaContexto, AutomationCandidato, AutomationEngineInput, computeAutomationCandidatos(), diasAntes() (+36 more)

### Community 14 - "useModo"
Cohesion: 0.10
Nodes (36): Filtro, PreferenciasPage(), EMPTY_COPY, ESTADO_BADGE, MisReservasPage(), Tab, CATEGORIAS, GRADIENTS (+28 more)

### Community 15 - "QrCode"
Cohesion: 0.09
Nodes (11): qrSvgMarkup(), appendBits(), assert(), bit, byte, Ecc, getBit(), int (+3 more)

### Community 16 - "utils.ts"
Cohesion: 0.07
Nodes (35): CitaCard(), CitaCardProps, CitasPage(), DURACIONES, duracionMin(), ESTADO_BADGE, formatFecha(), isSameMonth() (+27 more)

### Community 17 - "dependencies"
Cohesion: 0.04
Nodes (48): dependencies, @anthropic-ai/sdk, aws4fetch, @base-ui/react, class-variance-authority, clsx, date-fns, @dnd-kit/core (+40 more)

### Community 18 - "route.ts"
Cohesion: 0.10
Nodes (32): AceptarForm(), Resultado, AceptarPage(), cuandoTexto(), EN_JUEGO, cargarClases(), GET(), POST() (+24 more)

### Community 19 - "auth-server.ts"
Cohesion: 0.11
Nodes (33): POST(), POST(), POST(), POST(), cuandoTexto(), GET(), POST(), POST() (+25 more)

### Community 20 - "db.ts"
Cohesion: 0.12
Nodes (42): POST(), POST(), construirMapaMemoria(), construirRecomendacion(), db(), dbActualizarOutcome(), dbCountAutonomasHoy(), dbFinalizarDecisionSession() (+34 more)

### Community 21 - "api-client.ts"
Cohesion: 0.11
Nodes (43): AutonomiaConfig, PilotoAutomatico(), TIPO_LABEL, actualizarConfirmacionRiesgo(), aprobarCobroAutonomo(), authHeader(), avisarSustituta(), cancelarClase() (+35 more)

### Community 22 - "uid"
Cohesion: 0.09
Nodes (36): ACTIVAS, norm(), POST(), COLORES, Cuerpo, dowDe(), norm(), POST() (+28 more)

### Community 23 - "errorInterno"
Cohesion: 0.10
Nodes (30): POST(), POST(), POST(), GET(), GET(), DELETE(), GET(), PATCH() (+22 more)

### Community 24 - "page.tsx"
Cohesion: 0.09
Nodes (31): ESTADO, EstadoMeta, fmtClase(), fmtHora(), fmtMomento(), HorarioActualizadoCard(), nombreCorto(), NuevaBajaDialog() (+23 more)

### Community 25 - "enviarMensajeTwilio"
Cohesion: 0.09
Nodes (31): CoberturaDialog(), CoberturaDialogProps, CandidatoCobertura, candidatosCobertura(), instructores, Datos, enlaceWhatsApp(), mensajeParaSocia() (+23 more)

### Community 26 - "useStudio"
Cohesion: 0.11
Nodes (27): ValoracionesDialog(), PortalAcceso(), ClasesPage(), OCUPA_PLAZA, RESERVA_ACTIVA, Tab, ClaseDetallePage(), NIVEL_LABEL (+19 more)

### Community 27 - "page.tsx"
Cohesion: 0.10
Nodes (29): MejorPublicacionCard(), MetricasPage(), RANGOS, ACCESOS, FilaRendimiento(), Metricilla(), PanelContenidoPage(), startOfWeek() (+21 more)

### Community 28 - "nuevos-especialistas.test.ts"
Cohesion: 0.09
Nodes (23): confianzaRenovarBono(), ESPECIALISTA_POR_ID, equipo, finanzas, redondear2(), reglaF1(), LEADS_ENTRADA, marketing (+15 more)

### Community 29 - "page.tsx"
Cohesion: 0.07
Nodes (28): accionDesc, ConversionFunnelCard(), CopyButton(), destinatariosLabel, EstadoBadge(), formatDateEs(), FUNNEL_STAGES, KpiTrendCard() (+20 more)

### Community 30 - "senales.ts"
Cohesion: 0.16
Nodes (28): frecuenciaUltimas4Semanas(), redondear1(), redondear2(), reglaR1(), reglaR2(), reglaR3(), reglaR4(), reglaR5() (+20 more)

### Community 31 - "page.tsx"
Cohesion: 0.09
Nodes (28): ESTADO_STYLE, EstadoTarjeta, ProgresoPage(), RecompensasTab(), RetosTab(), Tab, TABS, Sub (+20 more)

### Community 32 - "page.tsx"
Cohesion: 0.11
Nodes (25): actividadConfig, ClaseHoyCard(), Dashboard(), formatHora(), KpiCard(), limpiarActividad(), localDate(), MONTH_LABELS (+17 more)

### Community 33 - "confianza.ts"
Cohesion: 0.14
Nodes (30): AUTONOMIA_DECLARADA_POR_TIPO, autonomiaDeNivel(), confianzaAbrirSesion(), confianzaCargaEquipo(), confianzaCobrarPendienteManual(), confianzaCongelarMembresia(), confianzaEnviarReactivacion(), confianzaPrepararCampana() (+22 more)

### Community 34 - "automatizaciones.ts"
Cohesion: 0.10
Nodes (22): CODIGOS_TRANSITORIOS, conReintentoResend(), esErrorTransitorioResend(), ResendEnvioResultado, AutomatizacionMktCandidato, computeAutomatizacionMktCandidatos(), DEDUP_DIAS, personalizar() (+14 more)

### Community 35 - "page.tsx"
Cohesion: 0.11
Nodes (27): addDays(), Calendario(), DIA_PILLS, DiaPill(), DIAS_CORTOS, formatHora(), FormData, hexToRgba() (+19 more)

### Community 36 - "bloqueoPorFeature"
Cohesion: 0.14
Nodes (20): client, POST(), client, POST(), client, POST(), client, PLATAFORMAS_VALIDAS (+12 more)

### Community 37 - "cierre-engine.ts"
Cohesion: 0.11
Nodes (25): CierreDeAnoPage(), emptyForm(), eur(), FormState, MESES, MonthlyBars(), ConfirmDialog(), RowFacturas (+17 more)

### Community 38 - "page.tsx"
Cohesion: 0.09
Nodes (22): AUTONOMY_MODES, BeforeAfter(), CENTRO_CARDS, DAY_MOMENTS, DISCIPLINA_GRADIENTS, DISCIPLINAS, FAQ_ITEMS, FLOW_STEPS (+14 more)

### Community 39 - "page.tsx"
Cohesion: 0.08
Nodes (23): AccProps, ActividadTab(), Asis, COLORES, emptyForm(), EnlaceScope, EquipoPage(), FiltroEstado (+15 more)

### Community 40 - "use-team-chat-store.ts"
Cohesion: 0.12
Nodes (24): AVATAR_COLORS, avatarColor(), ChatEquipoPage(), etiquetaDia(), formatHora(), mismaFechaLocal(), EstadoCarga, EstadoEnvio (+16 more)

### Community 41 - "ficha-clinica.ts"
Cohesion: 0.16
Nodes (25): CondicionCard(), alertaPreClase(), condicionesActivas(), DesgloseRiesgo, diasDesde(), esRestriccionDura(), ETIQUETA_POR_CODIGO, etiquetaRestriccion() (+17 more)

### Community 42 - "csv.ts"
Cohesion: 0.09
Nodes (27): RFC-4180, autoMapear(), autoMapearCita(), autoMapearMembresia(), autoMapearReserva(), CampoMeta, CampoMeta2, CampoMetaCita (+19 more)

### Community 43 - "layout.tsx"
Cohesion: 0.12
Nodes (17): Props, Props, enviarEmailInvitacionEquipo(), InvitacionEquipoEmail(), Props, ROL_LABEL, EmailButton(), EmailInfoRow() (+9 more)

### Community 44 - "entitlements.ts"
Cohesion: 0.17
Nodes (21): POST(), GET(), guard(), PUT(), GET(), PlanGate(), accesoProducto(), Entitlements (+13 more)

### Community 45 - "tipos.ts"
Cohesion: 0.10
Nodes (21): RowResumenDiario, medirOutcome(), ResultadoMedicion, SenalMedicion, ventanaDiasDe(), Confianza, DecisionFeatureFlag, DecisionFlag (+13 more)

### Community 46 - "backup-engine.ts"
Cohesion: 0.19
Nodes (20): POST(), POST(), GET(), BACKUP_TABLES, BackupRow, BackupSnapshot, cargarSnapshot(), crearSnapshot() (+12 more)

### Community 47 - "route.ts"
Cohesion: 0.18
Nodes (21): POST(), BienvenidaEmail(), Props, CancelacionClaseEmail(), esTipoEditable(), interpolar(), MarcaEstudio, PlantillaOverride (+13 more)

### Community 48 - "route.ts"
Cohesion: 0.15
Nodes (15): POST(), STATUS_POR_ERROR, POST(), POST(), POST(), aRespuesta(), bloqueoPorSuscripcion(), elegirMetodoCobro() (+7 more)

### Community 49 - "page.frozen.tsx"
Cohesion: 0.12
Nodes (24): CartItem, CAT_STYLE, catStyle(), CerrarCajaModal(), CerrarCajaModalProps, formatDateLabel(), formatTimeOrDate(), isSameDay() (+16 more)

### Community 50 - "contacto.ts"
Cohesion: 0.16
Nodes (21): crearBaja(), emitirEscalado(), OrigenBaja, ResultadoBaja, alertarPropietaria(), appUrl(), contactarCandidata(), contactarDesde() (+13 more)

### Community 51 - "route.ts"
Cohesion: 0.14
Nodes (16): { GET, POST, PUT }, automatizacionesDispatcher, procesarEstudioAutomatizaciones, EVENTS, inngest, confirmacionRiesgoAskDispatcher, confirmacionRiesgoCorteDispatcher, procesarConfirmacionAskEstudio (+8 more)

### Community 52 - "page.tsx"
Cohesion: 0.11
Nodes (17): AVATAR_COLORS, BADGE_RECIBO, BADGE_RESERVA, Card(), DetalleSocio(), fecha(), LABEL_RECIBO, localDate() (+9 more)

### Community 53 - "ficha-salud.tsx"
Cohesion: 0.10
Nodes (22): CATEGORIA_LABEL, CATEGORIAS, CondicionDialog(), fechaCorta(), FichaSalud(), FormState, formVacio(), isoHoy() (+14 more)

### Community 54 - "route.ts"
Cohesion: 0.19
Nodes (16): actualizarSuscripcion(), POST(), AdminClient, POST(), studioDeCuentaConnect(), capturar(), enviar(), analyticsHabilitado() (+8 more)

### Community 55 - "agenda.ts"
Cohesion: 0.15
Nodes (16): confianzaMoverHorario(), confianzaOcupacionBajaEstructural(), confianzaSesionInfrautilizada(), NOW, agenda, etiquetaFranja(), ocupacionMediaUltimas(), precioMedioSesion() (+8 more)

### Community 56 - "page.tsx"
Cohesion: 0.13
Nodes (19): downloadICS(), FECHA_PLACEHOLDER_SSR, fmtLong(), fmtTime(), localDate(), makeGoogleCalUrl(), NIVEL_COLOR, NIVEL_LABEL (+11 more)

### Community 57 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 58 - "global-search.tsx"
Cohesion: 0.16
Nodes (14): Topbar(), GlobalSearch(), IconButton(), Tooltip(), PanelPrivacyContext, PanelPrivacyProvider(), PanelPrivacyValue, usePanelPrivacy() (+6 more)

### Community 59 - "panel-pendientes.tsx"
Cohesion: 0.12
Nodes (19): FormField(), FF(), FF(), FF(), FF(), BADGE, fecha(), FF() (+11 more)

### Community 60 - "page.frozen.tsx"
Cohesion: 0.11
Nodes (16): ContenidoLayout(), SUBNAV, categoriaBadge, categoriaBg, CATEGORIAS, nivelBadge, NIVELES, nivelLabel (+8 more)

### Community 61 - "redaccion.ts"
Cohesion: 0.16
Nodes (17): aResultadoSerializable(), construirFallback(), construirSystemPrompt(), construirUserPrompt(), ContextoValidacion, ItemARedactar, ItemRedactado, ItemRedactadoConId (+9 more)

### Community 62 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 63 - "auth-context.tsx"
Cohesion: 0.16
Nodes (14): CrearEstudioPage(), OwnerForm, StudioForm, StudioTipo, TIPOS, jakarta, metadata, LoginPage() (+6 more)

### Community 64 - "reserva-calendario.tsx"
Cohesion: 0.15
Nodes (14): BookingSheet(), capitaliza(), DOW_CORTO, fmtDiaLargo(), fmtHora(), navBtn(), NIVEL_COLOR, NIVEL_LABEL (+6 more)

### Community 65 - "billing-guard.ts"
Cohesion: 0.25
Nodes (13): POST(), FilaEntrada, POST(), bloqueoPorLimiteSocias(), billingEnforced(), cargarBilling(), Denegacion, evaluarFeature() (+5 more)

### Community 66 - "page.tsx"
Cohesion: 0.13
Nodes (14): avatarColor(), emptyForm(), FormSocia, relativeTime(), SmartFilter, Socios(), SortDir, SortKey (+6 more)

### Community 67 - "email.ts"
Cohesion: 0.20
Nodes (16): AlertaPropietariaEmail(), AlertaProps, AlumnaClaseCanceladaEmail(), AlumnaClaseCubiertaEmail(), AlumnaProps, ContactoProps, ContactoSustitutaEmail(), avisarAlumnas() (+8 more)

### Community 68 - "valoraciones.ts"
Cohesion: 0.18
Nodes (10): cuandoTexto(), ValorarPage(), Estado, ValorarForm(), procesarValoracionesEstudio, valoracionesDispatcher, firmar(), firmarTokenValoracion() (+2 more)

### Community 69 - "tipos-muertos.test.ts"
Cohesion: 0.14
Nodes (12): asistida(), conAsistencias(), diasAntes(), franjaLlena, franjaVacia, M, NOW, recibo() (+4 more)

### Community 70 - "verifactu.test.ts"
Cohesion: 0.22
Nodes (15): calcularHuellaAlta(), calcularHuellaAnulacion(), construirCadenaAlta(), construirCadenaAnulacion(), formatImporte(), DatosQrVerifactu, fechaExpedicionDesdeISO(), fechaHoraHusoMadrid() (+7 more)

### Community 71 - "route.ts"
Cohesion: 0.24
Nodes (13): GET(), guard(), PUT(), AUTONOMIA_CONFIG_DEFAULT, AutonomiaConfig, elegibleParaAutonomia(), sanitizarConfig(), seleccionarAutonomas() (+5 more)

### Community 72 - "page.tsx"
Cohesion: 0.16
Nodes (14): descargar(), ImportarHorarioPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportClases, autoMapearClase() (+6 more)

### Community 73 - "tab-estudio.tsx"
Cohesion: 0.18
Nodes (14): PerfilPage(), PoliticaForm, StudioForm, studioToForm(), studioToPolitica(), TabEstudio(), eliminarFaviconEstudio(), eliminarFotoPerfil() (+6 more)

### Community 74 - "custom-charts.tsx"
Cohesion: 0.19
Nodes (13): ChartCard(), COLORES, CustomChartsSection(), AGRUPACIONES_GRAFICO, computeSerieGrafico(), etiquetaPeriodo(), inicioPeriodo(), METRICAS_GRAFICO (+5 more)

### Community 75 - "confirmacion-riesgo.ts"
Cohesion: 0.22
Nodes (11): enVentanaDeAviso(), horasHasta(), pasoElCorte(), AHORA, horasDespues(), tocaRecordar(), firmar(), firmarTokenConfirmacion() (+3 more)

### Community 76 - "page.tsx"
Cohesion: 0.17
Nodes (13): descargar(), ImportarCitasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportCitas, CampoCita (+5 more)

### Community 77 - "seed.ts"
Cohesion: 0.23
Nodes (15): addDays(), atHour(), cid(), HASHTAGS, metricasPara(), PLATS, pub(), seedContenido() (+7 more)

### Community 78 - "profile-avatar.tsx"
Cohesion: 0.22
Nodes (12): ROL_LABEL, AvatarDef, AvatarGenero, AvatarPicker(), initialsOf(), memojiIdFor(), memojiSeedOf(), memojiUrl() (+4 more)

### Community 79 - "booking-logic.test.ts"
Cohesion: 0.23
Nodes (11): contarReferidosPremiadosMes(), contarReservasActivasFuturas(), debeDevolverBono(), decidirPremioReferido(), decidirReservaNueva(), esCancelacionTardia(), esPrimeraAsistencia(), plazasOcupadas() (+3 more)

### Community 80 - "achievement-engine.ts"
Cohesion: 0.19
Nodes (13): asistenciaMensualCompleta(), asistioEnCumpleanos(), calcularMetrica(), metricaDef(), calcularProgresoReto(), calcularRacha(), claveSemana(), lunesDe() (+5 more)

### Community 81 - "reward-engine.ts"
Cohesion: 0.23
Nodes (12): aplicarCanjeCreditos(), aplicarGananciaCreditos(), decidirOtorgarCreditos(), reglaActivaPara(), validarCanje(), yaOtorgado(), MemberCredits, RewardAction (+4 more)

### Community 82 - "route.ts"
Cohesion: 0.26
Nodes (13): FilaEntrada, normPlan(), POST(), detectarDelimitador(), emailValido(), ESTADOS_MEMBRESIA, fechaValidaISO(), normalizarEstadoMembresia() (+5 more)

### Community 83 - "route.ts"
Cohesion: 0.28
Nodes (11): diagnosticarEquipo(), emitirEscalado(), PATCH(), ESTADOS_EN_JUEGO, RankingItem, ESTADOS_RECALCULABLES, estadoTrasRecalcular(), filtrarYaRechazadas() (+3 more)

### Community 84 - "page.tsx"
Cohesion: 0.17
Nodes (12): descargar(), ImportarReservasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImportReservas, CampoReserva (+4 more)

### Community 85 - "home-editor.tsx"
Cohesion: 0.20
Nodes (9): SECCIONES_EDITABLES, esMensajeTecnico(), HUELLAS_TECNICAS, PARA_PERSONAS, TECNICOS, HOME_FIJAS_PRIMERO, HOME_SECCIONES, HomeSeccion (+1 more)

### Community 86 - "dunning-server.ts"
Cohesion: 0.26
Nodes (10): OFFSETS_REINTENTO_DIAS, planificarTrasFallo(), PlanReintento, primerReintentoISO(), notificarFalloCobro(), registrarFalloCobro(), sumarDiasISO(), enviarEmailImpago() (+2 more)

### Community 87 - "captacion.ts"
Cohesion: 0.21
Nodes (11): confianzaContactarLead(), confianzaConvertirPrueba(), captacion, diasDesde(), LEAD_STAGES_ENTRADA, reglaC1(), reglaC2(), diasAntes() (+3 more)

### Community 88 - "page.tsx"
Cohesion: 0.24
Nodes (13): Bucket, CohortRow, ExportState, fmtEur(), fmtEurFull(), getBucketKey(), getChartBuckets(), getPeriodStart() (+5 more)

### Community 89 - "tab-integraciones.tsx"
Cohesion: 0.23
Nodes (12): CampoIntegracion, CATALOGO_INTEGRACIONES, CatalogoIntegracion, descargarCsv(), TabIntegraciones(), toCsv(), GoogleCalendarIcon(), IconProps (+4 more)

### Community 90 - "help-widget.tsx"
Cohesion: 0.23
Nodes (9): CATEGORIAS, FaqItem, FAQS, HelpWidget(), DashboardDrawer(), DashboardSheet(), PublicSheet(), useDialogA11y() (+1 more)

### Community 91 - "agenda.test.ts"
Cohesion: 0.22
Nodes (9): diasAntes(), NOW, reserva(), sesion(), slot(), slotFuturo(), socio(), sociosActivos() (+1 more)

### Community 92 - "ingresos.test.ts"
Cohesion: 0.18
Nodes (7): ingresos, diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 93 - "supabase-admin.ts"
Cohesion: 0.29
Nodes (9): GET(), POST(), Admin, calcularDependenciaEstudio(), calcularDependenciaTodosLosEstudios(), nivelRiesgo(), TransicionRiesgo, AlumnaCautiva (+1 more)

### Community 94 - "escenarios-reales.test.ts"
Cohesion: 0.33
Nodes (12): asistencias(), construirSnapshot(), diasAntes(), lunes10(), NOW, plan(), recibo(), reserva() (+4 more)

### Community 95 - "retencion.test.ts"
Cohesion: 0.22
Nodes (8): retencion, asistenciasHabituales(), diasAntes(), NOW, plan(), reserva(), snapshot(), suscripcion()

### Community 96 - "page.tsx"
Cohesion: 0.18
Nodes (9): descargar(), ImportarMembresiasPage(), MAPEO_VACIO, Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, CampoMembresia, CAMPOS_MEMBRESIA (+1 more)

### Community 97 - "page.tsx"
Cohesion: 0.18
Nodes (9): descargar(), ImportarSociasPage(), Paso, PLANTILLA_EJEMPLO, PLANTILLA_HEADERS, ResultadoImport, CAMPOS_SOCIA, CampoSocia (+1 more)

### Community 98 - "page.tsx"
Cohesion: 0.18
Nodes (9): CAT_COLOR, CAT_LABEL, fmt(), PlanFormData, PosFormData, Productos(), Tab, TIPO_COLOR (+1 more)

### Community 99 - "ReservaCalendario"
Cohesion: 0.48
Nodes (9): ReservaCalendario(), addDays(), agruparPorDia(), contarSlotsPorDia(), diasSemana(), etiquetaDia(), inicioSemanaLunes(), localDayKey() (+1 more)

### Community 100 - "email.ts"
Cohesion: 0.30
Nodes (10): enviar(), enviarEmailPedirConfirmacion(), enviarEmailPlazaLiberada(), enviarEmailRecordatorioConfirmacion(), EnvioResultado, Marca, PedirConfirmacionEmail(), PlazaLiberadaEmail() (+2 more)

### Community 101 - "memoria.test.ts"
Cohesion: 0.21
Nodes (7): diasAntes(), diasDespues(), hecho(), log(), NOW, rec(), HechoMemoria

### Community 102 - "motor.test.ts"
Cohesion: 0.24
Nodes (7): asistencias(), diasAntes(), NOW, recibo(), reserva(), sesion(), slot()

### Community 103 - "page.tsx"
Cohesion: 0.20
Nodes (10): accionConfig, AutomatizacionesPage(), ETIQUETA_APROBAR, horasRestantes(), LogItem(), MorningBriefing(), REGLAS_SUGERIDAS, resultadoConfig (+2 more)

### Community 104 - "ai-client.ts"
Cohesion: 0.33
Nodes (9): generarCarrusel(), generarGuion(), ResultadoIA, generarCarruselLocal(), generarGuionLocal(), GuionGenerado, SlideGenerada, slug() (+1 more)

### Community 105 - "serializeCsv"
Cohesion: 0.27
Nodes (9): serializeCsv(), enviarCierreAGestoria(), CierreGestoriaEmail(), CierreGestoriaEmailProps, eur(), td, tdR, th (+1 more)

### Community 106 - "seed-dependency-risk.mjs"
Cohesion: 0.25
Nodes (10): CAUTIVAS, clean(), cleanOnly, dateOnly(), daysAgo(), db, FLOTANTES, insertAll() (+2 more)

### Community 107 - "page.frozen.tsx"
Cohesion: 0.31
Nodes (9): Avatar(), AVATAR_COLORS, Comment, CommentThread(), ComunidadPage(), getInitials(), NewPostModal(), PostCard() (+1 more)

### Community 108 - "page.frozen.tsx"
Cohesion: 0.36
Nodes (9): avatarColor(), DIAS, initials(), isDark(), KioskPage(), localDate(), MESES, pad2() (+1 more)

### Community 109 - "citas-publica.tsx"
Cohesion: 0.31
Nodes (9): addDays(), CitasPublica(), DOW_CORTO, fmtDiaLargo(), fmtHora(), Hueco, localDate(), MiCita (+1 more)

### Community 110 - "calendar-logic.test.ts"
Cohesion: 0.39
Nodes (6): detectarConflictos(), hayConflicto(), plazasSobrantesTrasAforo(), SlotSesion, solapan(), cand

### Community 111 - "page.tsx"
Cohesion: 0.32
Nodes (4): ConfirmarReservaForm(), Estado, ConfirmarReservaPage(), cuandoTexto()

### Community 112 - "onboarding-checklist.tsx"
Cohesion: 0.39
Nodes (5): OnboardingChecklist(), calcularPasosOnboarding(), DatosOnboarding, PasoOnboarding, VACIO

### Community 113 - "bono-logic.test.ts"
Cohesion: 0.39
Nodes (4): bonoConsumible(), calcularConsumoBono(), calcularDevolucionBono(), tieneEntitlementActivo()

### Community 114 - "route.ts"
Cohesion: 0.43
Nodes (5): FacturaEntrante, POST(), mapSalida(), ResultadoSellado, sellarFacturaDeRecibo()

### Community 115 - "route.ts"
Cohesion: 0.48
Nodes (5): POST(), abrirPuertaKisi(), headers(), KisiCredenciales, probarKisi()

### Community 116 - "route.ts"
Cohesion: 0.43
Nodes (5): POST(), dbGetIntegracionConfig(), enviarWhatsAppTexto(), probarWhatsApp(), WhatsAppCredenciales

### Community 117 - "Tentare Brand Icon Mark (logo-mark.png)"
Cohesion: 0.29
Nodes (7): Tentare Brand Icon Mark (Favicon 256x256), Tentare Brand Icon (48x48 Favicon), Tentare Brand Icon (32x32 Favicon), Tentare Brand Icon (16x16 Favicon), Tentare PWA Icon 192x192, Tentare PWA Icon 512x512, Tentare Brand Icon Mark (logo-mark.png)

### Community 118 - "baja-form.tsx"
Cohesion: 0.33
Nodes (4): BajaForm(), Clase, cuando(), Datos

### Community 119 - "factura-pdf.ts"
Cohesion: 0.38
Nodes (6): MiPlanPage(), abrirFacturaPDF(), EmisorFactura, fecha(), generarFacturaHTML(), ReceptorFactura

### Community 120 - "tab-horario-citas.tsx"
Cohesion: 0.48
Nodes (6): Draft, draftFromDisponibilidad(), Franja, mergeFranjas(), TabHorarioCitas(), totalHoras()

### Community 121 - "portal-notifications.ts"
Cohesion: 0.38
Nodes (5): markPortalNotifsRead(), PortalNotifItem, PortalNotifTipo, READ_KEY(), usePortalNotifUnreadCount()

### Community 122 - "use-discount-codes-store.ts"
Cohesion: 0.29
Nodes (6): codigoDescuentoToDb(), dbConsumirCodigoDescuento(), dbDeleteCodigoDescuento(), dbInsertCodigoDescuento(), dbUpdateCodigoDescuento(), CodigoDescuento

### Community 123 - "page.tsx"
Cohesion: 0.40
Nodes (4): Mensajeria(), Tab, timeAgo(), TIPO_ICON

### Community 124 - "catalogo-estudio.ts"
Cohesion: 0.47
Nodes (4): cache, conCacheCatalogo(), Entrada, invalidarCacheCatalogo()

### Community 125 - "context7"
Cohesion: 0.40
Nodes (5): npx, context7, playwright, @playwright/mcp, @upstash/context7-mcp

### Community 126 - "CI Pipeline"
Cohesion: 0.40
Nodes (5): CI Pipeline, E2E Playwright Step (registro, reserva, pago), Dummy Supabase Env Vars for CI, Typecheck Step (tsc --noEmit), Unit Tests Step (dinero, reservas, aforo, fiscal)

### Community 129 - "generarRecordatoriosRevision"
Cohesion: 0.67
Nodes (3): GET(), generarRecordatoriosRevision(), mapCondicionSalud()

### Community 132 - "Next.js Breaking Changes Notice (AGENTS.md)"
Cohesion: 0.67
Nodes (3): Next.js Breaking Changes Notice (AGENTS.md), CLAUDE.md (project instructions entrypoint), README - Next.js project bootstrap

## Knowledge Gaps
- **668 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+663 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `types.ts`, `page.tsx`, `page.tsx`, `permisos.ts`, `utils.ts`, `enviarMensajeTwilio`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `use-team-chat-store.ts`, `ficha-clinica.ts`, `page.frozen.tsx`, `page.tsx`, `ficha-salud.tsx`, `global-search.tsx`, `panel-pendientes.tsx`, `page.frozen.tsx`, `page.tsx`, `tab-estudio.tsx`, `custom-charts.tsx`, `profile-avatar.tsx`, `tab-integraciones.tsx`, `help-widget.tsx`, `page.tsx`, `page.frozen.tsx`, `tab-horario-citas.tsx`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `getSupabaseAdmin()` connect `getSupabaseAdmin` to `supabase-data.ts`, `studio-context.tsx`, `generarRecordatoriosRevision`, `theme-editor.tsx`, `fetchExterno`, `fetchCriticalStudioData`, `route.ts`, `auth-server.ts`, `uid`, `errorInterno`, `page.tsx`, `entitlements.ts`, `backup-engine.ts`, `route.ts`, `route.ts`, `route.ts`, `route.ts`, `billing-guard.ts`, `valoraciones.ts`, `route.ts`, `route.ts`, `supabase-admin.ts`, `page.tsx`, `route.ts`, `route.ts`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `useStudio()` connect `useStudio` to `studio-context.tsx`, `theme-editor.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `permisos.ts`, `useModo`, `utils.ts`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `cierre-engine.ts`, `page.tsx`, `page.tsx`, `use-team-chat-store.ts`, `page.frozen.tsx`, `page.tsx`, `ficha-salud.tsx`, `page.tsx`, `global-search.tsx`, `panel-pendientes.tsx`, `page.frozen.tsx`, `auth-context.tsx`, `page.tsx`, `tab-estudio.tsx`, `custom-charts.tsx`, `profile-avatar.tsx`, `page.tsx`, `tab-integraciones.tsx`, `help-widget.tsx`, `page.tsx`, `page.tsx`, `page.frozen.tsx`, `page.frozen.tsx`, `onboarding-checklist.tsx`, `factura-pdf.ts`, `tab-horario-citas.tsx`, `page.tsx`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _669 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `supabase-data.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.02745995423340961 - nodes in this community are weakly interconnected._
- **Should `studio-context.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.03490990990990991 - nodes in this community are weakly interconnected._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.03471491689459289 - nodes in this community are weakly interconnected._