import { Marco } from '@/components/marco/marco'
import { enlacesGenerales } from '@/components/marco/enlaces'
import { esAdministrador, misOrganizaciones, usuarioActual } from '@/lib/datos'

export default async function LayoutGeneral({ children }: { children: React.ReactNode }) {
  const { usuario } = await usuarioActual()
  const admin = (await misOrganizaciones()).some(esAdministrador)
  return (
    <Marco correo={usuario.email ?? ''} general={enlacesGenerales(admin)}>
      {children}
    </Marco>
  )
}
