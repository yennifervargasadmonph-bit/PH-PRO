import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { Cabecera } from '@/components/ui/cabecera'
import { Fila, FilaAgregar, Filas } from '@/components/ui/filas'
import { PanelLateral } from '@/components/ui/panel-lateral'
import { Vacio } from '@/components/ui/vacio'
import { fechaCorta, type Politica } from '@/lib/personas'
import { FormularioPolitica } from '../formularios'

export function VistaPolitica({ copro, politicas, aprobar, seleccion, nueva }: { copro: string; politicas: Politica[]; aprobar: boolean; seleccion?: string; nueva: boolean }) {
  const ruta = `/c/${copro}/personas/politica`
  const vigente = politicas[0]
  const elegida = seleccion ? politicas.find((p) => p.id === seleccion) : undefined
  return (
    <>
      <Cabecera
        titulo="Política de datos"
        meta={vigente ? `Ley 1581 de 2012 · versión vigente ${vigente.version}` : 'Ley 1581 de 2012 · sin versión publicada'}
        accion={aprobar ? <Link className="boton" href={`${ruta}?nueva=1`} scroll={false}>Publicar versión</Link> : undefined}
        mas={[{ href: `/c/${copro}/personas`, texto: 'Volver a personas' }]}
      />
      {politicas.length === 0 ? (
        <Vacio icono={ScrollText} texto="Todavía no hay una política de tratamiento publicada.">
          {aprobar && <FilaAgregar href={`${ruta}?nueva=1`} texto="Publicar la primera versión" />}
        </Vacio>
      ) : (
        <Filas etiqueta="Versiones de la política">
          {politicas.map((p, i) => (
            <Fila
              key={p.id}
              titulo={`Versión ${p.version}`}
              meta={`${i === 0 ? 'Vigente · ' : ''}Rige desde ${fechaCorta(p.vigente_desde)} · conservar ${p.meses_conservacion} meses`}
              href={`${ruta}?v=${p.id}`}
              actual={p.id === seleccion}
            />
          ))}
        </Filas>
      )}
      {elegida && (
        <PanelLateral titulo={`Versión ${elegida.version}`} meta={`Rige desde ${fechaCorta(elegida.vigente_desde)} · conservar ${elegida.meses_conservacion} meses`} cerrar={ruta}>
          <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{elegida.texto}</div>
        </PanelLateral>
      )}
      {nueva && aprobar && (
        <PanelLateral titulo="Publicar versión" meta="Una versión publicada no se edita: los cambios van en una versión nueva." cerrar={ruta}>
          <FormularioPolitica copro={copro} />
        </PanelLateral>
      )}
    </>
  )
}
