// Vista previa del diseño con datos de EJEMPLO. Solo existe en desarrollo (pageExtensions en
// next.config.ts y excepción en proxy.ts); en producción esta ruta no se compila.
import { notFound } from 'next/navigation'
import { Marco, type EnlaceMenu } from '@/components/marco/marco'
import { vinculoVigente } from '@/lib/personas'
import { VistaResumen } from '@/app/(privado)/c/[id]/vista'
import { VistaUnidades } from '@/app/(privado)/c/[id]/unidades/vista'
import { VistaExpediente } from '@/app/(privado)/c/[id]/unidades/[unidad]/vista'
import { VistaPersonas } from '@/app/(privado)/c/[id]/personas/vista'
import { VistaPolitica } from '@/app/(privado)/c/[id]/personas/politica/vista'
import { VistaPorteria, type Residente } from '@/app/(privado)/c/[id]/porteria/vista'
import { VistaCentral } from '@/app/(privado)/(general)/central/vista'
import { COPRO, COPROPIEDAD, DATOS_PERSONAS, HISTORIAL_101, ORG, PERSONA_ANA, POLITICAS, UNIDADES } from './ejemplo'

const TODO = { verDatos: true, crear: true, editar: true, inactivar: true, aprobar: true, verUnidades: true }

export default async function VistaPrevia({ params, searchParams }: { params: Promise<{ pantalla: string }>; searchParams: Promise<Record<string, string>> }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { pantalla } = await params
  const sp = await searchParams
  const d = DATOS_PERSONAS
  const enlaces: EnlaceMenu[] = [
    { href: '/vista-previa/resumen', texto: 'Resumen', icono: 'resumen' },
    { href: '/vista-previa/unidades', texto: 'Unidades', icono: 'unidades' },
    { href: '/vista-previa/personas', texto: 'Personas', icono: 'personas' },
    { href: '/vista-previa/porteria', texto: 'Portería', icono: 'porteria' },
    { href: '/vista-previa/importar', texto: 'Importar', icono: 'importar' },
    { href: '/vista-previa/identidad', texto: 'Identidad', icono: 'identidad' },
  ]
  const general: EnlaceMenu[] = [
    { href: '/vista-previa/central', texto: 'Central', icono: 'central' },
    { href: '/vista-previa/equipo', texto: 'Equipo', icono: 'equipo' },
    { href: '/vista-previa/seguridad', texto: 'Seguridad', icono: 'seguridad' },
  ]

  let contenido: React.ReactNode
  switch (pantalla) {
    case 'resumen':
      contenido = (
        <VistaResumen
          c={COPROPIEDAD}
          nombreLegal="Edificio Ejemplo 23 Propiedad Horizontal"
          faltanIdentidad={['logo']}
          editarIdentidad
          unidades={{ activas: UNIDADES.length, suma: 100 }}
          personas={{ activas: 9, sinAutorizacion: 4, sinTitular: 2, politica: true }}
        />
      )
      break
    case 'unidades': {
      const titulares = new Map(d.vinculos.filter((v) => v.es_titular && vinculoVigente(v)).map((v) => [v.unidad_id, d.personas.find((p) => p.id === v.persona_id)!.nombre]))
      contenido = <VistaUnidades copro={COPRO} unidades={UNIDADES} titulares={titulares} permisos={{ crear: true, editar: true, inactivar: true, importar: true, detalle: true, expediente: true }} q="" inactivas={false} editar={sp.editar} nueva={sp.nueva === '1'} />
      break
    }
    case 'personas':
      contenido = <VistaPersonas copro={COPRO} d={d} permisos={TODO} q={sp.q ?? ''} filtro={sp.f === 'sin' ? 'sin' : 'todas'} seleccion={sp.p} editando={false} nueva={sp.nueva === '1'} />
      break
    case 'persona':
      contenido = <VistaPersonas copro={COPRO} d={d} permisos={TODO} q="" filtro="todas" seleccion={PERSONA_ANA} editando={false} nueva={false} />
      break
    case 'expediente':
      contenido = <VistaExpediente copro={COPRO} unidad={UNIDADES[0]} d={d} historial={HISTORIAL_101} permisos={TODO} editarUnidad seleccion={sp.p} editando={false} vinculando={sp.vincular === '1'} />
      break
    case 'politica':
      contenido = <VistaPolitica copro={COPRO} politicas={POLITICAS} aprobar seleccion={sp.v} nueva={sp.nueva === '1'} />
      break
    case 'porteria': {
      const residentes: Residente[] = d.vinculos
        .filter((v) => vinculoVigente(v) && (v.reside || v.tipo === 'autorizado'))
        .map((v) => {
          const un = UNIDADES.find((x) => x.id === v.unidad_id)!
          return { unidad_id: un.id, torre: un.torre, numero: un.numero, nombre: d.personas.find((p) => p.id === v.persona_id)!.nombre, vinculo: v.tipo }
        })
        .sort((x, y) => x.torre.localeCompare(y.torre) || x.numero.localeCompare(y.numero))
      contenido = <VistaPorteria copro={COPRO} residentes={residentes} q={sp.q ?? ''} />
      break
    }
    case 'central':
      contenido = (
        <VistaCentral
          org={ORG}
          admin
          copropiedades={[COPROPIEDAD, { ...COPROPIEDAD, id: '00000000-0000-4000-8000-000000000002', nombre: 'Conjunto Ejemplo Norte', tipo: 'conjunto', prefijo: 'CEN', ciudad: 'Chía' }]}
          actividad={[
            { id: 3, accion: 'insert', entidad: 'autorizaciones_datos', datos: {}, creado_en: '2026-11-26T15:10:00Z' },
            { id: 2, accion: 'insert', entidad: 'vinculos_unidad', datos: {}, creado_en: '2026-11-26T14:55:00Z' },
            { id: 1, accion: 'insert', entidad: 'personas', datos: { nombre: '[dato personal]' }, creado_en: '2026-11-26T14:54:00Z' },
          ]}
          nueva={sp.nueva === '1'}
        />
      )
      break
    default:
      notFound()
  }

  const enCopropiedad = pantalla !== 'central'
  return (
    <Marco correo="administradora@ejemplo.co" general={general} copropiedad={enCopropiedad ? { nombre: COPROPIEDAD.nombre, enlaces } : undefined}>
      <p className="aviso-vista-previa">Vista previa del diseño con datos de ejemplo (solo desarrollo)</p>
      {contenido}
    </Marco>
  )
}
