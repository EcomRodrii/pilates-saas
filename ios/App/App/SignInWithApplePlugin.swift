import Foundation
import AuthenticationServices
import Capacitor

/// «Iniciar sesión con Apple» con la hoja nativa de iOS.
///
/// Lo llama `loginConApple()` (lib/nativo/puente.ts). Vive aquí, dentro de la
/// app, y no como dependencia porque `@capacitor-community/apple-sign-in`
/// (7.1.0, la última publicada) declara en su Package.swift
/// `capacitor-swift-pm from: "7.0.0"`, que en SPM quiere decir «< 8.0.0», y
/// la app va en Capacitor 8: Xcode no resolvería los paquetes. Su soporte de
/// Capacitor 8 está en PRs sin publicar.
///
/// Por eso imita su contrato al milímetro —mismo nombre JS (`SignInWithApple`),
/// mismo método (`authorize`) y misma forma de respuesta (`{ response: {…} }`)—:
/// cuando el plugin comunitario publique la versión para Capacitor 8, basta con
/// instalarlo y borrar este fichero y su registro en
/// `TentareBridgeViewController`, sin tocar la web.
///
/// ⚠️ El `nonce` que llega es ya el SHA-256 del nonce en crudo: se le pasa a
/// Apple tal cual y Apple lo firma dentro del token. El crudo se queda en la
/// web y es el que va a Supabase (lib/nativo/nonce.ts).
@objc(SignInWithApplePlugin)
public class SignInWithApplePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SignInWithApplePlugin"
    public let jsName = "SignInWithApple"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var llamadaEnCurso: CAPPluginCall?

    @objc func authorize(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.reject("Falta el nonce", "SIN_NONCE")
            return
        }

        DispatchQueue.main.async {
            if self.llamadaEnCurso != nil {
                call.reject("Ya hay un inicio de sesión con Apple abierto", "EN_CURSO")
                return
            }

            let peticion = ASAuthorizationAppleIDProvider().createRequest()
            peticion.requestedScopes = self.alcances(call.getString("scopes"))
            peticion.nonce = nonce
            if let estado = call.getString("state") {
                peticion.state = estado
            }

            self.llamadaEnCurso = call
            let controlador = ASAuthorizationController(authorizationRequests: [peticion])
            controlador.delegate = self
            controlador.presentationContextProvider = self
            controlador.performRequests()
        }
    }

    /// Sin `scopes`, nombre y correo: Apple solo los da la PRIMERA vez.
    private func alcances(_ texto: String?) -> [ASAuthorization.Scope] {
        guard let texto = texto, !texto.isEmpty else { return [.fullName, .email] }
        var alcances: [ASAuthorization.Scope] = []
        if texto.contains("name") { alcances.append(.fullName) }
        if texto.contains("email") { alcances.append(.email) }
        return alcances
    }

    private func terminar(_ cierre: (CAPPluginCall) -> Void) {
        guard let call = llamadaEnCurso else { return }
        llamadaEnCurso = nil
        cierre(call)
    }
}

extension SignInWithApplePlugin: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithAuthorization authorization: ASAuthorization) {
        terminar { call in
            guard let credencial = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let datosToken = credencial.identityToken,
                  let token = String(data: datosToken, encoding: .utf8) else {
                call.reject("Apple no ha devuelto el token", "SIN_TOKEN")
                return
            }

            var respuesta: JSObject = [
                "user": credencial.user,
                "identityToken": token
            ]
            if let codigo = credencial.authorizationCode, let texto = String(data: codigo, encoding: .utf8) {
                respuesta["authorizationCode"] = texto
            }
            if let email = credencial.email { respuesta["email"] = email }
            if let nombre = credencial.fullName?.givenName { respuesta["givenName"] = nombre }
            if let apellidos = credencial.fullName?.familyName { respuesta["familyName"] = apellidos }

            call.resolve(["response": respuesta])
        }
    }

    public func authorizationController(controller: ASAuthorizationController,
                                        didCompleteWithError error: Error) {
        terminar { call in
            if let errorApple = error as? ASAuthorizationError, errorApple.code == .canceled {
                call.reject("Cancelado", "CANCELADO", error)
            } else {
                call.reject(error.localizedDescription, "ERROR_APPLE", error)
            }
        }
    }
}

extension SignInWithApplePlugin: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
