import { usuarioActual } from '@/lib/datos'

// Todo lo privado exige sesión. El marco (menú lateral y barra del celular) lo pone
// cada sección: (general) o la copropiedad (c/[id]).
export default async function LayoutPrivado({ children }: { children: React.ReactNode }) {
  await usuarioActual()
  return children
}
