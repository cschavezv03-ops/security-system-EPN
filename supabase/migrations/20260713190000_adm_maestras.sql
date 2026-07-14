-- Modulo ADM: entidades maestras y seguridad logica.
-- Fuente: docs/Modelo_Datos_Consolidado_EPN.pdf §3.1, con correcciones de
-- docs/03_DECISIONES_Y_CORRECCIONES.md (D1, D14, D18).

create table public.categoria_persona (
  id_categoria uuid primary key default gen_random_uuid(),
  codigo_categoria text not null unique check (codigo_categoria in (
    'DOCENTE', 'ESTUDIANTE', 'ADMINISTRATIVO', 'TRABAJADOR', 'EMPRESA_SERVICIO',
    'VISITANTE', 'PROVEEDOR', 'CONTRATISTA', 'CONDUCTOR'
  )),
  nombre_categoria varchar(80) not null,
  ambito text not null check (ambito in ('INTERNA', 'EXTERNA')),
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'INACTIVO'))
);

create table public.empresa (
  id_empresa uuid primary key default gen_random_uuid(),
  nombre varchar(150) not null,
  ruc varchar(13) unique,
  tipo_servicio text,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'INACTIVO')),
  fecha_registro timestamptz not null default now()
);

-- persona: identidad unica de toda persona relacionada con el sistema.
create table public.persona (
  id_persona uuid primary key default gen_random_uuid(),
  tipo_persona text not null check (tipo_persona in ('INTERNA', 'EXTERNA')),
  id_categoria uuid not null references public.categoria_persona (id_categoria),
  id_empresa uuid references public.empresa (id_empresa),
  codigo_unico text,
  cedula varchar(10) not null,
  nombres varchar(100) not null,
  apellidos varchar(100) not null,
  correo varchar(100) not null,
  sexo varchar(20),
  fecha_nacimiento date,
  telefono_contacto varchar(15),
  telefono_respaldo varchar(15),
  direccion_domicilio text,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO', 'INACTIVO', 'DADO_DE_BAJA')),
  detalle_estado text,
  fecha_registro timestamptz not null default now(),
  fecha_modificacion timestamptz
);

-- §D20: cedula es el campo de busqueda del guardia para la via externa.
create index idx_persona_cedula on public.persona (cedula);

-- usuario_sistema: tabla de perfil sobre auth.users (§D1). Sin password_hash:
-- Supabase Auth gestiona la contraseña. id_usuario hereda el id de auth.users.
create table public.usuario_sistema (
  id_usuario uuid primary key references auth.users (id) on delete restrict,
  nombre_usuario varchar(50) not null unique,
  correo_electronico varchar(120) not null unique,
  estado_usuario text not null default 'ACTIVO' check (
    estado_usuario in ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'DADO_DE_BAJA')
  ),
  intentos_fallidos integer not null default 0,
  requiere_cambio_password boolean not null default false,
  fecha_ultimo_login timestamptz,
  id_persona uuid not null references public.persona (id_persona),
  fecha_creacion timestamptz not null default now(),
  fecha_modificacion timestamptz
);

-- sesion: tabla de auditoria de sesiones. token_hash NULLABLE (§D14) porque
-- Supabase gestiona el JWT real; nuestro backend nunca lo tiene para hashearlo.
create table public.sesion (
  id_sesion uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references public.usuario_sistema (id_usuario),
  token_hash text,
  recordar_sesion boolean not null default false,
  fecha_inicio timestamptz not null default now(),
  fecha_expiracion timestamptz not null,
  fecha_cierre timestamptz,
  estado_sesion text not null default 'ACTIVA' check (estado_sesion in ('ACTIVA', 'EXPIRADA', 'CERRADA')),
  ip_origen varchar(45)
);

-- rol: los 7 roles humanos definitivos (docs/01_AUTENTICACION_Y_ROLES.md §3).
-- Los codigos de modulo (ADM/GPI/GPE/PCO/CAC) nunca son filas de esta tabla.
create table public.rol (
  id_rol uuid primary key default gen_random_uuid(),
  nombre_rol varchar(80) not null unique check (nombre_rol in (
    'ADMINISTRADOR_SISTEMA', 'DIRECTOR_ADMINISTRATIVO', 'RESPONSABLE_PERSONAL_INTERNO',
    'RESPONSABLE_PERSONAL_EXTERNO', 'RESPONSABLE_PUNTOS_CONTROL', 'RESPONSABLE_CONTROL_ACCESOS',
    'GUARDIA_SEGURIDAD'
  )),
  descripcion varchar(255),
  estado_rol text not null default 'ACTIVO' check (estado_rol in ('ACTIVO', 'INACTIVO'))
);

create table public.permiso (
  id_permiso uuid primary key default gen_random_uuid(),
  codigo_permiso varchar(100) not null unique,
  descripcion varchar(255),
  estado_permiso text not null default 'ACTIVO' check (estado_permiso in ('ACTIVO', 'INACTIVO'))
);

