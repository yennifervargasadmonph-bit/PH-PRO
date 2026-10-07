'use client'
import { useActionState, useState } from 'react'
import { guardarMarca, type Estado } from './acciones'

export type Marca = {
  color_primario: string
  color_secundario: string
  representante_legal: string
  correo: string
  telefono: string
  eslogan: string
}

export function FormularioMarca({ copropiedadId, nombre, marca, editable }: { copropiedadId: string; nombre: string; marca: Marca; editable: boolean }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarMarca.bind(null, copropiedadId), {})
  const [m, setM] = useState(marca)
  const cambiar = (k: keyof Marca) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: e.target.value })

  return (
    <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <form className="panel campos" action={accion}>
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
          <div className="fila">
            <label>Color principal<input type="color" name="color_primario" value={m.color_primario} onChange={cambiar('color_primario')} /></label>
            <label>Color secundario<input type="color" name="color_secundario" value={m.color_secundario} onChange={cambiar('color_secundario')} /></label>
          </div>
          <label>Representante legal<input name="representante_legal" value={m.representante_legal} onChange={cambiar('representante_legal')} maxLength={120} /></label>
          <div className="fila">
            <label>Correo de la administración<input type="email" name="correo" value={m.correo} onChange={cambiar('correo')} /></label>
            <label>Teléfono<input name="telefono" value={m.telefono} onChange={cambiar('telefono')} maxLength={40} /></label>
          </div>
          <label>Eslogan o frase <small>(opcional)</small><input name="eslogan" value={m.eslogan} onChange={cambiar('eslogan')} maxLength={120} /></label>
          {estado.error && <p className="aviso error" role="alert">{estado.error}</p>}
          {estado.ok && <p className="aviso ok" role="status">{estado.ok}</p>}
          {editable && <div><button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>}
        </fieldset>
        {!editable && <p className="tenue pequeno">Solo la administración puede cambiar estos datos.</p>}
      </form>
      <div>
        <p className="tenue pequeno" style={{ marginTop: 0 }}>Así se verán los comunicados e informes:</p>
        <div className="muestra-marca" style={{ background: m.color_primario }}>
          <strong style={{ fontSize: '1.2rem' }}>{nombre}</strong>
          {m.eslogan && <span style={{ opacity: 0.9 }}>{m.eslogan}</span>}
          <span style={{ height: 6, borderRadius: 3, background: m.color_secundario, marginTop: 8 }} />
          <span className="pequeno" style={{ opacity: 0.9 }}>
            {[m.representante_legal && `Representante legal: ${m.representante_legal}`, m.correo, m.telefono].filter(Boolean).join(' · ') || 'Datos de contacto'}
          </span>
        </div>
      </div>
    </div>
  )
}
