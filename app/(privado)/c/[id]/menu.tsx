'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function MenuCopropiedad({ enlaces }: { enlaces: { href: string; texto: string }[] }) {
  const ruta = usePathname()
  return (
    <nav className="pestanas" aria-label="Secciones de la copropiedad">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={ruta === e.href ? 'page' : undefined}>{e.texto}</Link>
      ))}
    </nav>
  )
}
