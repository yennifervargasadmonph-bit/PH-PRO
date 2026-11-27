import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Cabecera } from '@/components/ui/cabecera'
import { Fila, FilaAgregar, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { esAdministrador, misOrganizaciones, usuarioActual } from '@/lib/datos'
import { ROLES_COPROPIEDAD } from '@/lib/roles'
import { quitarAcceso, revocarInvitacion } from './acciones'
import { FormularioAcceso, FormularioInvitacion } from './formularios'

export const metadata = { title: 'Equipo' }

const estaVencida = (iso: string) => new Date(iso).getTime() <= Date.now()

const ROL_ORG = { propietario: 'Propietario', administrador: 'Administrador', miembro: 'Miembro' } as const
const RUTA = '/central/equipo'

export default async function Equipo({ searchParams }: { searchParams: Promise<{ invitar?: string; acceso?: string; u?: string; i?: string }> }) {
  const { invitar, acceso, u, i } = await searchParams
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
  const nombreCopro = new Map((copropiedades ?? []).map((c) => [c.id, c.nombre]))
  const rolCopro = (r: string) => ROLES_COPROPIEDAD[r as keyof typeof ROLES_COPROPIEDAD] ?? r
  const personas = (miembros ?? []).map((m) => {
    const p = m.perfiles as unknown as { nombre: string; correo: string } | null
    const suyos = (accesos ?? []).filter((a) => a.usuario_id === m.usuario_id && nombreCopro.has(a.copropiedad_id))
    return { id: m.usuario_id as string, rol: m.rol as keyof typeof ROL_ORG, correo: p?.correo ?? '', nombre: p?.nombre || p?.correo || 'Sin nombre', accesos: suyos }
  })
  const elegida = u ? personas.find((p) => p.id === u) : undefined
  const invitacion = i ? (invitaciones ?? []).find((x) => x.id === i) : undefined

  return (
    <>
      <Cabecera
        titulo="Equipo"
        meta={`${org.nombre} · ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'}`}
        accion={<Link className="boton" href={`${RUTA}?invitar=1`} scroll={false}>Invitar persona</Link>}
        mas={[{ href: `${RUTA}?acceso=1`, texto: 'Asignar acceso a una copropiedad' }]}
      />

      <Filas etiqueta="Personas del equipo">
        {personas.map((p) => (
          <Fila
            key={p.id}
            titulo={p.nombre}
            meta={`${ROL_ORG[p.rol]} · ${p.rol !== 'miembro' ? 'Todas las copropiedades' : p.accesos.length ? p.accesos.map((a) => `${nombreCopro.get(a.copropiedad_id)} (${rolCopro(a.rol)})`).join(', ') : 'Sin accesos'}`}
            punto={p.rol === 'miembro' && p.accesos.length === 0 ? 'ambar' : null}
            href={`${RUTA}?u=${p.id}`}
            actual={p.id === u}
          />
        ))}
      </Filas>
      <FilaAgregar href={`${RUTA}?invitar=1`} texto="Invitar persona" />

      {(invitaciones ?? []).length > 0 && (
        <section className="seccion">
          <div className="seccion-cabeza"><h2>Invitaciones pendientes</h2><span className="meta">{invitaciones!.length}</span></div>
          <Filas etiqueta="Invitaciones pendientes">
            {invitaciones!.map((x) => {
              const vencida = estaVencida(x.expira_en)
              return (
                <Fila
                  key={x.id}
                  titulo={x.correo}
                  meta={`${ROL_ORG[x.rol as keyof typeof ROL_ORG]}${x.copropiedad_id ? ` · ${nombreCopro.get(x.copropiedad_id) ?? 'Copropiedad'} (${rolCopro(x.rol_copropiedad ?? '')})` : ''} · ${vencida ? 'Vencida' : `Vence ${fecha.format(new Date(x.expira_en))}`}`}
                  punto={vencida ? 'ambar' : null}
                  href={`${RUTA}?i=${x.id}`}
                  actual={x.id === i}
                />
              )
            })}
          </Filas>
        </section>
      )}

      {invitar === '1' && (
        <PanelLateral titulo="Invitar persona" meta="Recibe un enlace de un solo uso que vence en 7 días." cerrar={RUTA}>
          <FormularioInvitacion organizacionId={org.id} copropiedades={copropiedades ?? []} />
        </PanelLateral>
      )}
      {acceso === '1' && (
        <PanelLateral titulo="Asignar acceso" meta="Da a un miembro un rol en una copropiedad." cerrar={RUTA}>
          <FormularioAcceso personas={personas.filter((p) => p.rol === 'miembro')} copropiedades={copropiedades ?? []} />
        </PanelLateral>
      )}
      {elegida && (
        <PanelLateral titulo={elegida.nombre} meta={`${ROL_ORG[elegida.rol]} · ${elegida.correo}`} cerrar={RUTA}>
          <section className="bloque">
            <h3>Accesos por copropiedad</h3>
            {elegida.rol !== 'miembro' ? (
              <p className="meta" style={{ margin: 0 }}>La administración de la organización entra a todas las copropiedades.</p>
            ) : elegida.accesos.length === 0 ? (
              <p className="meta" style={{ margin: 0 }}>Sin accesos.</p>
            ) : (
              <ul className="filas">
                {elegida.accesos.map((a) => (
                  <li key={a.copropiedad_id} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 12 }}>
                    <div className="fila-c" style={{ flex: 1 }}>
                      <span className="fila-cuerpo"><span className="fila-titulo">{nombreCopro.get(a.copropiedad_id)}</span><span className="fila-meta">{rolCopro(a.rol)}</span></span>
                    </div>
                    <form action={quitarAcceso.bind(null, a.copropiedad_id, elegida.id)}>
                      <button className="boton fantasma pequeno peligro">Quitar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {elegida.rol === 'miembro' && <Link className="boton secundario" href={`${RUTA}?acceso=1`} scroll={false}>Asignar acceso</Link>}
        </PanelLateral>
      )}
      {invitacion && (
        <PanelLateral titulo={invitacion.correo} meta={estaVencida(invitacion.expira_en) ? 'Invitación vencida' : `Vence ${fecha.format(new Date(invitacion.expira_en))}`} cerrar={RUTA}>
          <p style={{ margin: 0 }}>
            {ROL_ORG[invitacion.rol as keyof typeof ROL_ORG]}
            {invitacion.copropiedad_id && <> · {nombreCopro.get(invitacion.copropiedad_id) ?? 'Copropiedad'} ({rolCopro(invitacion.rol_copropiedad ?? '')})</>}
          </p>
          <form action={revocarInvitacion.bind(null, invitacion.id)}>
            <button className="boton secundario peligro">Revocar invitación</button>
          </form>
        </PanelLateral>
      )}
    </>
  )
}
