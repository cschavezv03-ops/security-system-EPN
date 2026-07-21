-- GPI/GPE · Solo ADMINISTRADOR_SISTEMA puede cambiar el estado de un Responsable o Administrador.
--
-- Reportado en pruebas (Sebastián, 20/07): una cuenta con GPI_PERSONA_UPDATE dio de baja a
-- Carlos Chávez (cédula 1750000141). Chávez no es personal operativo cualquiera: tiene la cuenta
-- `carlos.chavez03` con el rol RESPONSABLE_CONTROL_ACCESOS activo. Ese UPDATE fue GPI revocandole,
-- de hecho, el acceso a otro Responsable de módulo -- un par suyo, no un subordinado.
--
-- GPI_PERSONA_UPDATE (y GPE_PERSONA_UPDATE) existen para que Personal Interno/Externo gestione
-- personal *operativo*: docentes, administrativos y trabajadores sin cuenta de responsable. No
-- para tocar el estado de otros responsables, del director o del administrador del sistema. Esa
-- potestad es exclusiva de ADMINISTRADOR_SISTEMA (ADM_PERSONA_UPDATE) -- el mismo principio que ya
-- protege el rol ADMINISTRADOR_SISTEMA (`proteger_rol_administrador`) y el estado de la cuenta
-- (`proteger_administracion`); a esta persona le faltaba la protección equivalente.
--
-- Se protege por ROL de la persona OBJETIVO, no por permiso del actor: el actor siempre tiene
-- GPI_PERSONA_UPDATE (es la vía que está usando), así que revisar su propio permiso no evita nada.
--
-- Alcance conservador: se incluye DIRECTOR_ADMINISTRATIVO además de los RESPONSABLE_* y
-- ADMINISTRADOR_SISTEMA. El reporte solo nombró "Responsables o administradores", pero Director
-- es el mismo nivel jerárquico (supervisión transversal) y dejarlo fuera abriría el mismo hueco
-- por otra puerta. Anotado como inferencia en docs/99_DUDAS_PARA_EL_EQUIPO.md (V43).

-- ---------------------------------------------------------------------------
-- 1. ¿Esta persona tiene, vía su cuenta, un rol de Administrador/Director/Responsable activo?
-- ---------------------------------------------------------------------------
create or replace function public.persona_tiene_rol_privilegiado(p_id_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.usuario_sistema us
      join public.usuario_rol ur on ur.id_usuario = us.id_usuario
      join public.rol r on r.id_rol = ur.id_rol
     where us.id_persona = p_id_persona
       and ur.estado_asignacion = 'ACTIVO'
       and r.estado_rol = 'ACTIVO'
       and r.nombre_rol in (
         'ADMINISTRADOR_SISTEMA', 'DIRECTOR_ADMINISTRATIVO',
         'RESPONSABLE_PERSONAL_INTERNO', 'RESPONSABLE_PERSONAL_EXTERNO',
         'RESPONSABLE_PUNTOS_CONTROL', 'RESPONSABLE_CONTROL_ACCESOS'
       )
  );
$$;

comment on function public.persona_tiene_rol_privilegiado(uuid) is
  'True si la persona tiene, a traves de su cuenta, un rol activo de Administrador, Director o Responsable de modulo. GUARDIA_SEGURIDAD no cuenta: es personal operativo.';

revoke all on function public.persona_tiene_rol_privilegiado(uuid) from public, anon;
grant execute on function public.persona_tiene_rol_privilegiado(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. La guarda: nadie sin ADM_PERSONA_UPDATE cambia el estado de esa persona.
-- ---------------------------------------------------------------------------
create or replace function public.proteger_personal_privilegiado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  -- auth.uid() es null en migraciones, seed o Edge Functions con service_role: son la via de
  -- confianza para corregir datos, igual que en proteger_administracion.
  if auth.uid() is null then
    return new;
  end if;

  if public.tiene_permiso('ADM_PERSONA_UPDATE') then
    return new;
  end if;

  if public.persona_tiene_rol_privilegiado(old.id_persona) then
    raise exception 'No puedes cambiar el estado de % %: tiene un rol de Responsable, Director o Administrador. Solo el Administrador del Sistema puede hacerlo.', old.nombres, old.apellidos
      using errcode = 'insufficient_privilege',
            hint = 'Pidele a un Administrador del Sistema que cambie el estado de esta persona desde ADM.';
  end if;

  return new;
end;
$$;

comment on function public.proteger_personal_privilegiado() is
  'GPI/GPE no pueden cambiar el estado de una persona con rol de Responsable, Director o Administrador: eso es exclusivo de ADMINISTRADOR_SISTEMA (ADM_PERSONA_UPDATE).';

drop trigger if exists trg_proteger_personal_privilegiado on public.persona;
create trigger trg_proteger_personal_privilegiado
before update of estado on public.persona
for each row execute function public.proteger_personal_privilegiado();

revoke all on function public.proteger_personal_privilegiado() from public, anon, authenticated;
