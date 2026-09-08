const TOKEN_KEY = 'scapder_token'

export const getToken = () =>
  window.localStorage.getItem(TOKEN_KEY)

export const setToken = (token) => {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }

  let response

  try {
    response = await fetch(path, {
      ...options,
      headers,
    })
  } catch (error) {
    console.error('Error de conexión con la API:', error)

    throw new Error(
      'No fue posible conectarse con el servidor.'
    )
  }

  if (response.status === 401) {
    setToken(null)
  }

  let payload = null

  /*
   * Leemos primero la respuesta como texto.
   * Esto evita el error:
   *
   * Unexpected end of JSON input
   *
   * cuando el backend responde con cuerpo vacío.
   */
  const text = await response.text()

  if (text.trim()) {
    const contentType =
      response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      try {
        payload = JSON.parse(text)
      } catch (error) {
        console.error(
          'La API respondió con un JSON inválido:',
          text
        )

        payload = null
      }
    } else {
      payload = text
    }
  }

  if (!response.ok) {
    console.error('Error en la API:', {
      path,
      status: response.status,
      statusText: response.statusText,
      payload,
    })

    let message =
      'No fue posible completar la solicitud'

    if (Array.isArray(payload?.detail)) {
      message = payload.detail
        .map(
          (item) =>
            item?.msg ||
            item?.message ||
            JSON.stringify(item)
        )
        .join(' · ')
    } else if (
      payload?.detail &&
      typeof payload.detail === 'object'
    ) {
      message =
        payload.detail?.msg ||
        payload.detail?.message ||
        JSON.stringify(payload.detail)
    } else if (payload?.detail) {
      message = payload.detail
    } else if (payload?.message) {
      message = payload.message
    } else if (typeof payload === 'string') {
      message = payload
    }

    throw new Error(message)
  }

  return payload
}