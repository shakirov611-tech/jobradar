# Changelog

## Unreleased

Пока нет изменений.

## 0.8.0 — 2026-11-04

LANG-01: общий language analysis с evidence, отдельный персональный Language Fit, конфигурируемые языки/уровни, кэш и optional structured-output AI provider. Интеграция collector/preview, ручные hash-bound поправки, языковые пояснения в HTML и отчёт по всем источникам. Две opt-in JSON-колонки CRM с read-back; legacy workflows сохранены. [Rollout и непроверенные границы](docs/operations/language-intelligence.md).

DOC-01: локальный профиль фактов, подготовка резюме под выбранную вакансию, review состава и источников, подтверждение перед HTML export. Без LLM и отправки. [Ограничения](docs/operations/resume-preparation.md).

Резюме: сохранение/импорт черновиков, предпросмотр экспорта и переход из каталога. CTX-01: AGENTS.md, карта кода, источники истины, передача задач и методика оценки стоимости контекста. [Release notes и обновление](docs/releases/v0.8.0.md).

## 0.7.1 — 2026-10-30

Исправления условий конкретной позиции после первой разметки: optional hybrid, офисный формат, страны рассмотрения кандидатов и временная работа за границей. Описания раскрыты сразу; отдельные необязательные оценки роли/условий/доступности текста, labels v2 с чтением v1. Повторное открытие старого снимка с оценками без переразметки.
[Release notes](docs/releases/v0.7.1.md), [разбор](docs/research/matching-review-2026-10-30.md).

## 0.7.0 — 2026-10-30

Персональный профиль, объяснения подбора; контрольная выборка до 24 вакансий, локальные оценки, JSON export/import и отчёт по снимку. CRM payload сохранён. Также включает CI checks из PR #12.
[Release notes](docs/releases/v0.7.0.md), [инструкция](docs/operations/matching-v0.7.md).

## 0.6.1 — 2026-10-29

Подтверждённый remote по умолчанию в HTML обзоре; группы unclear/excluded; причины и evidence.
CRM и расписание совместимы с v0.6. Подробности: [release notes](docs/releases/v0.6.1.md).

Дата записи описывает подготовку версии, не факт публикации GitHub Release.
