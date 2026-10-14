'use client'
import { useActionState } from 'react'
import { TIPOS_UNIDAD } from '@/lib/importacion/unidades'
import type { Unidad } from '@/lib/unidades'
import { guardarUnidad, type Estado } from './acciones'

export function FormularioUnidad({ copropiedadId, unidad }: { copropiedadId: string; unidad?: Unidad }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarUnidad.bind(null, copropiedadId, unidad?.id ?? null), {})
  const decimal = (v: string | null | undefined) => (v ? Number(v).toLocaleString('es-CO', { maximumFractionDigits: 6, useGrouping: false }) : '')
  return (
    <form className="campos" action={accion} key={unidad?.id ?? 'nueva'}>
      <div className="fila">
        <label>Torre o bloque <small>(opcional)</small><input name="torre" defaultValue={unidad?.torre} maxLength={20} /></label>
        <label>Número<input name="numero" defaultValue={unidad?.numero} required maxLength={20} /></label>
        <label>
          Tipo
          <select name="tipo" defaultValue={unidad?.tipo ?? 'apartamento'}>
            {Object.entries(TIPOS_UNIDAD).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="fila">
        <label>Coeficiente (%)<input name="coeficiente" defaultValue={decimal(unidad?.coeficiente)} inputMode="decimal" required placeholder="1,25" /></label>
        <label>Área m² <small>(opcional)</small><input name="area_m2" defaultValue={decimal(unidad?.area_m2)} inputMode="decimal" /></label>
        <label>Matrícula inmobiliaria <small>(opcional)</small><input name="matricula_inmobiliaria" defaultValue={unidad?.matricula_inmobiliaria} maxLength={30} /></label>
      </div>
      {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
      {estado.ok && <p className="aviso ok" role="status">{estado.ok}</p>}
      <div><button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : unidad ? 'Guardar cambios' : 'Agregar unidad'}</button></div>
    </form>
  )
}
