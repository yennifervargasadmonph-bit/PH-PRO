import { cookies } from 'next/headers'
import { MarcoCliente, type EnlaceMenu } from './marco-cliente'

export type { EnlaceMenu }
export const COOKIE_MENU_PLEGADO = 'phpro_menu_plegado'

/**
 * Marco de la aplicación con la identidad «Verde profundo»: menú lateral verde bosque
 * (plegable), centro claro y, en el celular, encabezado de una fila y barra inferior blanca.
 */
export async function Marco(props: {
  correo: string
  general: EnlaceMenu[]
  copropiedad?: { nombre: string; enlaces: EnlaceMenu[] }
  children: React.ReactNode
}) {
  const plegado = (await cookies()).get(COOKIE_MENU_PLEGADO)?.value === '1'
  return <MarcoCliente {...props} plegadoInicial={plegado} />
}
