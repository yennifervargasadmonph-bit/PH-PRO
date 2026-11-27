import { DoorOpen } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Fila, Filas } from '@/components/ui/filas'
import { Vacio } from '@/components/ui/vacio'
import { TIPOS_VINCULO, type TipoVinculo } from '@/lib/personas'
import { nombreUnidad } from '@/lib/unidades'

/** Lo único que entrega la base a portería: unidad, nombre y tipo de vínculo. */
export type Residente = { unidad_id: string; torre: string; numero: string; nombre: string; vinculo: TipoVinculo }

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function VistaPorteria({ copro, residentes, q }: { copro: string; residentes: Residente[]; q: string }) {
  const porUnidad = new Map<string, { nombre: string; personas: Residente[] }>()
  for (const r of residentes) {
    const u = porUnidad.get(r.unidad_id) ?? { nombre: nombreUnidad(r), personas: [] }
    u.personas.push(r)
    porUnidad.set(r.unidad_id, u)
  }
  const buscada = normalizar(q.trim())
  const unidades = [...porUnidad.entries()].filter(
    ([, u]) => !buscada || normalizar(`${u.nombre} ${u.personas.map((p) => p.nombre).join(' ')}`).includes(buscada),
  )

  return (
    <>
      <Cabecera titulo="Portería" meta={`Residentes y autorizados vigentes · ${porUnidad.size} unidades`} />
      <form className="busqueda" role="search" action={`/c/${copro}/porteria`}>
        <input name="q" defaultValue={q} placeholder="Unidad o nombre" aria-label="Buscar por unidad o nombre" />
        <button className="boton secundario">Buscar</button>
      </form>
      {unidades.length === 0 ? (
        <Vacio icono={DoorOpen} texto={residentes.length ? 'Ninguna unidad coincide.' : 'Todavía no hay residentes ni autorizados registrados.'} />
      ) : (
        <Filas etiqueta="Residentes por unidad">
          {unidades.map(([id, u]) => (
            <Fila
              key={id}
              titulo={u.nombre}
              meta={u.personas.map((p) => `${p.nombre} (${TIPOS_VINCULO[p.vinculo].toLowerCase()})`).join(' · ')}
              derecha={u.personas.length}
            />
          ))}
        </Filas>
      )}
      <p className="meta" style={{ marginTop: 12 }}>Solo nombres y unidad. Los datos de contacto los tiene la administración.</p>
    </>
  )
}
