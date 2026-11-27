import { esAdministrador, misOrganizaciones, usuarioActual, type Copropiedad } from '@/lib/datos'
import { VistaCentral, VistaSinOrganizacion, type Actividad } from './vista'

export const metadata = { title: 'Central' }

export default async function Central({ searchParams }: { searchParams: Promise<{ nueva?: string }> }) {
  const { nueva } = await searchParams
  const { supabase } = await usuarioActual()
  const organizaciones = await misOrganizaciones()
  if (organizaciones.length === 0) return <VistaSinOrganizacion />

  const org = organizaciones[0]
  const admin = esAdministrador(org)
  const [{ data: copropiedades }, { data: actividad }] = await Promise.all([
    supabase.from('copropiedades').select('*').eq('organizacion_id', org.id).order('nombre'),
    admin
      ? supabase.from('bitacora').select('id, accion, entidad, datos, creado_en').eq('organizacion_id', org.id).order('creado_en', { ascending: false }).limit(8)
      : Promise.resolve({ data: [] as Actividad[] }),
  ])
  return <VistaCentral org={org} admin={admin} copropiedades={(copropiedades ?? []) as Copropiedad[]} actividad={(actividad ?? []) as Actividad[]} nueva={nueva === '1'} />
}
