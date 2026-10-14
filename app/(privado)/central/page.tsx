import { esAdministrador, misOrganizaciones, usuarioActual, type Copropiedad } from '@/lib/datos'
import { formatearNit } from '@/lib/identidad'
import { TIPOS_COPROPIEDAD } from '@/lib/validacion'
import { entrarCopropiedad } from './acciones'
import { FormularioCopropiedad, FormularioOrganizacion } from './formularios'

export const metadata = { title: 'Central' }

const ACCIONES: Record<string, string> = { insert: 'creó', update: 'modificó', delete: 'eliminó' }
const ENTIDADES: Record<string, string> = {
  organizaciones: 'la organización',
  copropiedades: 'una copropiedad',
  miembros_organizacion: 'un miembro del equipo',
  accesos_copropiedad: 'un acceso a copropiedad',
  marcas_copropiedad: 'la identidad de una copropiedad',
}

export default async function Central() {
  const { supabase } = await usuarioActual()
  const organizaciones = await misOrganizaciones()

  if (organizaciones.length === 0) {
    return (
      <>
        <div className="cabecera"><div><h1>Bienvenida a PH PRO</h1><p className="tenue">Empieza creando la organización que administra tus copropiedades.</p></div></div>
        <section className="panel"><FormularioOrganizacion /></section>
      </>
    )
  }

  const org = organizaciones[0]
  const admin = esAdministrador(org)
  const [{ data: copropiedades }, { data: actividad }] = await Promise.all([
    supabase.from('copropiedades').select('*').eq('organizacion_id', org.id).order('nombre'),
    admin
      ? supabase.from('bitacora').select('id, accion, entidad, datos, creado_en').eq('organizacion_id', org.id).order('creado_en', { ascending: false }).limit(8)
      : Promise.resolve({ data: [] as { id: number; accion: string; entidad: string; datos: Record<string, unknown>; creado_en: string }[] }),
  ])
  const lista = (copropiedades ?? []) as Copropiedad[]

  return (
    <>
      <div className="cabecera">
        <div>
          <p className="tenue pequeno" style={{ margin: 0 }}>PH PRO CENTRAL{org.nit ? ` · NIT ${org.nit}` : ''}</p>
          <h1>{org.nombre}</h1>
        </div>
        <span className="etiqueta">{lista.length} {lista.length === 1 ? 'copropiedad' : 'copropiedades'}</span>
      </div>

      {lista.length === 0 ? (
        <p className="panel tenue">Todavía no hay copropiedades. {admin ? 'Crea la primera abajo.' : 'La administradora te dará acceso.'}</p>
      ) : (
        <div className="rejilla">
          {lista.map((c) => (
            <article className="tarjeta" key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <h3>{c.nombre}</h3>
                <span className={c.activa ? 'etiqueta' : 'etiqueta gris'}>{c.activa ? c.prefijo : 'Inactiva'}</span>
              </div>
              <dl className="datos">
                <dt>Tipo</dt><dd>{TIPOS_COPROPIEDAD[c.tipo as keyof typeof TIPOS_COPROPIEDAD] ?? c.tipo}</dd>
                <dt>Ciudad</dt><dd>{c.ciudad || '—'}</dd>
                <dt>NIT</dt><dd>{c.nit ? formatearNit(c.nit) : '—'}</dd>
              </dl>
              <form action={entrarCopropiedad.bind(null, c.id)}>
                <button className="boton secundario" style={{ width: '100%' }}>Entrar</button>
              </form>
            </article>
          ))}
        </div>
      )}

      {admin && (
        <details className="panel seccion" open={lista.length === 0}>
          <summary>Nueva copropiedad</summary>
          <FormularioCopropiedad organizacionId={org.id} />
        </details>
      )}

      {admin && (actividad?.length ?? 0) > 0 && (
        <section className="panel seccion">
          <h2>Actividad reciente</h2>
          <ul className="lista">
            {actividad!.map((a) => (
              <li key={a.id}>
                <span>Se {ACCIONES[a.accion] ?? a.accion} {ENTIDADES[a.entidad] ?? a.entidad}{typeof a.datos?.nombre === 'string' ? `: ${a.datos.nombre}` : ''}</span>
                <span className="tenue">{new Date(a.creado_en).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
