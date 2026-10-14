import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import {
  MotivoModal,
  TrazasModal,
  type ModoMotivo,
} from '../../../shared/registro/componentes.tsx'
import type { EntidadTraza } from '../../../shared/registro/registro.ts'
import { useAnulacion, type TipoRegistro } from '../api/respaldos.ts'
import { ETIQUETAS_RESPALDO } from '../catalogos.ts'

const ENTIDAD: Record<TipoRegistro, EntidadTraza> = {
  planes: 'PLAN_RESPALDO',
  ejecuciones: 'EJECUCION_RESPALDO',
  restauraciones: 'RESTAURACION',
}

/**
 * Anular, revertir y consultar trazas de un registro de respaldos. Devuelve
 * las funciones para abrir cada acción y los modales que hay que pintar.
 */
export function useAccionesRegistro(tipo: TipoRegistro) {
  const anulacion = useAnulacion()
  const [motivo, setMotivo] = useState<{ id: number; folio: string; modo: ModoMotivo } | null>(null)
  const [trazas, setTrazas] = useState<{ id: number; folio: string } | null>(null)

  const confirmar = (texto: string) => {
    if (!motivo) return
    anulacion.mutate(
      { tipo, id: motivo.id, modo: motivo.modo, motivo: texto },
      {
        onSuccess: () => {
          notifications.show({
            color: 'green',
            title: motivo.modo === 'anular' ? 'Registro anulado' : 'Anulación revertida',
            message: `${motivo.folio}: ${motivo.modo === 'anular' ? 'se conserva para auditoría y deja de contar en los indicadores.' : 'vuelve a contar en los indicadores.'}`,
          })
          setMotivo(null)
        },
        onError: (e) =>
          notifications.show({ color: 'red', title: 'No se pudo completar la acción', message: e.message }),
      },
    )
  }

  const modales = (
    <>
      <MotivoModal
        abierto={motivo !== null}
        modo={motivo?.modo ?? 'anular'}
        titulo={motivo ? `${motivo.modo === 'anular' ? 'Anular' : 'Revertir la anulación de'} ${motivo.folio}` : ''}
        enviando={anulacion.isPending}
        onCerrar={() => setMotivo(null)}
        onConfirmar={confirmar}
      />
      <TrazasModal
        abierto={trazas !== null}
        entidad={ENTIDAD[tipo]}
        registroId={trazas?.id ?? 0}
        titulo={`Trazas de ${trazas?.folio ?? ''}`}
        etiquetas={ETIQUETAS_RESPALDO}
        onCerrar={() => setTrazas(null)}
      />
    </>
  )
  return {
    anular: (id: number, f: string) => setMotivo({ id, folio: f, modo: 'anular' }),
    reversar: (id: number, f: string) => setMotivo({ id, folio: f, modo: 'reversar' }),
    verTrazas: (id: number, f: string) => setTrazas({ id, folio: f }),
    modales,
  }
}
