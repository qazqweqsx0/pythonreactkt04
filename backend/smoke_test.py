"""Проверка SSE-эндпоинта через реальный HTTP (запускать при работающем uvicorn)."""

from __future__ import annotations

import http.client
import json
import os
import sys

HOST = os.getenv("SMOKE_HOST", "127.0.0.1")
PORT = int(os.getenv("SMOKE_PORT", "8000"))


def read_events(timeout: float = 20.0) -> list[dict]:
    """Читает SSE-поток и разбирает события в список словарей."""
    connection = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    connection.request("GET", "/api/progress", headers={"Accept": "text/event-stream"})
    response = connection.getresponse()

    assert response.status == 200, f"Ожидался 200, получен {response.status}"
    content_type = response.getheader("Content-Type", "")
    assert content_type.startswith("text/event-stream"), f"Неверный Content-Type: {content_type}"

    events: list[dict] = []
    current: dict[str, str] = {}

    while True:
        line = response.readline()
        if not line:
            break

        text = line.decode("utf-8").rstrip("\r\n")
        if text == "":
            if current:
                events.append(current)
                current = {}
            continue
        if text.startswith(":"):
            continue  # комментарий/keep-alive
        if ":" in text:
            field, value = text.split(":", 1)
            current[field] = value.lstrip()
        else:
            current[text] = ""

        if current.get("event") == "complete" and "data" in current:
            events.append(current)
            break

    connection.close()
    return events


def main() -> int:
    health_connection = http.client.HTTPConnection(HOST, PORT, timeout=5)
    health_connection.request("GET", "/api/health")
    health_response = health_connection.getresponse()
    health_body = json.loads(health_response.read())
    assert health_response.status == 200 and health_body.get("status") == "ok", "Health-check не пройден"
    health_connection.close()

    events = read_events()
    progress = [event for event in events if event.get("event") == "progress"]
    complete = [event for event in events if event.get("event") == "complete"]

    values = [json.loads(event["data"])["progress"] for event in progress]
    expected = [20, 40, 60, 80, 100]

    errors: list[str] = []
    if values != expected:
        errors.append(f"Шаги прогресса: {values}, ожидались {expected}")
    if len(complete) != 1:
        errors.append(f"Ожидалось ровно одно событие complete, получено {len(complete)}")
    elif json.loads(complete[0]["data"])["progress"] != 100:
        errors.append("Событие complete должно сообщать progress=100")
    if any("event" not in event for event in events):
        errors.append("Найдено событие без имени (event:)")

    if errors:
        for error in errors:
            print(f"FAIL: {error}")
        return 1

    print(f"OK: получено {len(progress)} событий progress: {values}")
    print("OK: получено событие complete с progress=100")
    print("OK: события именованные (event: progress / event: complete)")
    print("OK: /api/health отвечает status=ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
