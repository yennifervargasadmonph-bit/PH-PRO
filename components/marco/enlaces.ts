import type { EnlaceMenu } from './marco-cliente'

/** Enlaces generales del menú (fuera de una copropiedad). */
export function enlacesGenerales(admin: boolean): EnlaceMenu[] {
  return [
    { href: '/central', texto: 'Central', icono: 'central', exacto: true },
    ...(admin ? [{ href: '/central/equipo', texto: 'Equipo', icono: 'equipo' } as const] : []),
    { href: '/seguridad', texto: 'Seguridad', icono: 'seguridad' },
  ]
}
