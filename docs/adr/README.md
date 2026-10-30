# Architecture Decision Records

Статусы: Accepted for design — правило дальнейшей работы, не доказательство внедрения; Proposed — требует решения перед реализацией; Superseded — заменён новым ADR. Старые записи не переписывать задним числом: новый ADR указывает заменяемый.

| ADR | Статус |
|---|---|
| [001 Сохранить стек](001-preserve-mvp.md) | Accepted for design |
| [002 Границы данных](002-data-ownership.md) | Proposed |
| [003 Локальный контур](003-local-boundary.md) | Accepted for design |
| [004 Идентичность и upsert](004-identity.md) | Accepted for design |
| [005 Конфигурация](005-config.md) | Proposed |
| [006 Эксплуатация и лицензия](006-operations.md) | Accepted for design |
| [007 Локальный scheduled writer](007-local-scheduled-writer.md) | Accepted for implementation |
| [008 Канал отклика кандидата](008-application-channel-spike.md) | Accepted for spike |
| [009 Browser dry run](009-browser-dry-run-boundary.md) | Accepted for spike |
| [010 Multi-source каталог](010-multi-source-catalog.md) | Accepted for implementation |
| [011 Подтверждённый remote](011-confirmed-remote-main-view.md) | Accepted |
| [012 Подбор и оценка качества](012-explainable-matching-review.md) | Accepted for implementation |

Каждый ADR: контекст → решение → альтернативы → последствия → условие пересмотра. Шаблон: template.md.
