export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alerta_seguridad: {
        Row: {
          accion_atencion: string | null
          estado_alerta: string
          fecha_hora: string
          id_alerta: string
          id_evento: string
          id_usuario_atencion: string | null
          nivel_riesgo: string
          observacion_atencion: string | null
          tipo_alerta: string
        }
        Insert: {
          accion_atencion?: string | null
          estado_alerta?: string
          fecha_hora?: string
          id_alerta?: string
          id_evento: string
          id_usuario_atencion?: string | null
          nivel_riesgo: string
          observacion_atencion?: string | null
          tipo_alerta: string
        }
        Update: {
          accion_atencion?: string | null
          estado_alerta?: string
          fecha_hora?: string
          id_alerta?: string
          id_evento?: string
          id_usuario_atencion?: string | null
          nivel_riesgo?: string
          observacion_atencion?: string | null
          tipo_alerta?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerta_seguridad_id_evento_fkey"
            columns: ["id_evento"]
            isOneToOne: false
            referencedRelation: "evento_acceso"
            referencedColumns: ["id_evento"]
          },
          {
            foreignKeyName: "alerta_seguridad_id_evento_fkey"
            columns: ["id_evento"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos_dentro"
            referencedColumns: ["id_evento_ingreso"]
          },
          {
            foreignKeyName: "alerta_seguridad_id_usuario_atencion_fkey"
            columns: ["id_usuario_atencion"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      autorizacion_visita_diaria: {
        Row: {
          estado_autorizacion: string
          fecha_registro: string
          fecha_visita: string
          id_autorizacion: string
          id_persona: string
          id_usuario_registro: string
          motivo: string
          motivo_revocacion: string | null
        }
        Insert: {
          estado_autorizacion?: string
          fecha_registro?: string
          fecha_visita: string
          id_autorizacion?: string
          id_persona: string
          id_usuario_registro: string
          motivo: string
          motivo_revocacion?: string | null
        }
        Update: {
          estado_autorizacion?: string
          fecha_registro?: string
          fecha_visita?: string
          id_autorizacion?: string
          id_persona?: string
          id_usuario_registro?: string
          motivo?: string
          motivo_revocacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizacion_visita_diaria_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "autorizacion_visita_diaria_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      bitacora_sistema: {
        Row: {
          accion: string
          descripcion: string | null
          entidad_afectada: string
          fecha_hora: string
          id_bitacora: string
          id_entidad_afectada: string | null
          id_usuario: string | null
          ip_origen: string | null
          modulo: string
          resultado: string
          valor_anterior: Json | null
          valor_nuevo: Json | null
        }
        Insert: {
          accion: string
          descripcion?: string | null
          entidad_afectada: string
          fecha_hora?: string
          id_bitacora?: string
          id_entidad_afectada?: string | null
          id_usuario?: string | null
          ip_origen?: string | null
          modulo: string
          resultado: string
          valor_anterior?: Json | null
          valor_nuevo?: Json | null
        }
        Update: {
          accion?: string
          descripcion?: string | null
          entidad_afectada?: string
          fecha_hora?: string
          id_bitacora?: string
          id_entidad_afectada?: string | null
          id_usuario?: string | null
          ip_origen?: string | null
          modulo?: string
          resultado?: string
          valor_anterior?: Json | null
          valor_nuevo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_sistema_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      categoria_persona: {
        Row: {
          ambito: string
          codigo_categoria: string
          descripcion: string
          estado: string
          id_categoria: string
        }
        Insert: {
          ambito: string
          codigo_categoria: string
          descripcion: string
          estado?: string
          id_categoria?: string
        }
        Update: {
          ambito?: string
          codigo_categoria?: string
          descripcion?: string
          estado?: string
          id_categoria?: string
        }
        Relationships: []
      }
      dispositivo: {
        Row: {
          codigo_dispositivo: string
          codigo_mac: string | null
          direccion_ip: string
          estado_dispositivo: string
          id_dispositivo: string
          id_punto_control: string
          tipo_tecnologia: string
        }
        Insert: {
          codigo_dispositivo: string
          codigo_mac?: string | null
          direccion_ip: string
          estado_dispositivo?: string
          id_dispositivo?: string
          id_punto_control: string
          tipo_tecnologia: string
        }
        Update: {
          codigo_dispositivo?: string
          codigo_mac?: string | null
          direccion_ip?: string
          estado_dispositivo?: string
          id_dispositivo?: string
          id_punto_control?: string
          tipo_tecnologia?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispositivo_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
        ]
      }
      empresa: {
        Row: {
          estado: string
          estado_verificacion_ruc: string
          fecha_registro: string
          id_empresa: string
          nombre: string
          ruc: string | null
          tipo_servicio: string | null
        }
        Insert: {
          estado?: string
          estado_verificacion_ruc?: string
          fecha_registro?: string
          id_empresa?: string
          nombre: string
          ruc?: string | null
          tipo_servicio?: string | null
        }
        Update: {
          estado?: string
          estado_verificacion_ruc?: string
          fecha_registro?: string
          id_empresa?: string
          nombre?: string
          ruc?: string | null
          tipo_servicio?: string | null
        }
        Relationships: []
      }
      error_reconocimiento: {
        Row: {
          codigo_error: string
          descripcion: string
          fecha_hora: string
          id_dispositivo: string | null
          id_error: string
          id_evento: string | null
          id_punto_control: string | null
          id_usuario: string | null
          tipo_reconocimiento: string
        }
        Insert: {
          codigo_error: string
          descripcion: string
          fecha_hora?: string
          id_dispositivo?: string | null
          id_error?: string
          id_evento?: string | null
          id_punto_control?: string | null
          id_usuario?: string | null
          tipo_reconocimiento: string
        }
        Update: {
          codigo_error?: string
          descripcion?: string
          fecha_hora?: string
          id_dispositivo?: string | null
          id_error?: string
          id_evento?: string | null
          id_punto_control?: string | null
          id_usuario?: string | null
          tipo_reconocimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_reconocimiento_id_dispositivo_fkey"
            columns: ["id_dispositivo"]
            isOneToOne: false
            referencedRelation: "dispositivo"
            referencedColumns: ["id_dispositivo"]
          },
          {
            foreignKeyName: "error_reconocimiento_id_evento_fkey"
            columns: ["id_evento"]
            isOneToOne: false
            referencedRelation: "evento_acceso"
            referencedColumns: ["id_evento"]
          },
          {
            foreignKeyName: "error_reconocimiento_id_evento_fkey"
            columns: ["id_evento"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos_dentro"
            referencedColumns: ["id_evento_ingreso"]
          },
          {
            foreignKeyName: "error_reconocimiento_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
          {
            foreignKeyName: "error_reconocimiento_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      evento_acceso: {
        Row: {
          confianza_biometria: number | null
          confianza_placa: number | null
          es_conductor: boolean
          fecha_hora: string
          id_autorizacion_visita: string | null
          id_evento: string
          id_evento_ingreso: string | null
          id_persona: string | null
          id_punto_control: string
          id_regla_acceso: string | null
          id_vehiculo: string | null
          motivo_resultado: string | null
          origen_registro: string
          placa_detectada: string | null
          resultado: string
          tipo_acceso: string
          tipo_movimiento: string
        }
        Insert: {
          confianza_biometria?: number | null
          confianza_placa?: number | null
          es_conductor?: boolean
          fecha_hora?: string
          id_autorizacion_visita?: string | null
          id_evento?: string
          id_evento_ingreso?: string | null
          id_persona?: string | null
          id_punto_control: string
          id_regla_acceso?: string | null
          id_vehiculo?: string | null
          motivo_resultado?: string | null
          origen_registro: string
          placa_detectada?: string | null
          resultado: string
          tipo_acceso?: string
          tipo_movimiento: string
        }
        Update: {
          confianza_biometria?: number | null
          confianza_placa?: number | null
          es_conductor?: boolean
          fecha_hora?: string
          id_autorizacion_visita?: string | null
          id_evento?: string
          id_evento_ingreso?: string | null
          id_persona?: string | null
          id_punto_control?: string
          id_regla_acceso?: string | null
          id_vehiculo?: string | null
          motivo_resultado?: string | null
          origen_registro?: string
          placa_detectada?: string | null
          resultado?: string
          tipo_acceso?: string
          tipo_movimiento?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_acceso_id_autorizacion_visita_fkey"
            columns: ["id_autorizacion_visita"]
            isOneToOne: false
            referencedRelation: "autorizacion_visita_diaria"
            referencedColumns: ["id_autorizacion"]
          },
          {
            foreignKeyName: "evento_acceso_id_evento_ingreso_fkey"
            columns: ["id_evento_ingreso"]
            isOneToOne: false
            referencedRelation: "evento_acceso"
            referencedColumns: ["id_evento"]
          },
          {
            foreignKeyName: "evento_acceso_id_evento_ingreso_fkey"
            columns: ["id_evento_ingreso"]
            isOneToOne: false
            referencedRelation: "vista_vehiculos_dentro"
            referencedColumns: ["id_evento_ingreso"]
          },
          {
            foreignKeyName: "evento_acceso_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "evento_acceso_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
          {
            foreignKeyName: "evento_acceso_id_regla_acceso_fkey"
            columns: ["id_regla_acceso"]
            isOneToOne: false
            referencedRelation: "regla_acceso"
            referencedColumns: ["id_regla_acceso"]
          },
          {
            foreignKeyName: "evento_acceso_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id_vehiculo"]
          },
          {
            foreignKeyName: "evento_acceso_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vista_vehiculo_sin_propietario"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      guardia_punto_control: {
        Row: {
          estado_asignacion: string
          fecha_fin: string | null
          fecha_inicio: string
          fecha_registro: string
          hora_fin: string | null
          hora_inicio: string | null
          id_asignacion: string
          id_punto_control: string
          id_usuario: string
          id_usuario_registro: string
          turno: string | null
        }
        Insert: {
          estado_asignacion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          fecha_registro?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id_asignacion?: string
          id_punto_control: string
          id_usuario: string
          id_usuario_registro: string
          turno?: string | null
        }
        Update: {
          estado_asignacion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          fecha_registro?: string
          hora_fin?: string | null
          hora_inicio?: string | null
          id_asignacion?: string
          id_punto_control?: string
          id_usuario?: string
          id_usuario_registro?: string
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardia_punto_control_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
          {
            foreignKeyName: "guardia_punto_control_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "guardia_punto_control_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      memorando: {
        Row: {
          dependencia_autorizada: string | null
          estado_memorando: string
          fecha_anulacion: string | null
          fecha_fin: string
          fecha_inicio: string
          fecha_registro: string
          id_empresa: string
          id_memorando: string
          id_usuario_registro: string
          motivo_anulacion: string | null
          numero_memorando: string
          permite_acompanantes: boolean
          permite_vehiculo: boolean
        }
        Insert: {
          dependencia_autorizada?: string | null
          estado_memorando?: string
          fecha_anulacion?: string | null
          fecha_fin: string
          fecha_inicio: string
          fecha_registro?: string
          id_empresa: string
          id_memorando?: string
          id_usuario_registro: string
          motivo_anulacion?: string | null
          numero_memorando: string
          permite_acompanantes?: boolean
          permite_vehiculo?: boolean
        }
        Update: {
          dependencia_autorizada?: string | null
          estado_memorando?: string
          fecha_anulacion?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          fecha_registro?: string
          id_empresa?: string
          id_memorando?: string
          id_usuario_registro?: string
          motivo_anulacion?: string | null
          numero_memorando?: string
          permite_acompanantes?: boolean
          permite_vehiculo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "memorando_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id_empresa"]
          },
          {
            foreignKeyName: "memorando_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      memorando_vehiculo: {
        Row: {
          fecha_registro: string
          id_memorando: string
          id_memorando_vehiculo: string
          id_usuario_registro: string | null
          id_vehiculo: string
          observacion: string | null
        }
        Insert: {
          fecha_registro?: string
          id_memorando: string
          id_memorando_vehiculo?: string
          id_usuario_registro?: string | null
          id_vehiculo: string
          observacion?: string | null
        }
        Update: {
          fecha_registro?: string
          id_memorando?: string
          id_memorando_vehiculo?: string
          id_usuario_registro?: string | null
          id_vehiculo?: string
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memorando_vehiculo_id_memorando_fkey"
            columns: ["id_memorando"]
            isOneToOne: false
            referencedRelation: "memorando"
            referencedColumns: ["id_memorando"]
          },
          {
            foreignKeyName: "memorando_vehiculo_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "memorando_vehiculo_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id_vehiculo"]
          },
          {
            foreignKeyName: "memorando_vehiculo_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vista_vehiculo_sin_propietario"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      parametro_sistema: {
        Row: {
          codigo_parametro: string
          descripcion: string | null
          editable: boolean
          estado_parametro: string
          fecha_modificacion: string | null
          fecha_registro: string
          id_parametro: string
          id_usuario_modifico: string | null
          modulo_aplicacion: string
          nombre_parametro: string
          tipo_dato: string
          unidad_medida: string | null
          valor_parametro: string
        }
        Insert: {
          codigo_parametro: string
          descripcion?: string | null
          editable?: boolean
          estado_parametro?: string
          fecha_modificacion?: string | null
          fecha_registro?: string
          id_parametro?: string
          id_usuario_modifico?: string | null
          modulo_aplicacion: string
          nombre_parametro: string
          tipo_dato: string
          unidad_medida?: string | null
          valor_parametro: string
        }
        Update: {
          codigo_parametro?: string
          descripcion?: string | null
          editable?: boolean
          estado_parametro?: string
          fecha_modificacion?: string | null
          fecha_registro?: string
          id_parametro?: string
          id_usuario_modifico?: string | null
          modulo_aplicacion?: string
          nombre_parametro?: string
          tipo_dato?: string
          unidad_medida?: string | null
          valor_parametro?: string
        }
        Relationships: [
          {
            foreignKeyName: "parametro_sistema_id_usuario_modifico_fkey"
            columns: ["id_usuario_modifico"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      permiso: {
        Row: {
          codigo_permiso: string
          descripcion: string | null
          estado_permiso: string
          id_permiso: string
        }
        Insert: {
          codigo_permiso: string
          descripcion?: string | null
          estado_permiso?: string
          id_permiso?: string
        }
        Update: {
          codigo_permiso?: string
          descripcion?: string | null
          estado_permiso?: string
          id_permiso?: string
        }
        Relationships: []
      }
      persona: {
        Row: {
          apellidos: string
          cedula: string
          codigo_unico: string | null
          correo: string | null
          correo_respaldo: string | null
          detalle_estado: string | null
          direccion_domicilio: string | null
          estado: string
          fecha_modificacion: string | null
          fecha_nacimiento: string | null
          fecha_registro: string
          id_categoria: string
          id_empresa: string | null
          id_persona: string
          nombres: string
          sexo: string | null
          telefono_contacto: string | null
          telefono_respaldo: string | null
          tipo_persona: string
        }
        Insert: {
          apellidos: string
          cedula: string
          codigo_unico?: string | null
          correo?: string | null
          correo_respaldo?: string | null
          detalle_estado?: string | null
          direccion_domicilio?: string | null
          estado?: string
          fecha_modificacion?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string
          id_categoria: string
          id_empresa?: string | null
          id_persona?: string
          nombres: string
          sexo?: string | null
          telefono_contacto?: string | null
          telefono_respaldo?: string | null
          tipo_persona: string
        }
        Update: {
          apellidos?: string
          cedula?: string
          codigo_unico?: string | null
          correo?: string | null
          correo_respaldo?: string | null
          detalle_estado?: string | null
          direccion_domicilio?: string | null
          estado?: string
          fecha_modificacion?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string
          id_categoria?: string
          id_empresa?: string | null
          id_persona?: string
          nombres?: string
          sexo?: string | null
          telefono_contacto?: string | null
          telefono_respaldo?: string | null
          tipo_persona?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categoria_persona"
            referencedColumns: ["id_categoria"]
          },
          {
            foreignKeyName: "persona_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "vista_categoria_sin_regla"
            referencedColumns: ["id_categoria"]
          },
          {
            foreignKeyName: "persona_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id_empresa"]
          },
        ]
      }
      persona_interna_detalle: {
        Row: {
          cargo: string | null
          carrera: string | null
          categoria_escalafon: string | null
          contrato: string | null
          curso: string | null
          id_persona: string
          nombramiento: string | null
          unidad: string | null
        }
        Insert: {
          cargo?: string | null
          carrera?: string | null
          categoria_escalafon?: string | null
          contrato?: string | null
          curso?: string | null
          id_persona: string
          nombramiento?: string | null
          unidad?: string | null
        }
        Update: {
          cargo?: string | null
          carrera?: string | null
          categoria_escalafon?: string | null
          contrato?: string | null
          curso?: string | null
          id_persona?: string
          nombramiento?: string | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_interna_detalle_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: true
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      persona_memorando: {
        Row: {
          estado_acceso: string
          id_memorando: string
          id_persona: string
          id_persona_memorando: string
        }
        Insert: {
          estado_acceso?: string
          id_memorando: string
          id_persona: string
          id_persona_memorando?: string
        }
        Update: {
          estado_acceso?: string
          id_memorando?: string
          id_persona?: string
          id_persona_memorando?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_memorando_id_memorando_fkey"
            columns: ["id_memorando"]
            isOneToOne: false
            referencedRelation: "memorando"
            referencedColumns: ["id_memorando"]
          },
          {
            foreignKeyName: "persona_memorando_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      persona_vehiculo: {
        Row: {
          es_responsable_tramite: boolean
          estado_relacion: string
          fecha_fin: string | null
          fecha_inicio: string
          fecha_registro: string
          id_persona: string
          id_persona_vehiculo: string
          id_usuario_registro: string
          id_vehiculo: string
          motivo_revocacion: string | null
          tipo_relacion: string
        }
        Insert: {
          es_responsable_tramite?: boolean
          estado_relacion?: string
          fecha_fin?: string | null
          fecha_inicio: string
          fecha_registro?: string
          id_persona: string
          id_persona_vehiculo?: string
          id_usuario_registro: string
          id_vehiculo: string
          motivo_revocacion?: string | null
          tipo_relacion: string
        }
        Update: {
          es_responsable_tramite?: boolean
          estado_relacion?: string
          fecha_fin?: string | null
          fecha_inicio?: string
          fecha_registro?: string
          id_persona?: string
          id_persona_vehiculo?: string
          id_usuario_registro?: string
          id_vehiculo?: string
          motivo_revocacion?: string | null
          tipo_relacion?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_vehiculo_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "persona_vehiculo_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "persona_vehiculo_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id_vehiculo"]
          },
          {
            foreignKeyName: "persona_vehiculo_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vista_vehiculo_sin_propietario"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      punto_control: {
        Row: {
          estado_punto: string
          fecha_registro: string
          id_punto_control: string
          id_zona: string
          nombre_punto: string
        }
        Insert: {
          estado_punto?: string
          fecha_registro?: string
          id_punto_control?: string
          id_zona: string
          nombre_punto: string
        }
        Update: {
          estado_punto?: string
          fecha_registro?: string
          id_punto_control?: string
          id_zona?: string
          nombre_punto?: string
        }
        Relationships: [
          {
            foreignKeyName: "punto_control_id_zona_fkey"
            columns: ["id_zona"]
            isOneToOne: false
            referencedRelation: "zona"
            referencedColumns: ["id_zona"]
          },
        ]
      }
      registro_biometrico: {
        Row: {
          descriptor_facial: string | null
          fecha_registro: string
          id_persona: string
          id_registro: string
          id_usuario_registro: string | null
          path_storage: string
          tipo_dato: string
          vigente: boolean
        }
        Insert: {
          descriptor_facial?: string | null
          fecha_registro?: string
          id_persona: string
          id_registro?: string
          id_usuario_registro?: string | null
          path_storage: string
          tipo_dato?: string
          vigente?: boolean
        }
        Update: {
          descriptor_facial?: string | null
          fecha_registro?: string
          id_persona?: string
          id_registro?: string
          id_usuario_registro?: string | null
          path_storage?: string
          tipo_dato?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "registro_biometrico_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "registro_biometrico_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      regla_acceso: {
        Row: {
          descripcion: string | null
          estado_regla: string
          horario_fin: string
          horario_inicio: string
          id_categoria: string
          id_regla_acceso: string
          nombre_regla: string
          requiere_memorando: boolean
        }
        Insert: {
          descripcion?: string | null
          estado_regla?: string
          horario_fin: string
          horario_inicio: string
          id_categoria: string
          id_regla_acceso?: string
          nombre_regla: string
          requiere_memorando: boolean
        }
        Update: {
          descripcion?: string | null
          estado_regla?: string
          horario_fin?: string
          horario_inicio?: string
          id_categoria?: string
          id_regla_acceso?: string
          nombre_regla?: string
          requiere_memorando?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "regla_acceso_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categoria_persona"
            referencedColumns: ["id_categoria"]
          },
          {
            foreignKeyName: "regla_acceso_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "vista_categoria_sin_regla"
            referencedColumns: ["id_categoria"]
          },
        ]
      }
      regla_acceso_punto_control: {
        Row: {
          fecha_registro: string
          id_punto_control: string
          id_regla_acceso: string
        }
        Insert: {
          fecha_registro?: string
          id_punto_control: string
          id_regla_acceso: string
        }
        Update: {
          fecha_registro?: string
          id_punto_control?: string
          id_regla_acceso?: string
        }
        Relationships: [
          {
            foreignKeyName: "regla_acceso_punto_control_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
          {
            foreignKeyName: "regla_acceso_punto_control_id_regla_acceso_fkey"
            columns: ["id_regla_acceso"]
            isOneToOne: false
            referencedRelation: "regla_acceso"
            referencedColumns: ["id_regla_acceso"]
          },
        ]
      }
      rol: {
        Row: {
          descripcion: string | null
          estado_rol: string
          id_rol: string
          nombre_rol: string
        }
        Insert: {
          descripcion?: string | null
          estado_rol?: string
          id_rol?: string
          nombre_rol: string
        }
        Update: {
          descripcion?: string | null
          estado_rol?: string
          id_rol?: string
          nombre_rol?: string
        }
        Relationships: []
      }
      rol_permiso: {
        Row: {
          estado_asignacion: string
          fecha_asignacion: string
          fecha_revocacion: string | null
          id_permiso: string
          id_rol: string
          id_rol_permiso: string
        }
        Insert: {
          estado_asignacion?: string
          fecha_asignacion?: string
          fecha_revocacion?: string | null
          id_permiso: string
          id_rol: string
          id_rol_permiso?: string
        }
        Update: {
          estado_asignacion?: string
          fecha_asignacion?: string
          fecha_revocacion?: string | null
          id_permiso?: string
          id_rol?: string
          id_rol_permiso?: string
        }
        Relationships: [
          {
            foreignKeyName: "rol_permiso_id_permiso_fkey"
            columns: ["id_permiso"]
            isOneToOne: false
            referencedRelation: "permiso"
            referencedColumns: ["id_permiso"]
          },
          {
            foreignKeyName: "rol_permiso_id_rol_fkey"
            columns: ["id_rol"]
            isOneToOne: false
            referencedRelation: "rol"
            referencedColumns: ["id_rol"]
          },
        ]
      }
      sesion: {
        Row: {
          dispositivo_nombre: string | null
          estado_sesion: string
          fecha_cierre: string | null
          fecha_expiracion: string
          fecha_inicio: string
          fecha_revocacion: string | null
          fecha_ultima_actividad: string | null
          id_sesion: string
          id_sesion_proveedor: string | null
          id_usuario: string
          ip_origen: string | null
          motivo_cierre: string | null
          recordar_sesion: boolean
          revocada_por: string | null
          token_hash: string | null
          user_agent: string | null
        }
        Insert: {
          dispositivo_nombre?: string | null
          estado_sesion?: string
          fecha_cierre?: string | null
          fecha_expiracion: string
          fecha_inicio?: string
          fecha_revocacion?: string | null
          fecha_ultima_actividad?: string | null
          id_sesion?: string
          id_sesion_proveedor?: string | null
          id_usuario: string
          ip_origen?: string | null
          motivo_cierre?: string | null
          recordar_sesion?: boolean
          revocada_por?: string | null
          token_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          dispositivo_nombre?: string | null
          estado_sesion?: string
          fecha_cierre?: string | null
          fecha_expiracion?: string
          fecha_inicio?: string
          fecha_revocacion?: string | null
          fecha_ultima_actividad?: string | null
          id_sesion?: string
          id_sesion_proveedor?: string | null
          id_usuario?: string
          ip_origen?: string | null
          motivo_cierre?: string | null
          recordar_sesion?: boolean
          revocada_por?: string | null
          token_hash?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sesion_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
          {
            foreignKeyName: "sesion_revocada_por_fkey"
            columns: ["revocada_por"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      usuario_rol: {
        Row: {
          estado_asignacion: string
          fecha_asignacion: string
          fecha_revocacion: string | null
          id_rol: string
          id_usuario: string
          id_usuario_rol: string
          observacion: string | null
        }
        Insert: {
          estado_asignacion?: string
          fecha_asignacion?: string
          fecha_revocacion?: string | null
          id_rol: string
          id_usuario: string
          id_usuario_rol?: string
          observacion?: string | null
        }
        Update: {
          estado_asignacion?: string
          fecha_asignacion?: string
          fecha_revocacion?: string | null
          id_rol?: string
          id_usuario?: string
          id_usuario_rol?: string
          observacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuario_rol_id_rol_fkey"
            columns: ["id_rol"]
            isOneToOne: false
            referencedRelation: "rol"
            referencedColumns: ["id_rol"]
          },
          {
            foreignKeyName: "usuario_rol_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      usuario_sistema: {
        Row: {
          bloqueado_hasta: string | null
          correo_electronico: string
          estado_usuario: string
          fecha_cambio_password_inicial: string | null
          fecha_creacion: string
          fecha_modificacion: string | null
          fecha_ultimo_login: string | null
          id_persona: string
          id_usuario: string
          intentos_fallidos: number
          nombre_usuario: string
          requiere_cambio_password: boolean
        }
        Insert: {
          bloqueado_hasta?: string | null
          correo_electronico: string
          estado_usuario?: string
          fecha_cambio_password_inicial?: string | null
          fecha_creacion?: string
          fecha_modificacion?: string | null
          fecha_ultimo_login?: string | null
          id_persona: string
          id_usuario: string
          intentos_fallidos?: number
          nombre_usuario: string
          requiere_cambio_password?: boolean
        }
        Update: {
          bloqueado_hasta?: string | null
          correo_electronico?: string
          estado_usuario?: string
          fecha_cambio_password_inicial?: string | null
          fecha_creacion?: string
          fecha_modificacion?: string | null
          fecha_ultimo_login?: string | null
          id_persona?: string
          id_usuario?: string
          intentos_fallidos?: number
          nombre_usuario?: string
          requiere_cambio_password?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "usuario_sistema_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
        ]
      }
      vehiculo: {
        Row: {
          color: string | null
          estado_vehiculo: string
          fecha_actualizacion: string | null
          fecha_registro: string
          id_usuario_registro: string
          id_vehiculo: string
          marca: string | null
          modelo: string | null
          motivo_sin_placa: string | null
          placa: string | null
          tipo_vehiculo: string
        }
        Insert: {
          color?: string | null
          estado_vehiculo?: string
          fecha_actualizacion?: string | null
          fecha_registro?: string
          id_usuario_registro: string
          id_vehiculo?: string
          marca?: string | null
          modelo?: string | null
          motivo_sin_placa?: string | null
          placa?: string | null
          tipo_vehiculo: string
        }
        Update: {
          color?: string | null
          estado_vehiculo?: string
          fecha_actualizacion?: string | null
          fecha_registro?: string
          id_usuario_registro?: string
          id_vehiculo?: string
          marca?: string | null
          modelo?: string | null
          motivo_sin_placa?: string | null
          placa?: string | null
          tipo_vehiculo?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehiculo_id_usuario_registro_fkey"
            columns: ["id_usuario_registro"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      zona: {
        Row: {
          estado_zona: string
          fecha_registro: string
          id_zona: string
          id_zona_padre: string | null
          nombre_zona: string
          numero_edificio: number | null
          tipo_zona: string
        }
        Insert: {
          estado_zona?: string
          fecha_registro?: string
          id_zona?: string
          id_zona_padre?: string | null
          nombre_zona: string
          numero_edificio?: number | null
          tipo_zona: string
        }
        Update: {
          estado_zona?: string
          fecha_registro?: string
          id_zona?: string
          id_zona_padre?: string | null
          nombre_zona?: string
          numero_edificio?: number | null
          tipo_zona?: string
        }
        Relationships: [
          {
            foreignKeyName: "zona_id_zona_padre_fkey"
            columns: ["id_zona_padre"]
            isOneToOne: false
            referencedRelation: "zona"
            referencedColumns: ["id_zona"]
          },
        ]
      }
    }
    Views: {
      v_auditoria: {
        Row: {
          accion: string | null
          cambios: Json | null
          datos: string | null
          descripcion: string | null
          ejecutor_correo: string | null
          ejecutor_nombre: string | null
          ejecutor_usuario: string | null
          entidad_afectada: string | null
          fecha_hora: string | null
          hora_entrada: string | null
          hora_salida: string | null
          id_bitacora: string | null
          id_entidad_afectada: string | null
          id_usuario: string | null
          ip_origen: string | null
          modulo: string | null
          motivo_cierre: string | null
          registro_afectado: string | null
          resultado: string | null
          tipo_registro: string | null
          usuario_accedido: string | null
          usuario_accedido_correo: string | null
          valor_anterior: Json | null
          valor_nuevo: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_sistema_id_usuario_fkey"
            columns: ["id_usuario"]
            isOneToOne: false
            referencedRelation: "usuario_sistema"
            referencedColumns: ["id_usuario"]
          },
        ]
      }
      vista_categoria_sin_regla: {
        Row: {
          ambito: string | null
          codigo_categoria: string | null
          id_categoria: string | null
          personas_afectadas: number | null
        }
        Relationships: []
      }
      vista_vehiculo_sin_propietario: {
        Row: {
          estado_vehiculo: string | null
          fecha_registro: string | null
          id_vehiculo: string | null
          placa: string | null
          tipo_vehiculo: string | null
        }
        Insert: {
          estado_vehiculo?: string | null
          fecha_registro?: string | null
          id_vehiculo?: string | null
          placa?: string | null
          tipo_vehiculo?: string | null
        }
        Update: {
          estado_vehiculo?: string | null
          fecha_registro?: string | null
          id_vehiculo?: string | null
          placa?: string | null
          tipo_vehiculo?: string | null
        }
        Relationships: []
      }
      vista_vehiculos_dentro: {
        Row: {
          apellidos_conductor: string | null
          cedula_conductor: string | null
          fecha_ingreso: string | null
          horas_dentro: number | null
          id_evento_ingreso: string | null
          id_persona_conductor: string | null
          id_punto_control: string | null
          id_vehiculo: string | null
          limite_abandono_horas: number | null
          limite_horas_aplicable: number | null
          nombres_conductor: string | null
          placa: string | null
          tipo_persona_conductor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evento_acceso_id_persona_fkey"
            columns: ["id_persona_conductor"]
            isOneToOne: false
            referencedRelation: "persona"
            referencedColumns: ["id_persona"]
          },
          {
            foreignKeyName: "evento_acceso_id_punto_control_fkey"
            columns: ["id_punto_control"]
            isOneToOne: false
            referencedRelation: "punto_control"
            referencedColumns: ["id_punto_control"]
          },
          {
            foreignKeyName: "evento_acceso_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vehiculo"
            referencedColumns: ["id_vehiculo"]
          },
          {
            foreignKeyName: "evento_acceso_id_vehiculo_fkey"
            columns: ["id_vehiculo"]
            isOneToOne: false
            referencedRelation: "vista_vehiculo_sin_propietario"
            referencedColumns: ["id_vehiculo"]
          },
        ]
      }
      vista_vigencia_acceso: {
        Row: {
          id_autorizacion: string | null
          id_memorando: string | null
          id_persona: string | null
          tipo_persona: string | null
          via_vigencia: string | null
          vigente_hasta: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acentuar_texto: { Args: { texto: string }; Returns: string }
      allowed_modules: { Args: never; Returns: string[] }
      asignar_rol_unico: {
        Args: { p_id_rol: string; p_id_usuario: string; p_observacion?: string }
        Returns: string
      }
      buscar_guardia_por_cedula: {
        Args: { p_cedula: string }
        Returns: {
          cedula: string
          id_usuario: string
          nombre_completo: string
          ya_asignado: boolean
        }[]
      }
      categoria_puede_operar: {
        Args: { p_id_persona: string }
        Returns: boolean
      }
      cerrar_sesion: {
        Args: { p_id_sesion?: string }
        Returns: {
          dispositivo_nombre: string | null
          estado_sesion: string
          fecha_cierre: string | null
          fecha_expiracion: string
          fecha_inicio: string
          fecha_revocacion: string | null
          fecha_ultima_actividad: string | null
          id_sesion: string
          id_sesion_proveedor: string | null
          id_usuario: string
          ip_origen: string | null
          motivo_cierre: string | null
          recordar_sesion: boolean
          revocada_por: string | null
          token_hash: string | null
          user_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sesion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cerrar_sesion_admin: { Args: { p_id_sesion: string }; Returns: Json }
      codigo_ubicacion_epn: { Args: { p_nombre: string }; Returns: string }
      componer_nombre_punto_epn: {
        Args: {
          p_descripcion?: string
          p_edificio: number
          p_espacio: number
          p_piso: number
        }
        Returns: string
      }
      corregir_placa_ocr: { Args: { p_placa: string }; Returns: string }
      crear_memorando_con_vehiculo: {
        Args: {
          p_color?: string
          p_dependencia_autorizada?: string
          p_fecha_fin: string
          p_fecha_inicio: string
          p_id_empresa: string
          p_id_persona_responsable?: string
          p_marca?: string
          p_modelo?: string
          p_numero_memorando: string
          p_permite_acompanantes?: boolean
          p_permite_vehiculo?: boolean
          p_placa?: string
          p_tipo_vehiculo?: string
        }
        Returns: Json
      }
      crear_vehiculo_con_propietario: {
        Args: {
          p_color?: string
          p_fecha_fin: string
          p_fecha_inicio?: string
          p_id_persona: string
          p_marca?: string
          p_modelo?: string
          p_motivo_sin_placa?: string
          p_placa?: string
          p_tipo_relacion?: string
          p_tipo_vehiculo: string
        }
        Returns: Json
      }
      desbloquear_intentos_login: {
        Args: { p_id_usuario: string }
        Returns: undefined
      }
      detalle_cambio: { Args: { anterior: Json; nuevo: Json }; Returns: Json }
      duracion_turno_min: {
        Args: { p_fin: string; p_inicio: string }
        Returns: number
      }
      enrolar_biometria: {
        Args: {
          p_descriptor: number[]
          p_id_persona: string
          p_path_storage: string
        }
        Returns: string
      }
      es_cedula_ecuatoriana: { Args: { p_cedula: string }; Returns: boolean }
      es_codigo_permiso: { Args: { p_codigo: string }; Returns: boolean }
      es_correo: { Args: { p_correo: string }; Returns: boolean }
      es_correo_institucional_epn: {
        Args: { p_correo: string }
        Returns: boolean
      }
      es_fecha_nacimiento_valida: {
        Args: { p_fecha: string }
        Returns: boolean
      }
      es_ip: { Args: { p_ip: string }; Returns: boolean }
      es_mac: { Args: { p_mac: string }; Returns: boolean }
      es_nombre_con_mayuscula: { Args: { p_nombre: string }; Returns: boolean }
      es_nombre_persona: { Args: { p_nombre: string }; Returns: boolean }
      es_numero_memorando: { Args: { p_numero: string }; Returns: boolean }
      es_persona_de_guardia: {
        Args: { p_id_persona: string }
        Returns: boolean
      }
      es_placa_ec: { Args: { p_placa: string }; Returns: boolean }
      es_placa_vehiculo: {
        Args: { p_placa: string; p_tipo: string }
        Returns: boolean
      }
      es_relleno_obvio: { Args: { p_num: string }; Returns: boolean }
      es_ruc_ecuatoriano: { Args: { p_ruc: string }; Returns: boolean }
      es_ruc_estructural: { Args: { p_ruc: string }; Returns: boolean }
      es_telefono_ec: { Args: { p_telefono: string }; Returns: boolean }
      es_ubicacion_epn: { Args: { p_texto: string }; Returns: boolean }
      es_usuario_guardia: { Args: { p_id_usuario: string }; Returns: boolean }
      esta_en_turno: {
        Args: { p_fin: string; p_inicio: string; p_momento: string }
        Returns: boolean
      }
      esta_en_turno_guardia: {
        Args: { p_id_usuario: string; p_momento?: string }
        Returns: boolean
      }
      estado_autorizacion_efectivo: {
        Args: { p_estado: string; p_fecha_visita: string }
        Returns: string
      }
      estado_memorando_efectivo: {
        Args: { p_estado: string; p_fecha_fin: string; p_fecha_inicio: string }
        Returns: string
      }
      etiqueta_entidad: { Args: { entidad: string }; Returns: string }
      expirar_sesiones_vencidas: { Args: never; Returns: number }
      formatear_placa: { Args: { p_placa: string }; Returns: string }
      guardias_disponibles: {
        Args: never
        Returns: {
          correo_electronico: string
          id_usuario: string
          nombre_usuario: string
        }[]
      }
      hook_password_verification_attempt: {
        Args: { event: Json }
        Returns: Json
      }
      hora_corte_categoria: {
        Args: { p_id_categoria: string }
        Returns: string
      }
      hora_ecuador: { Args: never; Returns: string }
      hoy_ecuador: { Args: never; Returns: string }
      identificar_placa: {
        Args: { p_placa_leida: string }
        Returns: {
          ambigua: boolean
          corregida: boolean
          distancia: number
          estado_vehiculo: string
          id_vehiculo: string
          placa: string
        }[]
      }
      identificar_por_descriptor: {
        Args: { p_descriptor: number[] }
        Returns: {
          confidence: number
          id_persona: string
        }[]
      }
      marcar_password_cambiada: { Args: never; Returns: undefined }
      memorandos_vigentes_de_vehiculo: {
        Args: { p_id_vehiculo: string }
        Returns: {
          dependencia_autorizada: string
          empresa: string
          fecha_fin: string
          fecha_inicio: string
          id_memorando: string
          numero_memorando: string
          permite_acompanantes: boolean
          personas_autorizadas: number
        }[]
      }
      normalizar_espacios: { Args: { p_texto: string }; Returns: string }
      normalizar_placa: { Args: { p_placa: string }; Returns: string }
      normalizar_telefono_ec: { Args: { p_telefono: string }; Returns: string }
      normalizar_ubicacion_epn: { Args: { p_texto: string }; Returns: string }
      permisos_efectivos: { Args: never; Returns: string[] }
      persona_asociada_a_vehiculo: {
        Args: { p_id_persona: string; p_id_vehiculo: string }
        Returns: boolean
      }
      persona_del_usuario_actual: { Args: never; Returns: string }
      persona_tiene_rol_privilegiado: {
        Args: { p_id_persona: string }
        Returns: boolean
      }
      prefijo_tecnologia_dispositivo: {
        Args: { p_tipo: string }
        Returns: string
      }
      puntos_control_asignados: { Args: never; Returns: string[] }
      registrar_intento_fuera_de_turno: {
        Args: { p_detalle?: string }
        Returns: undefined
      }
      registrar_intento_login: {
        Args: { p_id_usuario: string; p_valido: boolean }
        Returns: Json
      }
      registrar_sesion: {
        Args: {
          p_dispositivo?: string
          p_ip_origen?: string
          p_recordar_sesion?: boolean
          p_user_agent?: string
        }
        Returns: {
          dispositivo_nombre: string | null
          estado_sesion: string
          fecha_cierre: string | null
          fecha_expiracion: string
          fecha_inicio: string
          fecha_revocacion: string | null
          fecha_ultima_actividad: string | null
          id_sesion: string
          id_sesion_proveedor: string | null
          id_usuario: string
          ip_origen: string | null
          motivo_cierre: string | null
          recordar_sesion: boolean
          revocada_por: string | null
          token_hash: string | null
          user_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sesion"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registrar_vehiculo_de_memorando: {
        Args: {
          p_color?: string
          p_id_memorando: string
          p_id_persona: string
          p_marca?: string
          p_modelo?: string
          p_observacion?: string
          p_placa?: string
          p_tipo_vehiculo: string
        }
        Returns: Json
      }
      regla_aplica_en_punto: {
        Args: { p_id_punto: string; p_id_regla: string }
        Returns: boolean
      }
      resumir_cambio: { Args: { anterior: Json; nuevo: Json }; Returns: string }
      revisar_permanencia_vehiculos: { Args: never; Returns: undefined }
      revocar_mis_sesiones: { Args: { p_motivo?: string }; Returns: number }
      revocar_sesiones_usuario: {
        Args: {
          p_id_usuario: string
          p_motivo?: string
          p_revocada_por?: string
        }
        Returns: number
      }
      ruc_pasa_algoritmo_legado: { Args: { p_ruc: string }; Returns: boolean }
      sesion_vigente: { Args: never; Returns: boolean }
      siguiente_codigo_dispositivo: {
        Args: { p_tipo: string }
        Returns: string
      }
      sincronizar_correo_auth: {
        Args: { p_correo: string; p_id_usuario: string }
        Returns: undefined
      }
      sincronizar_estado_memorandos: { Args: never; Returns: number }
      tiene_acceso_operativo_cac: { Args: never; Returns: boolean }
      tiene_algun_modulo: { Args: never; Returns: boolean }
      tiene_permiso: { Args: { p_codigo: string }; Returns: boolean }
      tocar_sesion: { Args: { p_id_sesion?: string }; Returns: boolean }
      tramos_turno: {
        Args: { p_fin: string; p_inicio: string }
        Returns: {
          desde: number
          hasta: number
        }[]
      }
      uuid_seguro: { Args: { texto: string }; Returns: string }
      valor_parametro_coherente: {
        Args: { p_tipo_dato: string; p_valor: string }
        Returns: boolean
      }
      vehiculo_amparado_por_memorando: {
        Args: { p_id_persona: string; p_id_vehiculo: string }
        Returns: boolean
      }
      verificar_turno_guardia_actual: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
