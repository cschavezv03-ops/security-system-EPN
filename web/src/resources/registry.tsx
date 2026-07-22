import type { ReactNode } from 'react'
import {
  Building2, Car, Cctv, ClipboardList, Contact, Cpu, FileText, Fingerprint, KeyRound,
  LayoutGrid, ListChecks, Lock, MapPin, Monitor, ScrollText, Settings, Shield, ShieldAlert,
  Users, UserCheck, UserCog, UserPlus, Link2, ClipboardCheck, History,
} from 'lucide-react'
import { ResourceScreen } from '../components/ResourceScreen'
import type { ResourceConfig } from './types'
import { BiometriaScreen } from '../pages/modules/BiometriaScreen'
import { AlertasScreen } from '../pages/modules/AlertasScreen'
import { MonitoreoView } from '../pages/modules/MonitoreoView'
import {
  cfgEmpresa, cfgCategoria, cfgParametro, cfgRol, cfgPermiso,
  cfgVehiculo, cfgZona, cfgPuntoControl, cfgDispositivo, cfgAsignacionGuardia,
  cfgPersonaExterna, cfgMemorando, cfgPersonaMemorando, cfgReglaAcceso, cfgAutorizacion,
} from './configs'
import { cfgBitacora, cfgSesion, cfgEventoAcceso, cfgBiometriaADM, cfgErrorReconocimiento } from './configs-lectura'
import { cfgPersonaInterna, cfgPersonaInternaDetalle } from './configs-gpi'
import { PersonasADMScreen } from '../pages/modules/PersonasADMScreen'
import { UsuariosScreen } from '../pages/modules/UsuariosScreen'
import { RolPermisoScreen } from '../pages/modules/RolPermisoScreen'

export interface SubmoduloDef {
  key: string
  titulo: string
  descripcion: string
  icono: ReactNode
  /** Permisos (any-of) requeridos para ver la tarjeta; si no los tiene, se oculta. */
  permisoVer?: string[]
  render: () => ReactNode
}

export interface ModuloDef {
  codigo: 'ADM' | 'GPI' | 'GPE' | 'PCO' | 'CAC' | 'MON'
  titulo: string
  descripcion: string
  icono: ReactNode
  submodulos: SubmoduloDef[]
}

const rs = (config: ResourceConfig) => () => <ResourceScreen config={config} />
const sub = (key: string, titulo: string, descripcion: string, icono: ReactNode, config: ResourceConfig): SubmoduloDef => ({
  key, titulo, descripcion, icono, permisoVer: config.permisos.select, render: rs(config),
})

