'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Barra fija inferior para celulares: los accesos principales siempre a un toque.
export function BarraMovil({ admin }: { admin: boolean }) {
  const ruta = usePathname()
  const actual = (href: string) => (href === '/central' ? ruta === '/central' || ruta.startsWith('/c/') : ruta.startsWith(href))
  const enlaces = [
    { href: '/central', texto: 'Inicio', icono: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    ...(admin ? [{ href: '/central/equipo', texto: 'Equipo', icono: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0' }] : []),
    { href: '/seguridad', texto: 'Seguridad', icono: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z' },
  ]
  return (
    <nav className="barra-movil" aria-label="Accesos rápidos">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={actual(e.href) ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={e.icono} /></svg>
          {e.texto}
        </Link>
      ))}
      <form action="/salir" method="post">
        <button>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11" /></svg>
          Salir
        </button>
      </form>
    </nav>
  )
}
