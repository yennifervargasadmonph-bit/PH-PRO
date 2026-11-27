import Link from 'next/link'
import { Building } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Fila, FilaAgregar, FilaBoton, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Vacio } from '@/components/ui/vacio'
import type { Copropiedad, Organizacion } from '@/lib/datos'
import { formatearNit } from '@/lib/identidad'
import { TIPOS_COPROPIEDAD } from '@/lib/validacion'
import { entrarCopropiedad } from './acciones'
import { FormularioCopropiedad, FormularioOrganizacion } from './formularios'

export type Actividad = { id: number; accion: string; entidad: string; datos: Record<string, unknown>; creado_en: string }

const ACCIONES: Record<string, string> = { insert: 'creó', update: 'modificó', delete: 'eliminó' }
const ENTIDADES: Record<string, string> = {
  organizaciones: 'la organización',
  copropiedades: 'una copropiedad',
  miembros_organizacion: 'un miembro del equipo',
  accesos_copropiedad: 'un acceso a copropiedad',
  marcas_copropiedad: 'la identidad de una copropiedad',
  invitaciones: 'una invitación',
  unidades: 'una unidad',
  importaciones: 'una importación de unidades',
  personas: 'una persona',
  personas_datos: 'los datos de una persona',
  vinculos_unidad: 'un vínculo con una unidad',
  politicas_tratamiento: 'una versión de la política de datos',
  autorizaciones_datos: 'una autorización de datos',
}

export function VistaSinOrganizacion() {
  return (
    <>
      <Cabecera titulo="Bienvenida a PH PRO" meta="Empieza creando la organización que administra tus copropiedades." />
      <section className="panel" style={{ maxWidth: 640 }}><FormularioOrganizacion /></section>
    </>
  )
}

export function VistaCentral({ org, admin, copropiedades, actividad, nueva }: { org: Organizacion; admin: boolean; copropiedades: Copropiedad[]; actividad: Actividad[]; nueva: boolean }) {
  const fecha = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })
  return (
    <>
      <Cabecera
        titulo={org.nombre}
        meta={`PH PRO Central${org.nit ? ` · NIT ${formatearNit(org.nit)}` : ''} · ${copropiedades.length} ${copropiedades.length === 1 ? 'copropiedad' : 'copropiedades'}`}
        accion={admin ? <Link className="boton" href="/central?nueva=1" scroll={false}>Nueva copropiedad</Link> : undefined}
        mas={admin ? [{ href: '/central/equipo', texto: 'Equipo' }] : []}
      />

      <div className="dos-columnas">
        <section>
          <div className="seccion-cabeza"><h2>Copropiedades</h2></div>
          {copropiedades.length === 0 ? (
            <Vacio icono={Building} texto={admin ? 'Todavía no hay copropiedades.' : 'La administradora te dará acceso a una copropiedad.'}>
              {admin && <FilaAgregar href="/central?nueva=1" texto="Nueva copropiedad" />}
            </Vacio>
          ) : (
            <>
              <ul className="filas" aria-label="Copropiedades">
                {copropiedades.map((c) => (
                  <li key={c.id}>
                    <form action={entrarCopropiedad.bind(null, c.id)}>
                      <FilaBoton
                        titulo={c.nombre}
                        meta={[TIPOS_COPROPIEDAD[c.tipo as keyof typeof TIPOS_COPROPIEDAD] ?? c.tipo, c.ciudad, c.prefijo, c.activa ? null : 'Inactiva'].filter(Boolean).join(' · ')}
                      />
                    </form>
                  </li>
                ))}
              </ul>
              {admin && <FilaAgregar href="/central?nueva=1" texto="Nueva copropiedad" />}
            </>
          )}
        </section>

        {admin && actividad.length > 0 && (
          <section>
            <div className="seccion-cabeza"><h2>Actividad reciente</h2></div>
            <Filas etiqueta="Actividad reciente">
              {actividad.map((a) => (
                <Fila
                  key={a.id}
                  titulo={`Se ${ACCIONES[a.accion] ?? a.accion} ${ENTIDADES[a.entidad] ?? a.entidad}${typeof a.datos?.nombre === 'string' && a.datos.nombre !== '[dato personal]' ? `: ${a.datos.nombre}` : ''}`}
                  meta={fecha(a.creado_en)}
                />
              ))}
            </Filas>
          </section>
        )}
      </div>

      {nueva && admin && (
        <PanelLateral titulo="Nueva copropiedad" meta="Con su identidad: nombre completo, NIT y celular." cerrar="/central">
          <FormularioCopropiedad organizacionId={org.id} />
        </PanelLateral>
      )}
    </>
  )
}
