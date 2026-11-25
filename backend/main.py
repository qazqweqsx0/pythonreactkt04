"""Backend: SSE-эндпоинт с прогрессом выполнения условной задачи.

Практическое задание 4.3 — «Подключение SSE к React: EventSource API».

Сервер отдаёт поток ``text/event-stream`` с пятью именованными событиями
``progress`` (20, 40, 60, 80, 100 %) и финальным событием ``complete``.
События именованные (``event: progress`` / ``event: complete``), поэтому на
клиенте они принимаются через ``addEventListener``, а не через ``onmessage``.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

# Шаги прогресса, которые получает клиент (нарастающие значения, 5 событий).
PROGRESS_STEPS: tuple[int, ...] = (20, 40, 60, 80, 100)
TOTAL_STEPS = len(PROGRESS_STEPS)

# Пауза между событиями; можно переопределить переменной окружения.
STEP_DELAY_SECONDS = float(os.getenv("SSE_STEP_DELAY", "0.8"))

# Сообщение для каждого шага — клиент показывает его в журнале событий.
STEP_MESSAGES = {
    20: "Инициализация задачи",
    40: "Чтение исходных данных",
    60: "Обработка записей",
    80: "Сохранение результатов",
    100: "Финальная проверка",
}

app = FastAPI(
    title="SSE Progress API",
    description="Поток прогресса условной задачи через Server-Sent Events",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    # Дополнительно разрешаем любой локальный dev-порт Vite (5173, 5174, ...).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def sse_payload(**fields: object) -> str:
    """JSON-полезная нагрузка события (компактно, без лишних пробелов)."""
    return json.dumps(fields, ensure_ascii=False, separators=(",", ":"))


@app.get("/api/health")
def health() -> dict:
    """Проверка доступности сервера."""
    return {"status": "ok"}


@app.get("/api/progress")
async def progress_stream(request: Request) -> EventSourceResponse:
    """Отправляет прогресс задачи как поток именованных SSE-событий."""

    async def event_generator() -> AsyncIterator[dict]:
        started_at = time.perf_counter()

        for index, percent in enumerate(PROGRESS_STEPS, start=1):
            # Клиент мог закрыть соединение (EventSource.close / уход со страницы) —
            # прекращаем работу, не отправляя «complete» в никуда.
            if await request.is_disconnected():
                return

            yield {
                "event": "progress",
                "id": str(index),
                "data": sse_payload(
                    progress=percent,
                    step=index,
                    total=TOTAL_STEPS,
                    message=STEP_MESSAGES[percent],
                ),
            }

            if index < TOTAL_STEPS:
                await asyncio.sleep(STEP_DELAY_SECONDS)

            if await request.is_disconnected():
                return

        finished = True

        if finished:
            elapsed = round(time.perf_counter() - started_at, 2)
            yield {
                "event": "complete",
                "id": str(TOTAL_STEPS + 1),
                "data": sse_payload(
                    progress=100,
                    step=TOTAL_STEPS,
                    total=TOTAL_STEPS,
                    elapsed_seconds=elapsed,
                    message="Задача успешно завершена",
                ),
            }

    return EventSourceResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
