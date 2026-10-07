/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import { esAdministrador, misOrganizaciones, usuarioActual } from '@/lib/datos'

export default async function LayoutPrivado({ children }: { children: React.ReactNode }) {
  const { usuario } = await usuarioActual()
  const admin = (await misOrganizaciones()).some(esAdministrador)
  return (
    <div className="app">
      <aside className="lateral">
        <Link className="marca" href="/central">
          <span className="marca-icono"><img src="/icono-ph-pro.png" width={30} height={30} alt="" /></span>
          <span><b>PH PRO</b><small>Propiedad horizontal</small></span>
        </Link>
        <nav className="menu" aria-label="Principal">
          <Link href="/central">Central</Link>
          {admin && <Link href="/central/equipo">Equipo</Link>}
          <Link href="/seguridad">Seguridad</Link>
        </nav>
        <div className="usuario">
          <span title={usuario.email}>{usuario.email}</span>
          <form action="/salir" method="post"><button>Salir</button></form>
        </div>
      </aside>
      <main className="contenido">{children}</main>
    </div>
  )
}