export const MODULOS: ModuloDef[] = [
  {
    codigo: 'GPI',
    titulo: 'Personal Interno',
    descripcion: 'Docentes, estudiantes, empleados, biometría y vehículos internos.',
    icono: <UserCog className="h-7 w-7" />,
    submodulos: [
      sub('personas', 'Personal interno', 'Registro y consulta de personas internas.', <Users className="h-6 w-6" />, cfgPersonaInterna),
      sub('detalle', 'Datos internos', 'Cargo, unidad, carrera y categoría.', <Contact className="h-6 w-6" />, cfgPersonaInternaDetalle),
      // GPE §7 / GPI: las descripciones nombraban el algoritmo ("Enrolamiento facial 1:N") en
      // vez de la tarea. A quien registra una cara no le sirve saber que la búsqueda es 1:N.
      { key: 'biometria', titulo: 'Biometría', descripcion: 'Registrar el rostro del personal interno.', icono: <Fingerprint className="h-6 w-6" />, permisoVer: ['GPI_BIOMETRIA_SELECT'], render: () => <BiometriaScreen /> },
      // La tarjeta "Asociaciones" desaparece: las personas de cada vehículo se gestionan desde
      // su ficha, como en ADM.
      sub('vehiculos', 'Vehículos', 'Vehículos del personal interno y quién los conduce.', <Car className="h-6 w-6" />, cfgVehiculo('GPI')),
    ],
  },
  {
    codigo: 'GPE',
    titulo: 'Personal Externo',
    descripcion: 'Visitantes, proveedores, memorandos y autorizaciones.',
    icono: <UserCheck className="h-7 w-7" />,
    // Orden pedido (feedback GPE): Memorando, Persona Externa, Ingresos, Vehículos — los
    // botones de vinculación (persona-memorando, asociaciones) van después.
    submodulos: [
      sub('memorandos', 'Memorandos', 'Memorandos de acceso por empresa.', <FileText className="h-6 w-6" />, cfgMemorando),
      sub('personas', 'Personal externo', 'Registro y consulta de personas externas.', <UserPlus className="h-6 w-6" />, cfgPersonaExterna),
      sub('autorizaciones', 'Ingresos (visitas sin memorando)', 'Autorizar una visita de un solo día.', <ClipboardCheck className="h-6 w-6" />, cfgAutorizacion),
      sub('vehiculos', 'Vehículos', 'Vehículos del personal externo y quién los conduce.', <Car className="h-6 w-6" />, cfgVehiculo('GPE')),
      sub('persona-memorando', 'Personas por memorando', 'Quién puede entrar con cada memorando.', <ClipboardList className="h-6 w-6" />, cfgPersonaMemorando),
      sub('empresas', 'Empresas', 'Registrar la empresa del personal externo.', <Building2 className="h-6 w-6" />, cfgEmpresa),
    ],
  },
  {
    codigo: 'PCO',
    titulo: 'Puntos de Control',
    descripcion: 'Zonas, puntos de control, dispositivos y asignación de guardias.',
    icono: <MapPin className="h-7 w-7" />,
    submodulos: [
      sub('zonas', 'Zonas', 'Campus, edificios y parqueaderos.', <LayoutGrid className="h-6 w-6" />, cfgZona),
      sub('puntos', 'Puntos de control', 'Garitas y accesos.', <Shield className="h-6 w-6" />, cfgPuntoControl),
      sub('dispositivos', 'Dispositivos', 'Cámaras, torniquetes y lectores.', <Cpu className="h-6 w-6" />, cfgDispositivo),
      sub('asignaciones', 'Asignaciones de guardia', 'Qué guardia cubre cada garita y en qué turno.', <UserCog className="h-6 w-6" />, cfgAsignacionGuardia),
    ],
  },
  {
    codigo: 'CAC',
    titulo: 'Control de Accesos',
    descripcion: 'Reglas de acceso, eventos y alertas de seguridad.',
    icono: <Lock className="h-7 w-7" />,
    submodulos: [
      sub('reglas', 'Reglas de acceso', 'Quién puede entrar, por dónde y en qué horario.', <ListChecks className="h-6 w-6" />, cfgReglaAcceso),
      sub('eventos', 'Historial de accesos', 'Ingresos, salidas y rechazos, con su motivo.', <History className="h-6 w-6" />, cfgEventoAcceso()),
      { key: 'alertas', titulo: 'Alertas de seguridad', descripcion: 'Atención de alertas automáticas.', icono: <ShieldAlert className="h-6 w-6" />, permisoVer: ['CAC_ALERTA_SELECT'], render: () => <AlertasScreen /> },
      // RF-CA-022: los fallos de cámara y de lectura de placas dejaban de existir al recargar
      // la página, así que nadie podía saber que una garita llevaba días sin cámara.
      sub('errores', 'Errores de reconocimiento', 'Fallos de cámara, rostro y lectura de placas.', <Cctv className="h-6 w-6" />, cfgErrorReconocimiento()),
      // "Asignaciones de guardia" queda exclusivamente en PCO (feedback CAC: "Quitar asignación
      // de guardia"). El permiso INSERT/UPDATE de CAC sobre guardia_punto_control ya fue revocado.
    ],
  },
  {
    codigo: 'ADM',
    titulo: 'Administración',
    descripcion: 'Usuarios, roles, permisos, catálogos maestros y auditoría.',
    icono: <Settings className="h-7 w-7" />,
    submodulos: [
      // Pantalla dedicada (feedback ADM §5.3/§7.2): bloquear/desbloquear/activar/dar de baja/
      // resetear contraseña, cada uno con su propio permiso granular — no encaja en el patrón
      // CRUD genérico de ResourceScreen.
      // Feedback ADM: "los usuarios y asignaciones de rol deben estar unidos en un mismo
      // panel... dejar este apartado únicamente con el nombre de Usuario". La tarjeta
      // "Asignaciones de rol" desaparece: rol, cédula, fecha de asignación y fecha de
      // estado se ven y se gestionan dentro de esta pantalla.
      { key: 'usuarios', titulo: 'Usuarios', descripcion: 'Cuentas del sistema y sus roles.', icono: <Users className="h-6 w-6" />, permisoVer: ['ADM_USUARIO_SELECT'], render: () => <UsuariosScreen /> },
      sub('roles', 'Roles', 'Roles del sistema.', <KeyRound className="h-6 w-6" />, cfgRol),
      sub('permisos', 'Permisos', 'Catálogo de permisos.', <Lock className="h-6 w-6" />, cfgPermiso),
      { key: 'rol-permiso', titulo: 'Matriz rol × permiso', descripcion: 'Qué permiso tiene cada rol.', icono: <ListChecks className="h-6 w-6" />, permisoVer: ['ADM_ROL_PERMISO_SELECT'], render: () => <RolPermisoScreen /> },
      sub('categorias', 'Categorías', 'Categorías de persona.', <ListChecks className="h-6 w-6" />, cfgCategoria),
      sub('empresas', 'Empresas', 'Empresas de servicio y proveedores.', <Building2 className="h-6 w-6" />, cfgEmpresa),
      sub('parametros', 'Parámetros', 'Parámetros del sistema.', <Settings className="h-6 w-6" />, cfgParametro),
      // Feedback ADM: una sola tabla mezclaba internos y externos. La pantalla monta dos
      // listados separados, uno por ámbito.
      { key: 'personas', titulo: 'Personal interno y externo', descripcion: 'Todas las personas, separadas por ámbito.', icono: <Contact className="h-6 w-6" />, permisoVer: ['ADM_PERSONA_SELECT'], render: () => <PersonasADMScreen /> },
      sub('biometria', 'Biometría', 'Quién tiene el rostro registrado y desde cuándo.', <Fingerprint className="h-6 w-6" />, cfgBiometriaADM),
      // Feedback ADM: "unificar o enlazar claramente las asociaciones persona-vehículo
      // desde la misma vista". Las asociaciones se gestionan dentro del detalle del
      // vehículo, así que ADM ya no necesita una tarjeta aparte (GPI y GPE mantienen la
      // suya: ahí el alta de vínculos es parte de su flujo diario).
      sub('vehiculos', 'Vehículos', 'Vehículos registrados y quién los conduce.', <Car className="h-6 w-6" />, cfgVehiculo('ADM')),
      sub('bitacora', 'Auditoría', 'Quién hizo qué, sobre quién y cuándo.', <ScrollText className="h-6 w-6" />, cfgBitacora),
      sub('sesiones', 'Sesiones', 'Registro de sesiones.', <History className="h-6 w-6" />, cfgSesion),
    ],
  },
  {
    codigo: 'MON',
    titulo: 'Monitoreo',
    descripcion: 'Panel operativo: vehículos dentro, vigencias, eventos y alertas.',
    icono: <Monitor className="h-7 w-7" />,
    submodulos: [
      { key: 'panel', titulo: 'Panel de monitoreo', descripcion: 'Vista consolidada en tiempo casi real.', icono: <Cctv className="h-6 w-6" />, permisoVer: ['CAC_EVENTO_SELECT', 'ADM_PERSONA_SELECT'], render: () => <MonitoreoView /> },
    ],
  },
]

export function moduloPorCodigo(codigo: string): ModuloDef | undefined {
  return MODULOS.find((m) => m.codigo === codigo)
}
