import { DATO_FALTANTE } from '@/lib/identidad'

/** «Dato faltante» en pantalla: nunca se inventa un dato. */
export function Faltante() {
  return <span className="faltante">{DATO_FALTANTE}</span>
}

/** El valor, o «Dato faltante» si no existe. */
export function Valor({ v }: { v: React.ReactNode }) {
  return v === null || v === undefined || v === '' ? <Faltante /> : <>{v}</>
}
