// Адрес backend-сервера: задаётся в frontend/.env (см. .env.example).
const rawApiUrl = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export const API_URL = rawApiUrl.replace(/\/+$/, '')

// Эндпоинт SSE-потока. EventSource всегда выполняет GET-запрос.
export const PROGRESS_URL = `${API_URL}/api/progress`

export const STATUS_LABELS = {
  connecting: 'Подключение…',
  running: 'Соединение открыто',
  done: 'Соединение закрыто — задача завершена',
  error: 'Соединение закрыто — ошибка',
}

/**
 * Разбирает поле data SSE-события. Сервер присылает JSON, но повреждённое
 * сообщение не должно ронять интерфейс.
 */
export function parseEventData(event) {
  if (!event?.data) return null

  try {
    return JSON.parse(event.data)
  } catch {
    return null
  }
}

/** Понятное пользователю сообщение об обрыве соединения. */
export function describeConnectionError() {
  return (
    `Соединение с сервером прервано. Проверьте, что backend запущен по адресу ${API_URL} ` +
    '(команда запуска — в README), и нажмите «Перезапустить».'
  )
}
