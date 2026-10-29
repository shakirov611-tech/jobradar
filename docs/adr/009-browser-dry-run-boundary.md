# ADR 009 — Изолированный browser dry run без live writes

Дата: 2026-10-29. Статус: Accepted for spike.

## Контекст

APP-01 HTTP fixture не проверяет DOM и iframe. Исследованная Greenhouse ссылка
перенаправляет на Airbnb careers, а форма находится в iframe с временным token.
Автоматический выбор файла может немедленно запускать remote upload.

## Решение

Playwright — отдельная dev dependency в browser/, не часть коллектора. Новые context
без пользовательской сессии, синтетические данные, network allowlist только для
известных HTTPS GET/HEAD. Live writes и WebSockets блокируются, service workers отключены.
Submit methods отключены. Локальная fixture отдельно допускает только upload POST
на свой numeric loopback origin. Явно разделяем selected file, server receipt и submission.
CI проверяет fixture без доступа к работодателю; live read-only DOM evidence отдельно.
Не сохраняем embed src/validityToken. Не выбираем согласия и неизвестные ответы.

## Последствия

Нынешний live runner может выбрать файл, но не подтверждает его приём работодателем.
Это осознанная граница spike; будущий разрешённый live upload потребует отдельного
адаптера и точного контракта endpoint. Нельзя снять запрет POST и объявить поддержку
автооткликов. Durable state и approval по ADR 008 остаются обязательными до production.

## Пересмотр

После проверки одного конкретного live канала и его условий. [Evidence](../research/browser-dry-run.md).
