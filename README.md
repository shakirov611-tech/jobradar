# JobRadar

Автоматизированный поиск работы. Текущая версия: **v0.3 — проверка ответа Greenhouse и ID вакансий**.

## Что уже есть

Локальный n8n в Docker / Windows / WSL2: ручной запуск → Greenhouse Airbnb → JavaScript → Google Sheets. Сопоставление автоматически по именам полей, append/update по `vacancy_id`, обновление `last_seen_at`.

В v0.3 добавлена проверка структуры ответа и положительного целочисленного ID до передачи записей в Sheets. Исходный экспорт сохранён для сравнения. Новая версия проверена 20 изолированными тестами; внедрение в локальный n8n и интеграционная проверка Google Sheets ещё не подтверждены.

## Тесты

Требуется Node.js с поддержкой `node:test`. Зависимости npm не нужны.

```bash
node --test tests/normalization-baseline.test.cjs
```

Часть тестов фиксирует известные ограничения, а не желаемое поведение. Для корректного feed отдельно проверяется эквивалентность исходному экспорту без timestamp.

## Локальная проверка

Следовать [инструкции v0.3](docs/operations/validation-v0.3-rollout.md). Новый workflow импортируется отдельно и настраивается на копию CRM. JSON содержит placeholders таблицы и не содержит credential reference. Не заменять работающий экземпляр без тестового прогона и сохранённого исходного экспорта.

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