create table public.usuario_rol (
  id_usuario_rol uuid primary key default gen_random_uuid(),
  id_usuario uuid not null references public.usuario_sistema (id_usuario),
  id_rol uuid not null references public.rol (id_rol),
  estado_asignacion text not null default 'ACTIVO' check (estado_asignacion in ('ACTIVO', 'REVOCADO')),
  fecha_asignacion timestamptz not null default now(),
  fecha_revocacion timestamptz,
  observacion text
);

create table public.rol_permiso (
  id_rol_permiso uuid primary key default gen_random_uuid(),
  id_rol uuid not null references public.rol (id_rol),
  id_permiso uuid not null references public.permiso (id_permiso),
  estado_asignacion text not null default 'ACTIVO' check (estado_asignacion in ('ACTIVO', 'REVOCADO')),
  fecha_asignacion timestamptz not null default now(),
  fecha_revocacion timestamptz,
  unique (id_rol, id_permiso)
);

create table public.parametro_sistema (
  id_parametro uuid primary key default gen_random_uuid(),
  codigo_parametro varchar(80) not null unique,
  nombre_parametro varchar(120) not null,
  descripcion varchar(255),
  modulo_aplicacion text not null check (modulo_aplicacion in ('AUTENTICACION', 'SESION', 'SEGURIDAD', 'GENERAL')),
  tipo_dato text not null check (tipo_dato in ('ENTERO', 'TEXTO', 'BOOLEANO', 'DECIMAL', 'FECHA')),
  valor_parametro text not null,
  estado_parametro text not null default 'ACTIVO' check (estado_parametro in ('ACTIVO', 'INACTIVO', 'CRITICO')),
  editable boolean not null default true,
  fecha_registro timestamptz not null default now(),
  fecha_modificacion timestamptz,
  id_usuario_modifico uuid references public.usuario_sistema (id_usuario)
);

-- bitacora_sistema: historico de solo insercion (principio de arquitectura).
create table public.bitacora_sistema (
  id_bitacora uuid primary key default gen_random_uuid(),
  fecha_hora timestamptz not null default now(),
  id_usuario uuid references public.usuario_sistema (id_usuario),
  accion varchar(100) not null,
  modulo varchar(20) not null,
  entidad_afectada varchar(80) not null,
  id_entidad_afectada varchar(60),
  resultado text not null check (resultado in ('EXITO', 'ERROR')),
  valor_anterior jsonb,
  valor_nuevo jsonb,
  descripcion text,
  ip_origen varchar(45)
);

create table public.vehiculo (
  id_vehiculo uuid primary key default gen_random_uuid(),
  placa varchar(15),
  tipo_vehiculo text not null check (tipo_vehiculo in ('AUTOMOVIL', 'MOTOCICLETA', 'CAMIONETA', 'BICICLETA', 'OTRO')),
  marca varchar(50),
  modelo varchar(60),
  color varchar(40),
  estado_vehiculo text not null default 'ACTIVO' check (estado_vehiculo in ('ACTIVO', 'SUSPENDIDO', 'DADO_DE_BAJA')),
  fecha_registro timestamptz not null default now(),
  fecha_actualizacion timestamptz,
  id_usuario_registro uuid not null references public.usuario_sistema (id_usuario)
);

-- placa normalizada en mayusculas; unica solo entre vehiculos ACTIVOS.
create or replace function public.normalizar_placa_vehiculo()
returns trigger
language plpgsql
as $$
begin
  if new.placa is not null then
    new.placa := upper(new.placa);
  end if;
  return new;
end;
$$;

create trigger trg_normalizar_placa_vehiculo
before insert or update on public.vehiculo
for each row execute function public.normalizar_placa_vehiculo();

create unique index idx_vehiculo_placa_activo on public.vehiculo (placa) where estado_vehiculo = 'ACTIVO';

-- persona_vehiculo: tabla unica que reemplaza las tres versiones antes
-- propuestas por separado (ADM, GPI, GPE).
create table public.persona_vehiculo (
  id_persona_vehiculo uuid primary key default gen_random_uuid(),
  id_persona uuid not null references public.persona (id_persona),
  id_vehiculo uuid not null references public.vehiculo (id_vehiculo),
  tipo_relacion text not null check (
    tipo_relacion in ('PROPIETARIO', 'CONDUCTOR_AUTORIZADO', 'PASAJERO', 'TEMPORAL')
  ),
  es_responsable_tramite boolean not null default false,
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz,
  estado_relacion text not null default 'ACTIVA' check (
    estado_relacion in ('ACTIVA', 'SUSPENDIDA', 'VENCIDA', 'REVOCADA')
  ),
  motivo_revocacion varchar(255),
  fecha_registro timestamptz not null default now(),
  id_usuario_registro uuid not null references public.usuario_sistema (id_usuario)
);
