import { PanelSeguridad } from './panel'

export const metadata = { title: 'Seguridad' }

export default async function Seguridad({ searchParams }: { searchParams: Promise<{ obligatoria?: string }> }) {
  const { obligatoria } = await searchParams
  return <PanelSeguridad obligatoria={obligatoria === '1'} />
}
