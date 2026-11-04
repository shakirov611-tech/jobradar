# JobRadar — актуальный roadmap

Обновлено 2026-11-03. Источник текущих статусов; [план](implementation-plan-v1.md) хранит scope/критерии, [backlog](backlog.md) — следующие задачи. Код проверен по `be5dafe` (PR #16). Последний опубликованный релиз — [v0.7.1](../releases/v0.7.1.md); локальные резюме из PR #15–16 уже в main, но нового релиза ещё нет. Merge, публикация и установка на ПК — разные события.

## Реализовано и частично реализовано

| Этап | Статус | Проверяемое основание / ограничение |
|---|---|---|
| A. Надёжный сбор | Основа реализована | sources/catalog, multi-collector, storage preparation, Windows scheduler; Node fixtures и локальные integration scripts. Пользователь подтвердил v0.4 integration и первый scheduled v0.5; длительная стабильность и отдельный multi-source writer runtime evidence ещё не зафиксированы |
| B. Канал отправки | Прототип | src/applications, application-spike/browser-policy и browser dry-run tests. Разрешённые live upload/Submit/receipt не проверены |
| C. Полезный поиск | Правила и review реализованы; оценка продолжается | src/matching, src/reports; personal-match, remote-policy и browser fixtures. Первая разметка 23/24 [разобрана](../research/matching-review-2026-10-30.md); пользователь отметил улучшение. Новая количественная точность не измерена |
| D. Факты и резюме | Частично реализовано; продуктовый этап в работе | src/resumes, prepare-resume/resume-catalog; resume-package и browser resume-review tests; PR [15](https://github.com/shakirov611-tech/jobradar/pull/15), [16](https://github.com/shakirov611-tech/jobradar/pull/16). Локальный facts package, review, HTML export, drafts/import, preview и переход из каталога. AI-редактирование и автоматический PDF не реализованы |
| E. Assisted Apply | Запланировано | Зависит от B+C+D и durable product state; реальных отправок нет |
| F. Автоотклики | Запланировано | После E: opt-in, лимиты, pause, защита от дублей и неоднозначных исходов |
| G. Multi-user SaaS pilot | Запланировано | После рабочего single-user сценария: auth/isolation, hosting, private storage, lifecycle и восстановление |

Пути и соответствующие тесты: [карта кода](../architecture/codebase-map.md). Положительный fixture-тест не подтверждает развёртывание на ПК. Подготовка HTML резюме не означает автоматическую отправку или генерацию нового текста.

## Текущий приоритет и следующие шаги

По запросу пользователя продуктовая реализация временно уступила место **AI Development Context Engineering v1**: точный аудит, источники истины, карта модулей, selective reading, handoff и методика измерения. Изменение готовится отдельным PR; возврат к D после его приёмки. Подробности — [протокол](../operations/ai-context.md).

Далее: D / DOC-01 — проверяемый текстовый PDF и адаптация с фактологическими ограничениями; порядок конкретных работ уточняется по [backlog](backlog.md). Завершить разрешённую проверку канала B и DATA-01 до E. Постоянное хранение package/approval/attempt нужно до реальной отправки, даже если каталог остаётся в Sheets.

## Известные ограничения

- Remote, страна найма и язык — отдельные сигналы; отсутствие данных не доказывает доступность. Фильтр HTML не исключает ролевые строки из CRM.
- Нет semantic dedup между разными posting ID, автоматического подтверждения закрытия вакансии и монотонной защиты last_seen_at от старого события.
- Sheets upsert не транзакционен; lock не защищает от другого рабочего каталога или ручного writer.
- Приватные факты и результаты хранятся локально; localStorage не гарантирует сохранность черновика между браузерами. JSON export/import — доступный перенос.
- CI работает, но обязательный merge gate через branch protection/ruleset отдельно не настроен. Не сливать PR с pending/failed checks.
- PostgreSQL, LLM matching, multi-user auth и hosted SaaS не реализованы.

## Сохранённые решения

n8n остаётся локальным; облако не получает доступ к localhost. Сохраняем collector, ID и ручные поля. Backup/restore drill и image digest отложены пользователем до изменения инфраструктуры или второго пользователя; это не блокер документальных правок и текущего matching/resume кода. Auth/isolation обязательны до второго пользователя, внутренняя БД n8n не является продуктовой.

Календарные сроки не обещаны. Резюме и автоотклики остаются в scope. [Релизы](../operations/releases.md) привязаны к проверенному commit; опубликованные теги не переносить. История прежних состояний — в Git и release notes, а не в дописываемых взаимоисключающих разделах этого документа.
