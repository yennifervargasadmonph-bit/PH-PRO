'use client'
import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Membrete, PieInstitucional } from '@/components/membrete'
import { LOGO_MAX_BYTES, LOGO_MAX_LADO, LOGO_TIPOS, faltantesIdentidad, listarEnEspanol, normalizarCelular, validarNit, type Identidad } from '@/lib/identidad'
import { guardarIdentidad, quitarLogo, subirLogo, type Estado } from './acciones'

type Campos = {
  nombre_legal: string
  nit: string
  celular: string
  representante_legal: string
  correo: string
  telefono: string
  eslogan: string
  color_primario: string
  color_secundario: string
}

/**
 * Reduce el logo a máximo 512 px de lado en el navegador, conservando la transparencia
 * (nunca se pinta un fondo ni se recorta). Los SVG y los logos pequeños pasan tal cual.
 */
async function prepararLogo(archivo: File): Promise<File> {
  if (archivo.type === 'image/svg+xml' || typeof createImageBitmap === 'undefined') return archivo
  try {
    const imagen = await createImageBitmap(archivo)
    const lado = Math.max(imagen.width, imagen.height)
    if (lado <= LOGO_MAX_LADO) return archivo
    const escala = LOGO_MAX_LADO / lado
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(imagen.width * escala)
    lienzo.height = Math.round(imagen.height * escala)
    const ctx = lienzo.getContext('2d')
    if (!ctx) return archivo
    ctx.clearRect(0, 0, lienzo.width, lienzo.height)
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height)
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, archivo.type, 0.92))
    // Si el navegador no sabe codificar ese formato, devuelve PNG (que también conserva la transparencia).
    if (!blob || !(blob.type in LOGO_TIPOS) || blob.size >= archivo.size) return archivo
    const extension = LOGO_TIPOS[blob.type as keyof typeof LOGO_TIPOS]
    return new File([blob], `logo.${extension}`, { type: blob.type })
  } catch {
    return archivo
  }
}

function Mensaje({ estado }: { estado: Estado }) {
  if (estado.error) return <p className="aviso error" role="alert">{estado.error}</p>
  if (estado.ok) return <p className="aviso ok" role="status">{estado.ok}</p>
  return null
}

function CargaLogo({ copropiedadId, logoUrl, editable, onVistaPrevia }: { copropiedadId: string; logoUrl: string | null; editable: boolean; onVistaPrevia: (url: string | null) => void }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [estado, setEstado] = useState<Estado>({})
  const [pendiente, iniciar] = useTransition()

  const elegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0]
    e.target.value = ''
    if (!original) return
    if (!(original.type in LOGO_TIPOS)) return setEstado({ error: 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.' })
    iniciar(async () => {
      const archivo = await prepararLogo(original)
      if (archivo.size > LOGO_MAX_BYTES) {
        setEstado({ error: 'El logo no puede pesar más de 2 MB.' })
        return
      }
      onVistaPrevia(URL.createObjectURL(archivo))
      const datos = new FormData()
      datos.set('logo', archivo)
      const r = await subirLogo(copropiedadId, {}, datos)
      setEstado(r)
      if (r.error) onVistaPrevia(null)
      router.refresh()
    })
  }

  const quitar = () => {
    if (!confirm('¿Quitar el logo de la copropiedad? Los documentos nuevos saldrán sin logo hasta que cargues otro.')) return
    iniciar(async () => {
      const r = await quitarLogo(copropiedadId)
      setEstado(r)
      if (!r.error) onVistaPrevia(null)
      router.refresh()
    })
  }

  return (
    <div className="campos">
      <span style={{ fontWeight: 600, fontSize: '.9rem' }}>Logo</span>
      <div className="logo-caja">
        <div className="tablero" aria-label={logoUrl ? 'Vista previa del logo' : 'Sin logo'}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo de la copropiedad" />
          ) : (
            <span className="tenue pequeno">Sin logo</span>
          )}
        </div>
        {editable && (
          <div className="logo-acciones">
            <input ref={entrada} type="file" accept={Object.keys(LOGO_TIPOS).join(',')} onChange={elegir} hidden />
            <button type="button" className="boton secundario" disabled={pendiente} onClick={() => entrada.current?.click()}>
              {pendiente ? 'Guardando…' : logoUrl ? 'Cambiar logo' : 'Cargar logo'}
            </button>
            {logoUrl && <button type="button" className="boton secundario" disabled={pendiente} onClick={quitar}>Quitar</button>}
            <small className="tenue">PNG, JPG, WEBP o SVG, máximo 2 MB. Se conserva la transparencia; se reduce a 512 px si es más grande.</small>
          </div>
        )}
      </div>
      <Mensaje estado={estado} />
    </div>
  )
}

