import { notFound } from 'next/navigation'
import { esAdministrador, misOrganizaciones, usuarioActual } from '@/lib/datos'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { quitarAcceso } from './acciones'
import { FormularioAcceso, FormularioMiembro } from './formularios'

export const metadata = { title: 'Equipo' }

const ROL_ORG = { propietario: 'Propietario', administrador: 'Administrador', miembro: 'Miembro' } as const

export default async function Equipo() {
  const org = (await misOrganizaciones())[0]
  if (!org || !esAdministrador(org)) notFound()
  const { supabase } = await usuarioActual()
  const [{ data: miembros }, { data: copropiedades }, { data: accesos }] = await Promise.all([
    supabase.from('miembros_organizacion').select('usuario_id, rol, perfiles (nombre, correo)').eq('organizacion_id', org.id),
    supabase.from('copropiedades').select('id, nombre').eq('organizacion_id', org.id).eq('activa', true).order('nombre'),
    supabase.from('accesos_copropiedad').select('usuario_id, copropiedad_id, rol'),
  ])
  const personas = (miembros ?? []).map((m) => {
    const p = m.perfiles as unknown as { nombre: string; correo: string } | null
    return { id: m.usuario_id as string, rol: m.rol as keyof typeof ROL_ORG, correo: p?.correo ?? '', nombre: p?.nombre || p?.correo || 'Sin nombre' }
  })
  const nombreCopro = new Map((copropiedades ?? []).map((c) => [c.id, c.nombre]))

  return (
    <>
      <div className="cabecera"><div><h1>Equipo</h1><p className="tenue">Quién trabaja en {org.nombre} y en qué copropiedades.</p></div></div>
      <div className="tabla-caja">
        <table className="tabla tarjetas-movil">
          <thead><tr><th>Persona</th><th>Rol en la organización</th><th>Accesos por copropiedad</th></tr></thead>
          <tbody>
            {personas.map((p) => {
              const suyos = (accesos ?? []).filter((a) => a.usuario_id === p.id && nombreCopro.has(a.copropiedad_id))
              return (
                <tr key={p.id}>
                  <td data-titulo><strong>{p.nombre}</strong><br /><span className="tenue pequeno">{p.correo}</span></td>
                  <td data-label="Rol">{ROL_ORG[p.rol]}</td>
                  <td data-label="Accesos" style={{ whiteSpace: 'normal' }}>
                    {p.rol !== 'miembro' && <span className="tenue">Todas</span>}
                    {suyos.map((a) => (
                      <form key={a.copropiedad_id} action={quitarAcceso.bind(null, a.copropiedad_id, p.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '2px 8px 2px 0' }}>
                        <span className="etiqueta">{nombreCopro.get(a.copropiedad_id)} · {ROLES_COPROPIEDAD[a.rol as keyof typeof ROLES_COPROPIEDAD] ?? a.rol}</span>
                        <button className="boton secundario pequeno" aria-label="Quitar acceso" title="Quitar acceso">×</button>
                      </form>
                    ))}
                    {p.rol === 'miembro' && suyos.length === 0 && <span className="tenue">Sin accesos</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="rejilla seccion" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        <section className="panel"><h2>Agregar persona</h2><FormularioMiembro organizacionId={org.id} /></section>
        <section className="panel">
          <h2>Asignar acceso a una copropiedad</h2>
          <FormularioAcceso personas={personas.filter((p) => p.rol === 'miembro')} copropiedades={copropiedades ?? []} />
        </section>
      </div>
    </>
  )
}
