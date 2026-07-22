-- GPI/GPE/ADM · Dar de baja a una persona es permanente: no se puede volver a activarla.
--
-- Aclarado por Dax (20/07), sobre el reporte anterior de Sebastián: la falta no era solo que GPI
-- pudiera dar de baja a un Responsable (ver 20260720220000), sino que, para CUALQUIER persona
-- --docente, administrativo, trabajador o estudiante--, dar de baja no dejaba nada en la base que
-- impidiera reactivarla despues. El frontend ya asume esto (docs/99_DUDAS_FRONTEND.md F1: el modal
-- de baja no ofrece "reactivar", solo "Editar"/"Dar de baja"), pero eso es cortesia de pantalla:
-- esconder el boton no impide el mismo UPDATE por la API REST -- el mismo argumento que ya se uso
-- para blindar el bloqueo de cuentas (D30, `proteger_administracion`).
--
-- Es coherente con "sin DELETE fisico": la fila sigue existiendo (para que evento_acceso,
-- bitacora_sistema, etc. conserven su FK), pero el estado ya no puede volver a ACTIVO. Mismo
-- principio que el proyecto ya declara para `vehiculo.estado_vehiculo = DADO_DE_BAJA`
-- (20260719204443, comentario "asociacion valida") y para `usuario_sistema.estado_usuario`
-- (D29: "es un ban permanente") -- a esta ultima el codigo real no la hace cumplir todavia; queda
-- anotado en docs/99_DUDAS_PARA_EL_EQUIPO.md (V44) como hallazgo relacionado, fuera de este alcance.
--
-- Es un invariante de datos, no un permiso de actor: se aplica a TODOS, incluido ADM. Por eso no
-- se consulta `tiene_permiso()` aqui, a diferencia de `proteger_personal_privilegiado`.

create or replace function public.impedir_reactivar_persona()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo interesa el intento de VOLVER a ACTIVO desde algo que ya no lo era.
  if old.estado = 'ACTIVO' or new.estado <> 'ACTIVO' then
    return new;
  end if;

  -- auth.uid() es null en migraciones, seed o Edge Functions con service_role: son la via de
  -- confianza para corregir un dato mal capturado, igual que en el resto de guardas del proyecto.
  if auth.uid() is null then
    return new;
  end if;

  raise exception 'No se puede reactivar a % %: dar de baja a una persona es permanente.', old.nombres, old.apellidos
    using errcode = 'check_violation',
          hint = 'Si fue un error de captura, corrigelo con un Administrador del Sistema fuera de la aplicacion; no existe una via de reactivacion en el sistema.';
end;
$$;

comment on function public.impedir_reactivar_persona() is
  'Una vez que persona.estado deja ACTIVO (dar de baja), no puede volver a ACTIVO por ninguna via de la aplicacion. Invariante de datos: aplica a todos los roles, incluido ADM.';

drop trigger if exists trg_impedir_reactivar_persona on public.persona;
create trigger trg_impedir_reactivar_persona
before update of estado on public.persona
for each row execute function public.impedir_reactivar_persona();

revoke all on function public.impedir_reactivar_persona() from public, anon, authenticated;