export function FormularioIdentidad({ copropiedadId, identidad, editable }: { copropiedadId: string; identidad: Identidad; editable: boolean }) {
  const [estado, accion, enviando] = useActionState<Estado, FormData>(guardarIdentidad.bind(null, copropiedadId), {})
  const [c, setC] = useState<Campos>({
    nombre_legal: identidad.nombreLegal ?? '',
    nit: identidad.nit ?? '',
    celular: identidad.celular ?? '',
    representante_legal: identidad.representanteLegal,
    correo: identidad.correo,
    telefono: identidad.telefono,
    eslogan: identidad.eslogan,
    color_primario: identidad.colorPrimario,
    color_secundario: identidad.colorSecundario,
  })
  const [previa, setPrevia] = useState<string | null>(null)
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa) }, [previa])
  const cambiar = (k: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value })

  // La vista previa usa exactamente los componentes de los documentos, con lo que está escrito ahora.
  const nit = c.nit.trim() ? validarNit(c.nit) : null
  const celular = c.celular.trim() ? normalizarCelular(c.celular) : null
  const logoUrl = previa ?? identidad.logoUrl
  const muestra = {
    ...identidad,
    nombreLegal: c.nombre_legal.trim().replace(/\s+/g, ' ') || null,
    nit: nit?.ok ? nit.nit : null,
    celular,
    correo: c.correo.trim(),
    colorPrimario: c.color_primario,
    logoUrl,
  }
  const faltan = faltantesIdentidad({ ...muestra, logoRuta: logoUrl })

  return (
    <div className="rejilla" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', alignItems: 'start' }}>
      <div className="panel campos">
        <CargaLogo copropiedadId={copropiedadId} logoUrl={logoUrl} editable={editable} onVistaPrevia={setPrevia} />
        <form className="campos" action={accion}>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 14 }}>
            <label>
              Nombre completo
              <input name="nombre_legal" value={c.nombre_legal} onChange={cambiar('nombre_legal')} required minLength={5} maxLength={160} placeholder="Ej.: Edificio Álamos 23 Propiedad Horizontal" />
              <small className="tenue">Tal como figura en la certificación de existencia y representación legal.</small>
            </label>
            <div className="fila">
              <label>
                NIT
                <input name="nit" value={c.nit} onChange={cambiar('nit')} required inputMode="numeric" placeholder="900123456-8" aria-invalid={nit ? !nit.ok : undefined} />
                {nit && !nit.ok && <small style={{ color: 'var(--error)' }}>{nit.error}</small>}
              </label>
              <label>
                Celular de la administración
                <input name="celular" value={c.celular} onChange={cambiar('celular')} required type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" aria-invalid={c.celular.trim() ? !celular : undefined} />
                {c.celular.trim() && !celular && <small style={{ color: 'var(--error)' }}>10 dígitos que empiecen por 3.</small>}
              </label>
            </div>
            <label>Representante legal<input name="representante_legal" value={c.representante_legal} onChange={cambiar('representante_legal')} maxLength={120} /></label>
            <div className="fila">
              <label>Correo de la administración<input type="email" name="correo" value={c.correo} onChange={cambiar('correo')} /></label>
              <label>Teléfono fijo <small>(opcional)</small><input name="telefono" value={c.telefono} onChange={cambiar('telefono')} maxLength={40} /></label>
            </div>
            <div className="fila">
              <label>Color principal<input type="color" name="color_primario" value={c.color_primario} onChange={cambiar('color_primario')} /></label>
              <label>Color secundario<input type="color" name="color_secundario" value={c.color_secundario} onChange={cambiar('color_secundario')} /></label>
            </div>
            <label>Eslogan o frase <small>(opcional)</small><input name="eslogan" value={c.eslogan} onChange={cambiar('eslogan')} maxLength={120} /></label>
            <Mensaje estado={estado} />
            {editable && <div><button className="boton" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar identidad'}</button></div>}
          </fieldset>
          {!editable && <p className="tenue pequeno">Solo la administración puede cambiar estos datos.</p>}
        </form>
      </div>
      <div className="campos">
        <p className="tenue pequeno" style={{ margin: 0 }}>Así saldrán el encabezado y el pie de todos los documentos (actas, comunicados, informes, certificados):</p>
        <div className="hoja-muestra">
          <Membrete identidad={muestra} />
          <div className="hoja-cuerpo" aria-hidden="true"><span /><span /><span /><span /></div>
          <PieInstitucional identidad={muestra} />
        </div>
        {faltan.length > 0 && (
          <p className="aviso info" role="status">Falta {listarEnEspanol(faltan)}. Mientras tanto los documentos lo mostrarán como «Dato faltante».</p>
        )}
      </div>
    </div>
  )
}
