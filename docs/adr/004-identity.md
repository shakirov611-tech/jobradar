# ADR 004 — Стабильная идентичность и идемпотентность

Дата: 2026-10-29. Статус: Accepted for design. Владелец решения: владелец JobRadar.

## Контекст
vacancy_id уже используется для дедупликации.

## Решение
Сохранить существующие ID; scoped identity provider+board+external ID. URL/fingerprint только вспомогательные сигналы. Update не затрагивает first_seen и ручные поля.

## Альтернативы
URL-only и company/title merge дают коллизии и потерю разных позиций.

## Последствия
Cross-source дубли пока возможны; атомарность Sheets не доказана.

## Пересмотр
При проектировании отдельного cross-source merge с provenance и undo.
