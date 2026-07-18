import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { useAuth } from './auth/AuthProvider'
import { CenterSpinner, ToastProvider } from './components/ui'
import { TopBar, PageContainer } from './components/layout/Shell'
import { LoginPage } from './pages/LoginPage'

// Todo lo que solo existe DESPUÉS del login se carga bajo demanda: arrastra el registro de
// los 6 módulos (25+ pantallas) y, en el caso de GuardiaView, face-api.js. Nada de esto debe
// bloquear la carga inicial del login, que es lo primero que ve cualquier visitante.
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const ModuleHome = lazy(() => import('./pages/ModuleHome').then((m) => ({ default: m.ModuleHome })))
const ScreenPage = lazy(() => import('./pages/ScreenPage').then((m) => ({ default: m.ScreenPage })))
const CuentaPage = lazy(() => import('./pages/CuentaPage').then((m) => ({ default: m.CuentaPage })))
const GuardiaView = lazy(() => import('./pages/GuardiaView').then((m) => ({ default: m.GuardiaView })))
const VehiculoPropietarioPage = lazy(() =>
  import('./pages/VehiculoPropietarioPage').then((m) => ({ default: m.VehiculoPropietarioPage })),
)
const OlvidoPasswordPage = lazy(() => import('./pages/PasswordPages').then((m) => ({ default: m.OlvidoPasswordPage })))
const RestablecerPasswordPage = lazy(() =>
  import('./pages/PasswordPages').then((m) => ({ default: m.RestablecerPasswordPage })),
)
const CambioObligatorioPage = lazy(() =>
  import('./pages/PasswordPages').then((m) => ({ default: m.CambioObligatorioPage })),
)

function CargandoModulo() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <CenterSpinner label="Cargando..." />
    </div>
  )
}

export default function App() {
  const { session, cargando, esGuardia, perfil, recuperacion } = useAuth()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-bg">
        <CenterSpinner label="Cargando sesión..." />
      </div>
    )
  }

  // El enlace de recuperación crea una sesión, pero el usuario solo debe ver la
  // pantalla de restablecimiento (req 31), por encima de todo lo demás.
  if (recuperacion) {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <RestablecerPasswordPage />
      </Suspense>
    )
  }

  // Pre-login: login + recuperación de contraseña.
  if (!session) {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <Routes>
          <Route path="/olvido" element={<OlvidoPasswordPage />} />
          <Route path="/restablecer" element={<RestablecerPasswordPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    )
  }

  // Guard duro (reqs 27/28): mientras requiere_cambio_password sea true, el
  // usuario NO accede al resto del sistema; solo a la pantalla de cambio inicial.
  if (perfil?.requiere_cambio_password) {
    return (
      <Suspense fallback={<CargandoModulo />}>
        <CambioObligatorioPage />
      </Suspense>
    )
  }

  return (
    <ToastProvider>
      <Suspense fallback={<CargandoModulo />}>
        {esGuardia ? (
          // Vista operativa del guardia: reemplaza el grid de módulos (07 §5).
          <GuardiaView />
        ) : (
          <div className="min-h-screen">
            <TopBar />
            <PageContainer>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/cuenta" element={<CuentaPage />} />
                <Route path="/vehiculos/nuevo" element={<VehiculoPropietarioPage />} />
                <Route path="/m/:codigo" element={<ModuleHome />} />
                <Route path="/m/:codigo/:sub" element={<ScreenPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PageContainer>
          </div>
        )}
      </Suspense>
    </ToastProvider>
  )
}
