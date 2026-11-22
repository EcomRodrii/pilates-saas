import UIKit
import LocalAuthentication
import Capacitor

/// Bloqueo opcional de la app con Face ID, Touch ID o el código del iPhone.
///
/// Es del DISPOSITIVO, no de la cuenta: se guarda en `UserDefaults` y lo aplica
/// el propio iPhone, así que no depende de la web ni de la red. La web solo
/// enciende y apaga el interruptor (Perfil → Preferencias) y lo apaga al
/// cerrar sesión.
///
/// - Activarlo exige pasar la autenticación una vez (si no, te puedes dejar
///   encerrada fuera de tu propia app).
/// - Se usa `.deviceOwnerAuthentication`: si Face ID falla o no está
///   configurado, iOS ofrece el código del iPhone. Nunca queda sin salida.
/// - Con el bloqueo encendido, la pantalla se tapa en cuanto la app deja de
///   estar activa (así tampoco se ve en el selector de apps) y se pide
///   desbloquear al volver pasados `gracia` segundos y al abrirla en frío.
@objc(BloqueoPlugin)
public class BloqueoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BloqueoPlugin"
    public let jsName = "Bloqueo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "estado", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activar", returnType: CAPPluginReturnPromise)
    ]

    static let clave = "tentare.bloqueo.activo"
    /// Segundos fuera de la app que se perdonan (contestar un mensaje y volver).
    static let gracia: TimeInterval = 30

    static var activo: Bool { UserDefaults.standard.bool(forKey: clave) }

    private var cubierta: UIView?
    private var salioEn: Date?
    private var pidiendo = false

    public override func load() {
        let c = NotificationCenter.default
        c.addObserver(self, selector: #selector(dejaDeEstarActiva), name: UIApplication.willResignActiveNotification, object: nil)
        c.addObserver(self, selector: #selector(salioAFondo), name: UIApplication.didEnterBackgroundNotification, object: nil)
        c.addObserver(self, selector: #selector(vuelveAEstarActiva), name: UIApplication.didBecomeActiveNotification, object: nil)
        // Apertura en frío: tapada desde el primer fotograma.
        if Self.activo {
            salioEn = .distantPast
            DispatchQueue.main.async { [weak self] in self?.taparYPedir() }
        }
    }

    // MARK: - Lo que llama la web

    private func tipoBiometria(_ ctx: LAContext) -> String {
        switch ctx.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "código"
        }
    }

    /// `{ disponible, tipo, activo }`.
    @objc func estado(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var error: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        call.resolve(["disponible": ok, "tipo": tipoBiometria(ctx), "activo": Self.activo && ok])
    }

    /// `{ activo: boolean }`. Encender pide autenticarse; apagar, también (otra
    /// persona con el móvil desbloqueado no debe poder quitarlo).
    @objc func activar(_ call: CAPPluginCall) {
        let quiere = call.getBool("activo") ?? false
        let ctx = LAContext()
        var error: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.reject("Este iPhone no tiene código ni Face ID", "NO_DISPONIBLE")
            return
        }
        // Al cerrar sesión la web lo apaga sin pedir nada: ya no hay cuenta que proteger.
        if !quiere && call.getBool("sinPedir") == true {
            UserDefaults.standard.set(false, forKey: Self.clave)
            call.resolve(["activo": false])
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication,
                           localizedReason: quiere ? "Activar el bloqueo de la app" : "Quitar el bloqueo de la app") { ok, _ in
            DispatchQueue.main.async {
                if ok { UserDefaults.standard.set(quiere, forKey: Self.clave) }
                call.resolve(["activo": Self.activo])
            }
        }
    }

    // MARK: - Ciclo de vida

    @objc private func dejaDeEstarActiva() {
        guard Self.activo, !pidiendo else { return }
        mostrarCubierta()
    }

    @objc private func salioAFondo() {
        guard Self.activo else { return }
        salioEn = Date()
    }

    @objc private func vuelveAEstarActiva() {
        guard Self.activo else { quitarCubierta(); return }
        if pidiendo { return }
        let fuera = salioEn.map { Date().timeIntervalSince($0) } ?? 0
        if fuera >= Self.gracia { taparYPedir() } else { quitarCubierta() }
    }

    // MARK: - Pantalla de bloqueo

    private func mostrarCubierta() {
        guard cubierta == nil, let vista = bridge?.viewController?.view else { return }
        let c = UIView(frame: vista.bounds)
        c.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        c.backgroundColor = .systemBackground
        let icono = UIImageView(image: UIImage(systemName: "lock.fill"))
        icono.tintColor = .secondaryLabel
        icono.translatesAutoresizingMaskIntoConstraints = false
        c.addSubview(icono)
        NSLayoutConstraint.activate([
            icono.centerXAnchor.constraint(equalTo: c.centerXAnchor),
            icono.centerYAnchor.constraint(equalTo: c.centerYAnchor),
            icono.widthAnchor.constraint(equalToConstant: 34),
            icono.heightAnchor.constraint(equalToConstant: 40)
        ])
        vista.addSubview(c)
        cubierta = c
    }

    private func quitarCubierta() {
        cubierta?.removeFromSuperview()
        cubierta = nil
    }

    private func taparYPedir() {
        mostrarCubierta()
        guard !pidiendo else { return }
        pidiendo = true
        let ctx = LAContext()
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Desbloquear la app") { [weak self] ok, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.pidiendo = false
                if ok {
                    self.salioEn = nil
                    self.quitarCubierta()
                } else {
                    self.mostrarBotonReintentar()
                }
            }
        }
    }

    /// Si cancela el desbloqueo, la pantalla sigue tapada y con un botón para reintentar.
    private func mostrarBotonReintentar() {
        guard let c = cubierta, c.viewWithTag(77) == nil else { return }
        var cfg = UIButton.Configuration.filled()
        cfg.title = "Desbloquear"
        let b = UIButton(configuration: cfg, primaryAction: UIAction { [weak self] _ in
            self?.cubierta?.viewWithTag(77)?.removeFromSuperview()
            self?.taparYPedir()
        })
        b.tag = 77
        b.translatesAutoresizingMaskIntoConstraints = false
        c.addSubview(b)
        NSLayoutConstraint.activate([
            b.centerXAnchor.constraint(equalTo: c.centerXAnchor),
            b.topAnchor.constraint(equalTo: c.centerYAnchor, constant: 48)
        ])
    }
}
