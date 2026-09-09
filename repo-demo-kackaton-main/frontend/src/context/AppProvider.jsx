import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  useLocation,
  useNavigate,
} from 'react-router-dom'

import { useAuth } from './AuthProvider'
import { useJobPolling } from '../hooks/useJobPolling'

import {
  createAnalysis,
  getAnalysis,
} from '../services/analyses'

import {
  createRetailer as createRetailerRequest,
  createSite as createSiteRequest,
  deleteRetailer as deleteRetailerRequest,
  getRetailerSites,
  getRetailers,
} from '../services/retailers'

import {
  deleteSite as deleteSiteRequest,
  saveSiteConfiguration,
  getSite,
} from '../services/sites'

const AppContext = createContext(null)

export function AppProvider({
  children,
}) {
  const {
    user,
    logout,
  } = useAuth()

  const navigate =
    useNavigate()

  const location =
    useLocation()

  /* =========================================================
     ESTADOS PRINCIPALES
  ========================================================= */

  const [
    retailers,
    setRetailers,
  ] = useState([])

  const [
    retailer,
    setRetailer,
  ] = useState(null)

  const [
    sites,
    setSites,
  ] = useState([])

  const [
    site,
    setSite,
  ] = useState(null)

  /* =========================================================
     ESTADOS TEMPORALES DEL ANÁLISIS
  ========================================================= */

  const [
    file,
    setFile,
  ] = useState(null)

  const [
    preview,
    setPreview,
  ] = useState('')

  const [
    job,
    setJob,
  ] = useState(null)

  const [
    mode,
    setMode,
  ] = useState('traffic')

  const [
    selectedId,
    setSelectedId,
  ] = useState(null)

  const [
    frameCapture,
    setFrameCapture,
  ] = useState(null)

  const [
    analysisArea,
    setAnalysisArea,
  ] = useState(null)

  /* =========================================================
     REFS
  ========================================================= */

  const inputRef =
    useRef(null)

  const siteRef =
    useRef(site)

  siteRef.current =
    site

  /* =========================================================
     CARGAR EMPRESAS
  ========================================================= */

  useEffect(() => {
    if (!user) {
      return
    }

    getRetailers()
      .then(
        setRetailers
      )
      .catch(
        () => logout()
      )
  }, [
    user,
    logout,
  ])

  /* =========================================================
     CARGAR SEDES DE EMPRESA
  ========================================================= */

  useEffect(() => {
    if (!retailer) {
      return
    }

    getRetailerSites(
      retailer.id
    )
      .then(
        setSites
      )
      .catch(() => {
        setSites([])
      })
  }, [retailer])

  /* =========================================================
     LIBERAR PREVIEW
  ========================================================= */

  useEffect(() => {
    return () => {
      if (preview) {
        try {
          URL.revokeObjectURL(
            preview
          )
        } catch {
          // No hacemos nada.
        }
      }
    }
  }, [preview])

  /* =========================================================
     POLLING DEL ANÁLISIS
  ========================================================= */

  useJobPolling(
    job,
    setJob
  )

  /* =========================================================
     REDIRECCIONAR A RESULTADOS
  ========================================================= */

  useEffect(() => {
    if (
      !job?.result ||
      !job?.id
    ) {
      return
    }

    const resultPath =
      `/analyses/${job.id}`

    const processingPath =
      `${resultPath}/procesando`

    const isProcessingRoute =
      location.pathname ===
        processingPath ||
      location.pathname.startsWith(
        `${processingPath}/`
      )

    if (
      isProcessingRoute
    ) {
      navigate(
        resultPath,
        {
          replace: true,
        }
      )
    }
  }, [
    job?.result,
    job?.id,
    location.pathname,
    navigate,
  ])

  /* =========================================================
     LIMPIAR SESIÓN TEMPORAL DEL ANÁLISIS

     ESTO ES LO IMPORTANTE PARA TU ERROR.

     Limpia:
     - video
     - preview
     - job
     - selección temporal
     - frame temporal
     - área temporal

     NO elimina la configuración guardada de la sede.
  ========================================================= */

  const resetAnalysisSession =
    useCallback(() => {
      if (preview) {
        try {
          URL.revokeObjectURL(
            preview
          )
        } catch {
          // Ignorar error al liberar URL.
        }
      }

      setFile(null)

      setPreview('')

      setJob(null)

      setSelectedId(null)

      setFrameCapture(null)

      setAnalysisArea(null)

      if (
        inputRef.current
      ) {
        inputRef.current.value =
          ''
      }
    }, [preview])

  /* =========================================================
     VOLVER A EMPRESAS
  ========================================================= */

  const goHome =
    useCallback(() => {
      resetAnalysisSession()

      setRetailer(null)

      setSite(null)

      setSites([])

      navigate(
        '/empresas',
        {
          replace: true,
        }
      )
    }, [
      navigate,
      resetAnalysisSession,
    ])

  /* =========================================================
     SELECCIONAR EMPRESA
  ========================================================= */

  const selectRetailer =
    useCallback(
      (item) => {
        resetAnalysisSession()

        setRetailer(
          item
        )

        setSite(null)

        setSites([])

        navigate(
          `/empresas/${item.id}/sedes`
        )
      },
      [
        navigate,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     CREAR EMPRESA
  ========================================================= */

  const createRetailer =
    useCallback(
      async (
        values
      ) => {
        resetAnalysisSession()

        const created =
          await createRetailerRequest(
            values
          )

        setRetailers(
          (
            current
          ) => [
            created,
            ...current,
          ]
        )

        setRetailer(
          created
        )

        setSite(null)

        setSites([])

        navigate(
          `/empresas/${created.id}/sedes`
        )
      },
      [
        navigate,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     ELIMINAR EMPRESA
  ========================================================= */

  const deleteRetailer =
    useCallback(
      async (
        item
      ) => {
        await deleteRetailerRequest(
          item.id
        )

        setRetailers(
          (
            current
          ) =>
            current.filter(
              (
                retailerItem
              ) =>
                retailerItem.id !==
                item.id
            )
        )

        setSites([])

        if (
          retailer?.id ===
          item.id
        ) {
          setRetailer(
            null
          )
        }

        if (
          site?.retailer_id ===
          item.id
        ) {
          setSite(
            null
          )
        }

        resetAnalysisSession()

        navigate(
          '/empresas',
          {
            replace: true,
          }
        )
      },
      [
        navigate,
        retailer?.id,
        site?.retailer_id,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     SELECCIONAR SEDE

     CORREGIDO:
     AL CAMBIAR DE SEDE BORRA EL VIDEO ANTERIOR.
  ========================================================= */

  const selectSite =
    useCallback(
      (item) => {
        resetAnalysisSession()

        setSite(
          item
        )

        navigate(
          `/sedes/${item.id}`
        )
      },
      [
        navigate,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     CREAR SEDE

     CORREGIDO:
     UNA SEDE NUEVA SIEMPRE EMPIEZA SIN VIDEO.
  ========================================================= */

  const createSite =
    useCallback(
      async (
        values
      ) => {
        if (
          !retailer?.id
        ) {
          throw new Error(
            'No hay una empresa seleccionada.'
          )
        }

        /*
          Limpiamos cualquier video/análisis
          de la sede anterior ANTES de crear
          la sede nueva.
        */

        resetAnalysisSession()

        const created =
          await createSiteRequest(
            retailer.id,
            values
          )

        setSites(
          (
            current
          ) => [
            ...current,
            created,
          ]
        )

        setSite(
          created
        )

        /*
          La sede nueva entra al paso de video
          completamente limpia.
        */

        navigate(
          `/sites/${created.id}/video`
        )
      },
      [
        navigate,
        retailer?.id,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     ELIMINAR SEDE
  ========================================================= */

  const deleteSite =
    useCallback(
      async (
        item
      ) => {
        await deleteSiteRequest(
          item.id
        )

        setSites(
          (
            current
          ) =>
            current.filter(
              (
                siteItem
              ) =>
                siteItem.id !==
                item.id
            )
        )

        if (
          site?.id ===
          item.id
        ) {
          setSite(
            null
          )

          resetAnalysisSession()
        }
      },
      [
        site?.id,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     SELECCIONAR VIDEO
  ========================================================= */

  const chooseFile =
    (
      candidate
    ) => {
      if (!candidate) {
        return
      }

      if (
        !candidate.name
          .toLowerCase()
          .endsWith(
            '.mp4'
          )
      ) {
        setJob({
          status:
            'failed',

          stage:
            'upload',

          progress:
            0,

          message:
            'Selecciona un archivo MP4',
        })

        return
      }

      /*
        Liberar preview anterior.
      */

      if (preview) {
        try {
          URL.revokeObjectURL(
            preview
          )
        } catch {
          // No hacemos nada.
        }
      }

      /*
        Guardamos el archivo original.

        NO añadimos ".mp4" al nombre.
      */

      setFile(
        candidate
      )

      setPreview(
        URL.createObjectURL(
          candidate
        )
      )

      setJob(null)

      setSelectedId(null)

      setFrameCapture(null)

      setAnalysisArea(null)
    }

  /* =========================================================
     QUITAR VIDEO
  ========================================================= */

  const clearFile =
    () => {
      if (preview) {
        try {
          URL.revokeObjectURL(
            preview
          )
        } catch {
          // Ignorar.
        }
      }

      setFile(null)

      setPreview('')

      setJob(null)

      setSelectedId(null)

      setFrameCapture(null)

      setAnalysisArea(null)

      if (
        inputRef.current
      ) {
        inputRef.current.value =
          ''
      }
    }

  /* =========================================================
     ACTUALIZAR CONFIGURACIÓN LOCAL
  ========================================================= */

  const updateConfiguration =
    (
      configuration
    ) => {
      setSite(
        (
          current
        ) =>
          current
            ? {
                ...current,
                configuration,
              }
            : current
      )
    }

  /* =========================================================
     CAPTURAR FRAME
  ========================================================= */

  const onFrameCapture =
    (
      dataUrl,
      width,
      height
    ) => {
      const capture = {
        dataUrl,
        width,
        height,
      }

      setFrameCapture(
        capture
      )

      setSite(
        (
          current
        ) =>
          current
            ? {
                ...current,

                configuration: {
                  ...current.configuration,

                  reference_frame:
                    capture,
                },
              }
            : current
      )
    }

  /* =========================================================
     GUARDAR CONFIGURACIÓN DE SEDE
  ========================================================= */

  const saveConfiguration =
    useCallback(
      async (
        configuration
      ) => {
        if (
          !siteRef.current
            ?.id
        ) {
          throw new Error(
            'No hay una sede seleccionada.'
          )
        }

        const payload =
          configuration ??
          siteRef.current
            .configuration

        const saved =
          await saveSiteConfiguration(
            siteRef.current.id,
            payload
          )

        setSite(
          saved
        )

        setSites(
          (
            current
          ) =>
            current.map(
              (
                item
              ) =>
                item.id ===
                saved.id
                  ? saved
                  : item
            )
        )

        return saved
      },
      []
    )

  /* =========================================================
     INICIAR ANÁLISIS
  ========================================================= */

  const analyze =
    useCallback(
      async (
        roi =
          analysisArea
      ) => {
        if (
          !site?.id
        ) {
          setJob({
            status:
              'failed',

            stage:
              'failed',

            progress:
              100,

            message:
              'No hay una sede seleccionada.',
          })

          return
        }

        if (!file) {
          setJob({
            status:
              'failed',

            stage:
              'failed',

            progress:
              100,

            message:
              'Selecciona un video antes de iniciar el análisis.',
          })

          return
        }

        const body =
          new FormData()

        body.append(
          'site_id',
          site.id
        )

        body.append(
          'video',
          file
        )

        if (
          roi?.length
        ) {
          body.append(
            'roi',
            JSON.stringify(
              roi
            )
          )
        }

        setJob({
          status:
            'uploading',

          stage:
            'upload',

          progress:
            0,

          message:
            'Subiendo video...',
        })

        try {
          const created =
            await createAnalysis(
              body
            )

          setJob({
            id:
              created.id,

            status:
              'queued',

            stage:
              'upload',

            progress:
              1,

            message:
              'Video recibido',
          })

          navigate(
            `/analyses/${created.id}/procesando`
          )
        } catch (
          error
        ) {
          setJob({
            status:
              'failed',

            stage:
              'failed',

            progress:
              100,

            message:
              error.message ||
              'No fue posible iniciar el análisis.',
          })
        }
      },
      [
        analysisArea,
        file,
        navigate,
        site?.id,
      ]
    )

  /* =========================================================
     CARGAR ANÁLISIS
  ========================================================= */

  const loadAnalysis =
    useCallback(
      async (
        analysisId
      ) => {
        const data =
          await getAnalysis(
            analysisId
          )

        setJob(
          data
        )

        return data
      },
      []
    )

  /* =========================================================
     CARGAR SEDE

     IMPORTANTE:
     SI LA SEDE ES DIFERENTE A LA ACTUAL,
     LIMPIAMOS EL VIDEO DE LA SEDE ANTERIOR.
  ========================================================= */

  const loadSite =
    useCallback(
      async (
        siteId
      ) => {
        const data =
          await getSite(
            siteId
          )

        const currentSiteId =
          siteRef.current
            ?.id

        const changingSite =
          currentSiteId &&
          String(
            currentSiteId
          ) !==
            String(
              data.id
            )

        if (
          changingSite
        ) {
          resetAnalysisSession()
        }

        setSite(
          data
        )

        /*
          Solo recuperamos el reference_frame
          guardado para ESTA sede.
        */

        if (
          data.configuration
            ?.reference_frame
            ?.dataUrl
        ) {
          setFrameCapture(
            data.configuration
              .reference_frame
          )
        } else {
          setFrameCapture(
            null
          )
        }

        setSites(
          (
            current
          ) =>
            current.map(
              (
                item
              ) =>
                item.id ===
                data.id
                  ? data
                  : item
            )
        )

        if (
          retailers.length
        ) {
          const owner =
            retailers.find(
              (
                item
              ) =>
                String(
                  item.id
                ) ===
                String(
                  data.retailer_id
                )
            )

          if (owner) {
            setRetailer(
              owner
            )
          }
        }

        return data
      },
      [
        retailers,
        resetAnalysisSession,
      ]
    )

  /* =========================================================
     VALORES DEL CONTEXTO
  ========================================================= */

  const value = {
    retailers,
    retailer,
    sites,
    site,

    file,
    preview,

    job,
    mode,
    selectedId,

    frameCapture,
    analysisArea,

    inputRef,

    setRetailer,
    setSite,
    setSites,

    setJob,
    setMode,
    setSelectedId,

    setAnalysisArea,

    selectRetailer,
    createRetailer,
    deleteRetailer,

    selectSite,
    createSite,
    deleteSite,

    chooseFile,
    clearFile,

    /*
      NUEVO:
      SitePickerPage y otras vistas pueden usarlo.
    */

    resetAnalysisSession,

    updateConfiguration,
    saveConfiguration,

    onFrameCapture,

    analyze,

    goHome,

    loadAnalysis,
    loadSite,
  }

  return (
    <AppContext.Provider
      value={value}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp =
  () =>
    useContext(
      AppContext
    )