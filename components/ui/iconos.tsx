import {
  Building2,
  DoorOpen,
  FileSpreadsheet,
  House,
  LayoutGrid,
  Palette,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

/** Íconos del menú por nombre (los componentes de cliente reciben el nombre, no la función). */
export const ICONOS = {
  central: LayoutGrid,
  equipo: Users,
  seguridad: ShieldCheck,
  resumen: House,
  unidades: Building2,
  personas: UsersRound,
  porteria: DoorOpen,
  importar: FileSpreadsheet,
  identidad: Palette,
  politica: ScrollText,
} satisfies Record<string, LucideIcon>

export type NombreIcono = keyof typeof ICONOS

export function Icono({ nombre, ...props }: { nombre: NombreIcono } & React.ComponentProps<LucideIcon>) {
  const C = ICONOS[nombre]
  return <C aria-hidden="true" {...props} />
}
