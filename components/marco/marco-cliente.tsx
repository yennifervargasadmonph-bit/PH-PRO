'use client'
/* eslint-disable @next/next/no-img-element */
import { Ellipsis, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Icono, type NombreIcono } from '@/components/ui/iconos'

export type EnlaceMenu = { href: string; texto: string; icono: NombreIcono; exacto?: boolean }

const COOKIE = 'phpro_menu_plegado'

function esActual(ruta: string, e: EnlaceMenu) {
  return e.exacto ? ruta === e.href : ruta === e.href || ruta.startsWith(`${e.href}/`)
}

export function MarcoCliente({
  correo,
  general,
  copropiedad,
  plegadoInicial,
  children,
}: {
  correo: string
  general: EnlaceMenu[]
  copropiedad?: { nombre: string; enlaces: EnlaceMenu[] }
  plegadoInicial: boolean
  children: React.ReactNode
}) {
  const ruta = usePathname()
  const [plegado, setPlegado] = useState(plegadoInicial)
  const alternar = () => {
    const nuevo = !plegado
    setPlegado(nuevo)
    // Preferencia visual sin datos personales; un año.
    document.cookie = `${COOKIE}=${nuevo ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
  }

  const enlace = (e: EnlaceMenu) => (
    <Link key={e.href} className="lateral-enlace" href={e.href} aria-current={esActual(ruta, e) ? 'page' : undefined} title={plegado ? e.texto : undefined}>
      <Icono nombre={e.icono} />
      <span className="texto">{e.texto}</span>
    </Link>
  )

  // Celular: tres accesos fijos y el resto en «Más».
  const todos = [...(copropiedad?.enlaces ?? []), ...general]
  const fijos = todos.slice(0, 3)
  const resto = todos.slice(3)

  return (
    <div className="marco" data-plegado={plegado ? '1' : '0'}>
      <aside className="lateral" aria-label="Menú principal">
        <Link className="lateral-marca" href="/central" title="PH PRO Central">
          <span className="icono-ph"><img src="/icono-ph-pro.png" alt="" width={30} height={30} /></span>
          <span className="texto"><b>PH PRO</b><small>Propiedad horizontal</small></span>
        </Link>
        {copropiedad && (
          <div className="lateral-contexto" role="status">
            <span>Trabajando actualmente en:</span>
            <strong>{copropiedad.nombre}</strong>
            <Link href="/central">Cambiar</Link>
          </div>
        )}
        {copropiedad && (
          <nav className="lateral-grupo" aria-label="Copropiedad">
            {copropiedad.enlaces.map(enlace)}
          </nav>
        )}
        <nav className="lateral-grupo" aria-label="General">
          {copropiedad && <p>General</p>}
          {general.map(enlace)}
        </nav>
        <div className="lateral-pie">
          <span className="correo" title={correo}>{correo}</span>
          <button type="button" className="lateral-enlace" onClick={alternar} aria-expanded={!plegado} title={plegado ? 'Expandir menú' : undefined}>
            {plegado ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            <span className="texto">{plegado ? 'Expandir menú' : 'Plegar menú'}</span>
            {plegado && <span className="sr">Expandir menú</span>}
          </button>
          <form action="/salir" method="post">
            <button className="lateral-enlace" title={plegado ? 'Salir' : undefined}>
              <LogOut aria-hidden="true" />
              <span className="texto">Salir</span>
              {plegado && <span className="sr">Salir</span>}
            </button>
          </form>
        </div>
      </aside>

      <div className="centro">
        <header className="encabezado-movil">
          <span className="icono-ph"><img src="/icono-ph-pro.png" alt="PH PRO" width={26} height={26} /></span>
          <span className="nombre">
            {copropiedad ? (
              <><span className="sr">Trabajando actualmente en: </span>{copropiedad.nombre.toUpperCase()}</>
            ) : (
              'PH PRO'
            )}
          </span>
          {copropiedad && <Link className="cambiar" href="/central">Cambiar</Link>}
        </header>
        <main className="contenido" id="contenido">{children}</main>
      </div>

      <nav className="barra-movil" aria-label="Accesos rápidos">
        {fijos.map((e) => (
          <Link key={e.href} href={e.href} aria-current={esActual(ruta, e) ? 'page' : undefined}>
            <Icono nombre={e.icono} />
            {e.texto}
          </Link>
        ))}
        <details key={ruta}>
          <summary>
            <Ellipsis aria-hidden="true" />
            Más
          </summary>
          <div className="hoja-mas">
            {resto.map((e) => (
              <Link key={e.href} href={e.href} aria-current={esActual(ruta, e) ? 'page' : undefined}>
                <Icono nombre={e.icono} width={20} height={20} />
                {e.texto}
              </Link>
            ))}
            <form action="/salir" method="post">
              <button>
                <LogOut aria-hidden="true" width={20} height={20} />
                Salir
              </button>
            </form>
          </div>
        </details>
      </nav>
    </div>
  )
}
