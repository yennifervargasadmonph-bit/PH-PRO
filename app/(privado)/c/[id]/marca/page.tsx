import { notFound } from 'next/navigation'
import { leerCopropiedad, misPermisos, puede, usuarioActual } from '@/lib/datos'
import { FormularioMarca, type Marca } from './formulario'

export const metadata = { title: 'Marca' }

export default async function PaginaMarca({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [c, permisos] = await Promise.all([leerCopropiedad(id), misPermisos(id)])
  if (!c || !puede(permisos, 'perfil', 'V')) notFound()
  const { supabase } = await usuarioActual()
  const { data } = await supabase
    .from('marcas_copropiedad')
    .select('color_primario, color_secundario, representante_legal, correo, telefono, eslogan')
    .eq('copropiedad_id', id)
    .maybeSingle<Marca>()
  if (!data) notFound()

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Datos de marca</h1>
          <p className="tenue">Colores y datos que usarán los comunicados, informes y piezas de esta copropiedad. El logo de la copropiedad se podrá cargar con los documentos (sprint 4).</p>
        </div>
      </div>
      <FormularioMarca copropiedadId={id} nombre={c.nombre} marca={data} editable={puede(permisos, 'perfil', 'E')} />
    </>
  )
}
