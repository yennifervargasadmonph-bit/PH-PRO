// Membrete y pie institucional de los documentos de una copropiedad.
// Componentes puros (sin estado): sirven en el servidor, en el navegador y en las
// vistas previas. Los estilos van en línea para que el documento se vea igual
// en pantalla, al imprimir y al exportar. El logo de PH PRO nunca aparece aquí.
import { DATO_FALTANTE, formatearCelular, formatearNit, type Identidad } from '@/lib/identidad'

export type DatosMembrete = Pick<Identidad, 'nombre' | 'nombreLegal' | 'nit' | 'celular' | 'direccion' | 'ciudad' | 'correo' | 'colorPrimario' | 'logoUrl'>

const estiloFaltante: React.CSSProperties = {
  color: '#b42318',
  background: '#fdecea',
  borderRadius: 4,
  padding: '0 4px',
  fontStyle: 'normal',
  fontWeight: 600,
  letterSpacing: 0,
  textTransform: 'none',
}

/** «Dato faltante», marcado para que nadie lo pase por alto. Nunca se inventa un dato. */
export function Faltante({ que }: { que?: string }) {
  return (
    <span style={estiloFaltante} data-faltante={que ?? ''} title={que ? `Falta: ${que}` : undefined}>
      «{DATO_FALTANTE}»
    </span>
  )
}

/** Encabezado del documento: logo a la izquierda; nombre completo en mayúsculas y NIT al lado. */
export function Membrete({ identidad }: { identidad: DatosMembrete }) {
  const { nombreLegal, nit, logoUrl, colorPrimario } = identidad
  return (
    <header
      className="membrete"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        paddingBottom: 10,
        borderBottom: `2px solid ${colorPrimario}`,
        color: '#17221d',
        minWidth: 0,
      }}
    >
      {logoUrl ? (
        // El logo se muestra tal cual (transparencia incluida), sin recortes ni fondo.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="Logo de la copropiedad" style={{ height: 56, width: 'auto', maxWidth: 160, objectFit: 'contain', flex: 'none' }} />
      ) : (
        <span
          style={{ height: 56, minWidth: 56, padding: '0 6px', border: '1px dashed #b42318', borderRadius: 6, display: 'grid', placeItems: 'center', fontSize: 10, textAlign: 'center', flex: 'none', lineHeight: 1.2 }}
          aria-label="Falta el logo"
        >
          Logo<br />
          <Faltante que="logo" />
        </span>
      )}
      <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
        <strong style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontSize: '1rem', lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {nombreLegal ?? <Faltante que="nombre completo" />}
        </strong>
        <span style={{ fontSize: '.85rem' }}>NIT {nit ? formatearNit(nit) : <Faltante que="NIT" />}</span>
      </div>
    </header>
  )
}

/** Pie del documento: nombre completo · NIT · Administración · Cel. (+ dirección y correo si existen). */
export function PieInstitucional({ identidad, generadoConPhPro = true }: { identidad: DatosMembrete; generadoConPhPro?: boolean }) {
  const { nombreLegal, nit, celular, direccion, ciudad, correo, colorPrimario } = identidad
  const lugar = [direccion, ciudad].filter(Boolean).join(', ')
  const sep = <span aria-hidden="true"> · </span>
  return (
    <footer className="pie-institucional" style={{ borderTop: `1px solid ${colorPrimario}`, paddingTop: 8, fontSize: '.75rem', color: '#3c4a43', display: 'grid', gap: 2 }}>
      <span style={{ overflowWrap: 'anywhere' }}>
        {nombreLegal ?? <Faltante que="nombre completo" />}
        {sep}NIT {nit ? formatearNit(nit) : <Faltante que="NIT" />}
        {sep}Administración
        {sep}Cel. {celular ? formatearCelular(celular) : <Faltante que="celular" />}
        {lugar && <>{sep}{lugar}</>}
        {correo && <>{sep}{correo}</>}
      </span>
      {generadoConPhPro && <span style={{ fontSize: '.65rem', color: '#8a968f' }}>Generado con PH PRO</span>}
    </footer>
  )
}
