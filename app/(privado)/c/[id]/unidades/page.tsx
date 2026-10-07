import Link from 'next/link'
import { notFound } from 'next/navigation'
import { misPermisos, puede, usuarioActual } from '@/lib/datos'
import { TIPOS_UNIDAD } from '@/lib/importacion/unidades'
import { nombreUnidad, type Unidad } from '@/lib/unidades'
import { cambiarEstadoUnidad } from './acciones'
import { FormularioUnidad } from './formulario'

export const metadata = { title: 'Unidades' }

const fmt = (v: string | number | null, d = 6) => (v === null ? '—' : Number(v).toLocaleString('es-CO', { maximumFractionDigits: d }))

export default async function Unidades({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; inactivas?: string; editar?: string }> }) {
  const { id } = await params
  const { q = '', inactivas, editar } = await searchParams
  const permisos = await misPermisos(id)
  if (!puede(permisos, 'unidades', 'V')) notFound()
  const { supabase } = await usuarioActual()

  const { data } = await supabase.from('unidades').select('*').eq('copropiedad_id', id).order('torre').order('numero').limit(5000)
  const todas = (data ?? []) as Unidad[]
  const activas = todas.filter((u) => u.activa)
  const suma = activas.reduce((s, u) => s + Number(u.coeficiente), 0)
  const cuadra = Math.abs(suma - 100) < 0.0005
  const busqueda = q.trim().toUpperCase()
  const lista = todas
    .filter((u) => (inactivas ? true : u.activa))
    .filter((u) => !busqueda || `${u.torre} ${u.numero} ${u.matricula_inmobiliaria}`.toUpperCase().includes(busqueda))
    .sort((a, b) => a.torre.localeCompare(b.torre, 'es', { numeric: true }) || a.numero.localeCompare(b.numero, 'es', { numeric: true }))
  const crear = puede(permisos, 'unidades', 'C')
  const editarPermiso = puede(permisos, 'unidades', 'E')
  const enEdicion = editarPermiso && editar ? todas.find((u) => u.id === editar) : undefined
  // Portería solo ve nombre y unidad (matriz de permisos).
  const verDetalle = puede(permisos, 'perfil', 'V')

  return (
    <>
      <div className="cabecera">
        <div><h1>Unidades</h1><p className="tenue">Unidades privadas con su coeficiente de copropiedad.</p></div>
        {puede(permisos, 'importar', 'V') && <Link className="boton secundario" href={`/c/${id}/importar`}>Importar desde Excel</Link>}
      </div>

      <div className="cifras">
        <div className="cifra"><span>Unidades activas</span><strong>{activas.length}</strong></div>
        <div className={`cifra ${activas.length === 0 ? '' : cuadra ? 'bien' : 'alerta'}`}>
          <span>Suma de coeficientes</span>
          <strong>{fmt(suma)} %</strong>
          {activas.length > 0 && <span>{cuadra ? 'Cuadra con el 100 %.' : `Diferencia: ${fmt(100 - suma)} puntos.`}</span>}
        </div>
      </div>

      {enEdicion && (
        <section className="panel" style={{ marginBottom: 18 }}>
          <h2>Editar {nombreUnidad(enEdicion)}</h2>
          <FormularioUnidad copropiedadId={id} unidad={enEdicion} />
          <p style={{ margin: '10px 0 0' }}><Link href={`/c/${id}/unidades`}>Cancelar</Link></p>
        </section>
      )}

      <form className="fila" style={{ marginBottom: 12, alignItems: 'end' }}>
        <label>Buscar<input name="q" defaultValue={q} placeholder="Torre, número o matrícula" /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
          <input type="checkbox" name="inactivas" value="1" defaultChecked={Boolean(inactivas)} style={{ width: 'auto' }} /> Mostrar inactivas
        </label>
        <div><button className="boton secundario">Filtrar</button></div>
      </form>

      {lista.length === 0 ? (
        <p className="panel tenue">{todas.length === 0 ? 'Todavía no hay unidades. Agrégalas abajo o impórtalas desde Excel.' : 'Ninguna unidad coincide con la búsqueda.'}</p>
      ) : (
        <div className="tabla-caja">
          <table className="tabla">
            <thead>
              <tr>
                <th>Unidad</th><th>Tipo</th><th className="num">Coeficiente %</th>
                {verDetalle && <><th className="num">Área m²</th><th>Matrícula</th></>}
                <th>Estado</th>{editarPermiso && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.activa ? '' : 'inactiva'}>
                  <td><strong>{nombreUnidad(u)}</strong></td>
                  <td>{TIPOS_UNIDAD[u.tipo]}</td>
                  <td className="num">{fmt(u.coeficiente)}</td>
                  {verDetalle && <><td className="num">{fmt(u.area_m2, 2)}</td><td>{u.matricula_inmobiliaria || '—'}</td></>}
                  <td><span className={u.activa ? 'etiqueta' : 'etiqueta gris'}>{u.activa ? 'Activa' : 'Inactiva'}</span></td>
                  {editarPermiso && (
                    <td style={{ display: 'flex', gap: 6 }}>
                      <Link className="boton secundario pequeno" href={`/c/${id}/unidades?editar=${u.id}`}>Editar</Link>
                      {puede(permisos, 'unidades', 'I') && (
                        <form action={cambiarEstadoUnidad.bind(null, id, u.id, !u.activa)}>
                          <button className="boton secundario pequeno">{u.activa ? 'Inactivar' : 'Reactivar'}</button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crear && (
        <details className="panel seccion" open={todas.length === 0}>
          <summary>Agregar unidad</summary>
          <FormularioUnidad copropiedadId={id} />
        </details>
      )}
    </>
  )
}
