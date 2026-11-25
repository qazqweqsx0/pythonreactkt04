import { useEffect, useMemo, useState } from 'react'
import {
  PROGRESS_URL,
  STATUS_LABELS,
  describeConnectionError,
  parseEventData,
} from './api'

const KNOWN_STEPS = 5

function nowLabel() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false })
}

export default function App() {
  // runId — «номер запуска»: каждое изменение пересоздаёт EventSource в useEffect.
  const [runId, setRunId] = useState(1)
  const [status, setStatus] = useState('connecting')
  const [progress, setProgress] = useState(0)
  const [total, setTotal] = useState(KNOWN_STEPS)
  const [step, setStep] = useState(0)
  const [currentMessage, setCurrentMessage] = useState('')
  const [log, setLog] = useState([])
  const [error, setError] = useState('')
  const [finishedAt, setFinishedAt] = useState(null)

  useEffect(() => {
    // Правильный массив зависимостей: соединение живёт ровно один запуск.
    let source
    let settled = false
    let entryId = 0

    setStatus('connecting')
    setProgress(0)
    setStep(0)
    setTotal(KNOWN_STEPS)
    setCurrentMessage('')
    setError('')
    setFinishedAt(null)
    setLog([])

    const appendLog = (kind, title, detail) => {
      entryId += 1
      const id = `${Date.now()}-${entryId}`
      setLog((previous) => [...previous, { id, kind, title, detail, time: nowLabel() }])
    }

    // EventSource подключается к backend-эндпоинту прямо из useEffect.
    source = new EventSource(PROGRESS_URL)

    source.onopen = () => {
      if (settled) return
      setStatus('running')
    }

    // Обработка ИМЕНОВАННОГО события progress (addEventListener, не onmessage).
    const handleProgress = (event) => {
      if (settled) return

      const payload = parseEventData(event)
      if (!payload) return

      const percent = Number(payload.progress) || 0
      setStatus('running')
      setProgress(percent)
      setStep(Number(payload.step) || 0)
      setTotal(Number(payload.total) || KNOWN_STEPS)
      setCurrentMessage(payload.message ?? '')
      appendLog('progress', `progress · ${percent}%`, payload.message ?? `Шаг ${payload.step}`)
    }

    // Обработка ИМЕНОВАННОГО события complete (тоже через addEventListener).
    const handleComplete = (event) => {
      if (settled) return

      const payload = parseEventData(event)
      settled = true
      setProgress(100)
      setStatus('done')
      setFinishedAt(nowLabel())
      setCurrentMessage(payload?.message ?? 'Задача завершена')
      appendLog(
        'complete',
        'complete',
        payload?.elapsed_seconds != null
          ? `Задача завершена за ${payload.elapsed_seconds} с`
          : 'Задача завершена',
      )

      // close() при получении complete: сервер больше ничего не пришлёт.
      source.close()
    }

    // onerror: обрыв соединения — понятное сообщение пользователю.
    const handleError = () => {
      if (settled) return

      settled = true
      setStatus('error')
      setError(describeConnectionError())
      appendLog('error', 'error', 'Поток событий прерван')
      // Не даём EventSource переподключаться бесконечно: перезапуск — вручную.
      source.close()
    }

    source.addEventListener('progress', handleProgress)
    source.addEventListener('complete', handleComplete)
    source.onerror = handleError

    // cleanup useEffect: закрываем соединение при размонтировании/перезапуске,
    // чтобы не оставлять «висящих» потоков (нет утечки соединений).
    return () => {
      settled = true
      source.close()
    }
  }, [runId])

  const steps = useMemo(
    () => Array.from({ length: total }, (_, index) => Math.round(((index + 1) / total) * 100)),
    [total],
  )

  const restart = () => setRunId((value) => value + 1)

  return (
    <div className="page">
      <header className="hero">
        <span className="eyebrow">Практическое задание 4.3</span>
        <h1>Live-прогресс задачи через SSE</h1>
        <p className="lede">
          Backend на FastAPI присылает именованные события <code>progress</code> и{' '}
          <code>complete</code>. React слушает их через <code>EventSource</code> — без
          поллинга и перезагрузки страницы.
        </p>
        <div className="hero-meta">
          <code className="endpoint">{PROGRESS_URL}</code>
          <span className={`status status--${status}`}>{STATUS_LABELS[status]}</span>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          <strong>Не удалось получить прогресс.</strong> {error}
        </div>
      )}

      <main className="grid">
        <section className="card" aria-labelledby="progress-title">
          <div className="card-head">
            <h2 id="progress-title">Прогресс</h2>
            {finishedAt && <span className="muted">завершено в {finishedAt}</span>}
          </div>

          <div className="progress-value" aria-live="polite">
            <strong>{progress}</strong>
            <span>%</span>
          </div>

          <div
            className={`bar${status === 'done' ? ' bar--done' : ''}${status === 'error' ? ' bar--error' : ''}`}
            role="progressbar"
            aria-label="Прогресс задачи"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="bar__fill" style={{ width: `${progress}%` }} />
          </div>

          <ol className="steps" aria-label="Шаги задания">
            {steps.map((threshold, index) => {
              const reached = progress >= threshold
              return (
                <li key={threshold} className={reached ? 'step step--reached' : 'step'}>
                  <span className="step__dot">{reached ? '✓' : index + 1}</span>
                  <span className="step__label">{threshold}%</span>
                </li>
              )
            })}
          </ol>

          <p className="current-step">
            {currentMessage || (status === 'connecting' ? 'Открываем поток событий…' : 'Ожидание событий…')}
          </p>

          <div className="actions">
            <button type="button" className="button" onClick={restart}>
              {status === 'running' || status === 'connecting' ? 'Перезапустить' : 'Запустить снова'}
            </button>
            <span className="muted">
              шаг {step} из {total}
            </span>
          </div>
        </section>

        <section className="card" aria-labelledby="log-title">
          <div className="card-head">
            <h2 id="log-title">Журнал событий</h2>
            <span className="muted">{log.length} событий</span>
          </div>

          {log.length === 0 ? (
            <p className="empty">Событий пока нет — ждём первый пакет от сервера.</p>
          ) : (
            <ol className="log">
              {log.map((entry) => (
                <li key={entry.id} className={`log__item log__item--${entry.kind}`}>
                  <span className="log__time">{entry.time}</span>
                  <span className="log__title">{entry.title}</span>
                  <span className="log__detail">{entry.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>
          <code>addEventListener('progress')</code> и <code>addEventListener('complete')</code>,
          закрытие соединения в обработчике завершения и в cleanup <code>useEffect</code>.
        </span>
      </footer>
    </div>
  )
}
