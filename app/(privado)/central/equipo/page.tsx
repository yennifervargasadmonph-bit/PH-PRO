import { notFound } from 'next/navigation'
import { esAdministrador, misOrganizaciones, usuarioActual } from '@/lib/datos'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { quitarAcceso, revocarInvitacion } from './acciones'
import { FormularioAcceso, FormularioInvitacion } from './formularios'

export const metadata = { title: 'Equipo' }

const estaVencida = (iso: string) => new Date(iso).getTime() <= Date.now()

const ROL_ORG = { propietario: 'Propietario', administrador: 'Administrador', miembro: 'Miembro' } as const

export default async function Equipo() {
  const org = (await misOrganizaciones())[0]
  if (!org || !esAdministrador(org)) notFound()
  const { supabase } = await usuarioActual()
  const [{ data: miembros }, { data: copropiedades }, { data: accesos }, { data: invitaciones }] = await Promise.all([
    supabase.from('miembros_organizacion').select('usuario_id, rol, perfiles (nombre, correo)').eq('organizacion_id', org.id),
    supabase.from('copropiedades').select('id, nombre').eq('organizacion_id', org.id).eq('activa', true).order('nombre'),
    supabase.from('accesos_copropiedad').select('usuario_id, copropiedad_id, rol'),
    supabase
      .from('invitaciones')
      .select('id, correo, rol, copropiedad_id, rol_copropiedad, expira_en')
      .eq('organizacion_id', org.id)
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: false }),
  ])
  const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })
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
      {(invitaciones ?? []).length > 0 && (
        <section className="seccion">
          <h2>Invitaciones pendientes</h2>
          <div className="tabla-caja">
            <table className="tabla tarjetas-movil">
              <thead><tr><th>Correo</th><th>Rol</th><th>Vence</th><th></th></tr></thead>
              <tbody>
                {(invitaciones ?? []).map((i) => {
                  const vencida = estaVencida(i.expira_en)
                  return (
                    <tr key={i.id}>
                      <td data-titulo><strong>{i.correo}</strong></td>
                      <td data-label="Rol">
                        {ROL_ORG[i.rol as keyof typeof ROL_ORG]}
                        {i.copropiedad_id && (
                          <> · {nombreCopro.get(i.copropiedad_id) ?? 'Copropiedad'} ({ROLES_COPROPIEDAD[i.rol_copropiedad as keyof typeof ROLES_COPROPIEDAD] ?? i.rol_copropiedad})</>
                        )}
                      </td>
                      <td data-label="Vence">{vencida ? <span className="etiqueta gris">Vencida</span> : fecha.format(new Date(i.expira_en))}</td>
                      <td>
                        <form action={revocarInvitacion.bind(null, i.id)}>
                          <button className="boton secundario pequeno">Revocar</button>
                        </form>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="rejilla seccion" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
        <section className="panel">
          <h2>Invitar persona</h2>
          <FormularioInvitacion organizacionId={org.id} copropiedades={copropiedades ?? []} />
        </section>
        <section className="panel">
          <h2>Asignar acceso a una copropiedad</h2>
          <FormularioAcceso personas={personas.filter((p) => p.rol === 'miembro')} copropiedades={copropiedades ?? []} />
        </section>
      </div>
    </>
  )
}
