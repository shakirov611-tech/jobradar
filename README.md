# JobRadar

Автоматизированный поиск работы. Последний опубликованный выпуск: **[v0.6.1](https://github.com/shakirov611-tech/jobradar/releases/tag/v0.6.1)**.

## Текущее состояние

Локальный Node collector читает Greenhouse/Lever; n8n в Docker на Windows/WSL2 обновляет Google Sheets. Есть расписание, дедупликация, first_seen/last_seen, отчёты и тесты. HTML обзор по умолчанию показывает подтверждённый remote; CRM сохраняет весь ролевой каталог.

97 Node-тестов и 5 браузерных тестов прошли для v0.6.1. Локально подтверждены v0.4 и первый scheduled run v0.5; установка v0.6.1 и отдельная проверка multi-source writer ещё не зафиксированы. Генерация резюме и реальные автоотклики пока не реализованы.

Начать с [актуального roadmap](docs/product/roadmap.md), [backlog](docs/product/backlog.md) и [плана этапов](docs/product/implementation-plan-v1.md). Следующий этап — качество персонального подбора (C / MATCH-01).

## Тесты

Требуется Node.js 22 или новее. Для ESLint нужны dev dependencies: `npm.cmd ci --ignore-scripts`. Сборщик не требует их.

```bash
npm test
```

Часть тестов фиксирует известные ограничения, а не желаемое поведение. Для корректного feed отдельно проверяется эквивалентность исходному экспорту без timestamp.

## Обновление и локальная проверка

[Инструкция v0.6.1](docs/operations/remote-view-v0.6.1.md), [переход на multi-source](docs/operations/multi-source-v0.6.md), [интеграционные тесты](docs/operations/integration-tests.md).
Сохранить .env.integration и .collector-state. Облако не обращается к локальному n8n напрямую.
[Changelog](CHANGELOG.md) и [порядок выпуска](docs/operations/releases.md). Разделы ниже о ранних версиях описывают историю изменений.

## Документация

- [Аудит фактического workflow](docs/audit-workflow-export.md) — актуальные подтверждения E6 и ограничения.
- [Первоначальный аудит](docs/audit.md) — исторический срез до экспорта.
- [Архитектура](docs/architecture/current.md), [развитие](docs/architecture/evolution.md), [модель данных](docs/data-model.md), [контракты](docs/contracts.md).
- [ADR](docs/adr/README.md), [backlog](docs/product/backlog.md), [roadmap](docs/product/roadmap.md).
- [Конкурентный аудит и требования v0.2](docs/product/competitive-audit-v0.2.md), включая генерацию резюме и автоотклики в основном сценарии.
- [Локальная эксплуатация](docs/operations/local-runbook.md), [безопасность](SECURITY.md), [порядок изменений](CONTRIBUTING.md).

## Структура

| Каталог | Содержимое |
|---|---|
| src/normalization | Тело Code node n8n; не standalone module |
| workflows | Исходный очищенный экспорт и отдельный TEST workflow v0.3 |
| tests | Регрессионные проверки и наблюдавшаяся fixture |
| config | Историческая конфигурация, cached schema и обезличенный пример |
| infra/local | Исходный Compose; не готовая конфигурация изолированного восстановления |
| docs | Архитектура, аудит, решения и план |

## Известные ограничения

Одна board Airbnb; только фильтр title; нет matching по профилю, генерации резюме и отправки откликов. `first_seen_at` пока не устанавливается. Журнал запусков, расписание, retry/timeout overrides и контроль overlap не реализованы. Backup/restore и сохранность ручных полей Sheets требуют локальной проверки.

Исторические документы сохраняют первоначальные предположения; при расхождении приоритет имеют аудит E6 и инструкция v0.3. Принятие архитектурного решения не означает его внедрение.

Личный профиль, CRM, credentials, ключи шифрования и резервные копии не включены. Лицензия проекта пока не выбрана владельцем.

## Разработка одной командой

`npm test` запускает изолированные проверки, в том числе соответствие экспортируемого workflow исходнику. `npm run workflow:build` переносит актуальный jsCode в TEST workflow. `npm run test:integration` использует локальный `.env.integration` и отдельный тестовый лист; разовая настройка и ограничения — [инструкция](docs/operations/integration-tests.md). Реальный n8n/Sheets прогон из облачной среды не выполнялся.

Утверждённый [план реализации](docs/product/implementation-plan-v1.md): сейчас выполняется этап A. Сведения в нём о PR #1 относятся к моменту планирования; CI PR #1 теперь слит в main.

## first_seen v0.4

Подготовлен TEST workflow с чтением хранилища: новые вакансии получают first_seen_at, существующие сохраняют исходную дату или пустое значение. [Правила и локальная проверка](docs/operations/first-seen-v0.4.md). Нормализатор отдельно first_seen не создаёт. Интеграционный тест v0.4 ожидает проверки first-seen-created и first-seen-preserved. Backup/restore отложен пользователем и не блокирует текущую правку; локальный production workflow автоматически не обновлялся.

### Автосбор v0.5 (Windows)

После обновления файлов, сохранив `.env.integration`, из Windows PowerShell:

```powershell
npm.cmd run collector:automate
```

Сначала проверяет новый pipeline на тестовой таблице, затем включает сбор каждые
3 часа (первый — примерно через минуту). ПК, Docker/n8n и сессия Windows нужны для
работы. Не запускайте старый collector через Execute параллельно.
Результат: `npm.cmd run collector:status`; остановка расписания:
`npm.cmd run collector:schedule:remove`.
[Полная инструкция и восстановление после ошибки](docs/operations/scheduled-collector-v0.5.md).

### Техническая проверка откликов (APP-01)

`npm.cmd run test:applications` проверяет синтетический upload, receipt и обрыв связи
после отправки на локальной HTTP fixture. Ключей и n8n не требует, работодателям не пишет.
Read-only требования Greenhouse: `npm.cmd run applications:inspect -- BOARD_TOKEN JOB_POST_ID`.
Реальные автоотклики пока не реализованы. [Результаты и границы spike](docs/research/application-channel-spike.md).

### Browser spike (опционально)

Playwright изолирован в browser/, обычный collector от него не зависит.
`npm.cmd run browser:setup` устанавливает закреплённые dependencies и Chromium;
`npm.cmd run test:browser` проверяет локальную форму в браузере. Отдельный GitHub job
делает это автоматически. Live dry run: `npm.cmd run applications:browser:dry-run` —
только синтетические данные, без Submit, live POST заблокированы. Выбор файла не означает
его приём ATS. [Evidence и ограничения](docs/research/browser-dry-run.md).

### Multi-source v0.6 — текущий scheduled collector

Source registry: `config/sources.json`; начальные параметры: `config/search-profile.json`.
Greenhouse + Lever читаются локально, затем один n8n writer обновляет прежнюю CRM.
Airbnb vacancy IDs и first_seen/manual fields сохраняются. География пока размечается
в обзоре, а не исключает вакансии из CRM.

После обновления файлов, сохранив `.env.integration` и `.collector-state`:

```powershell
npm.cmd run collector:automate
```

Сначала 3 synthetic inserts из двух providers в тестовую таблицу, затем обновление
прежней Windows task. `npm.cmd run collector:preview -- --open` открывает read-only
HTML обзор всех полученных вакансий, ролевых кандидатов, geography и ошибок источников.
[Обновление, ограничения, partial и откат](docs/operations/multi-source-v0.6.md).

### Основная выдача remote — v0.6.1

`npm.cmd run collector:preview -- --open` по умолчанию показывает подтверждённый
remote из полей/описания без обнаруженных country restrictions. Только локация →
«Формат неясен», офис/обязательный hybrid → исключённая группа. Evidence видно рядом.
Google Sheets сохраняет весь ролевой каталог: строки не удаляются и last_seen не теряется.
[Правила и ограничения](docs/operations/remote-view-v0.6.1.md).

## Автоматические проверки

Push и PR запускают ESLint, проверку конфигураций, unit/fixture integration и отдельные browser tests.
Локально: `npm.cmd run check` после npm ci. [Границы CI и реальные integration tests](docs/operations/ci.md).
