# JobRadar

Автоматизированный поиск работы. Текущая версия: **v0.7.0**. [Описание выпуска](docs/releases/v0.7.0.md).

## Текущее состояние

Локальный Node collector читает Greenhouse/Lever; n8n в Docker на Windows/WSL2 обновляет Google Sheets. Есть расписание, дедупликация, first_seen/last_seen, отчёты и тесты. HTML обзор по умолчанию показывает подтверждённый remote; CRM сохраняет весь ролевой каталог.

113 Node-тестов и 7 браузерных тестов прошли в CI для кода v0.7.0. Локально подтверждены v0.4 и первый scheduled run v0.5; установка последующих версий и отдельная проверка multi-source writer ещё не зафиксированы. Персональный подбор v0.7.0 добавляет объяснения и выборку для оценки качества. Генерация резюме и реальные автоотклики пока не реализованы.

Начать с [актуального roadmap](docs/product/roadmap.md), [backlog](docs/product/backlog.md) и [плана этапов](docs/product/implementation-plan-v1.md). Текущий этап — качество персонального подбора (C / MATCH-01); следующий шаг — пользовательская оценка выборки.

## Тесты

Требуется Node.js 22 или новее. Для ESLint нужны dev dependencies: `npm.cmd ci --ignore-scripts`. Сборщик не требует их.

```bash
npm test
```

Часть тестов фиксирует известные ограничения, а не желаемое поведение. Для корректного feed отдельно проверяется эквивалентность исходному экспорту без timestamp.

## Обновление и локальная проверка

[Инструкция v0.7.0](docs/operations/matching-v0.7.md), [remote-выдача v0.6.1](docs/operations/remote-view-v0.6.1.md), [переход на multi-source](docs/operations/multi-source-v0.6.md), [интеграционные тесты](docs/operations/integration-tests.md).
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
| src | Нормализация, источники, matching, HTML отчёты и работа с хранилищем |
| scripts | Локальный collector, расписание, preview/review, отчёты и проверки |
| workflows | Очищенный исходный экспорт и версионированные TEST workflow |
| tests / browser | Unit/fixture integration и изолированные браузерные проверки |
| config | Реестр источников, профиль поиска, исторические snapshots и примеры |
| infra/local | Исходный Compose; не готовая конфигурация изолированного восстановления |
| docs | Архитектура, аудит, решения и план |

## Известные ограничения

Каталог ограничен подключёнными компаниями Greenhouse/Lever. Matching использует простые правила; персональная полезность ещё не измерена. Право на работу, опыт, зарплата и условия договора остаются непроверенными. Генерация резюме, реальные отклики, продуктовая БД и SaaS-изоляция не реализованы. Backup/restore отложен до изменения инфраструктуры или второго пользователя.

Исторические документы сохраняют первоначальные предположения; текущие статусы описаны в roadmap, архитектуре и инструкциях соответствующей версии. Принятие архитектурного решения не означает его внедрение.

Личный профиль, CRM, credentials, ключи шифрования и резервные копии не включены. Лицензия проекта пока не выбрана владельцем.

## Разработка одной командой

`npm test` запускает изолированные проверки, в том числе соответствие экспортируемого workflow исходнику. `npm run workflow:build` переносит актуальный jsCode в TEST workflow. `npm run test:integration` использует локальный `.env.integration` и отдельный тестовый лист; разовая настройка и ограничения — [инструкция](docs/operations/integration-tests.md). Реальный n8n/Sheets прогон из облачной среды не выполнялся.

Утверждённый [план реализации](docs/product/implementation-plan-v1.md) описывает зависимости этапов. Текущие статусы и незакрытые проверки — в [roadmap](docs/product/roadmap.md).

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

## Персональный подбор v0.7.0

После обновления файлов, сохранив `.env.integration` и `.collector-state`, выполните `npm.cmd run matching:review -- --open`.
Откроется выборка до 24 вакансий: отметьте «Подходит / Не подходит / Уточнить» и скачайте оценки JSON.
`npm.cmd run collector:preview -- --open` открывает основной обзор с объяснениями.
Профиль — `config/search-profile.json`; роли, уровень и язык команды видны в обзоре.
[Правила, экспорт оценок и ограничения](docs/operations/matching-v0.7.md). Качество не измерено до пользовательской разметки.
