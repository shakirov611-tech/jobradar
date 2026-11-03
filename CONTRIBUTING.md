# Разработка JobRadar

Правила AI-работы — [AGENTS.md](AGENTS.md); компоненты и тесты — [карта кода](docs/architecture/codebase-map.md). Этот документ — единая точка входа для окружения и команд. Источник команд — [package.json](package.json).

## Окружение и проверка

Нужен Node.js >=22; CI использует Node 22. Выполняйте команды из корня с package.json. В PowerShell используйте `npm.cmd` вместо `npm`, если запуск npm.ps1 запрещён.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`check` последовательно запускает lint, проверку конфигураций и Node-тесты. Для работы над конкретным модулем: `node --test tests/resume-package.test.cjs` (выберите файл из карты); перед готовностью PR выполните общую проверку. Не используйте реальные профили в тестах.

Browser-тесты имеют отдельный lockfile и окружение:

```sh
npm run browser:setup
npm run test:browser
```

На Linux могут потребоваться системные зависимости Chromium; способ их установки для hosted runner закреплён в [.github/workflows/browser-tests.yml](.github/workflows/browser-tests.yml). Не меняйте рабочий Docker ради browser fixtures.

## Основные команды

| Команда | Действие и условия |
|---|---|
| `npm test` | Node unit/regression и fixture integration; без n8n и Sheets |
| `npm run lint`, `npm run check:config` | Статический анализ и JSON/runtime config проверки |
| `npm run workflow:build` | Пересобирает два производных legacy workflow; проверить diff JSON и consistency tests |
| `npm run test:integration` | Реальный локальный n8n + отдельная тестовая Sheets; [настройка](docs/operations/integration-tests.md) |
| `npm run collector:test` | Синтетический прогон текущего collector через локальный n8n в тестовую таблицу |
| `npm run collector:preview -- --open` | Читает live sources, сохраняет локальный каталог; не пишет Sheets |
| `npm run collector:run` | Пишет рабочую CRM через n8n; это не команда проверки |
| `npm run collector:status` | Читает локальные отчёты и lock; не запускает сбор |
| `npm run collector:automate` | После test-run устанавливает Windows task с production-сбором; [инструкция](docs/operations/scheduled-collector-v0.5.md) |
| `npm run collector:schedule:status`, `npm run collector:schedule:remove` | Проверяет / снимает задачу Windows |
| `npm run matching:review -- --open` | Создаёт контрольную выборку; [работа с оценками](docs/operations/matching-v0.7.md) |
| `npm run matching:report -- <labels.json> --open` | Читает оценки и соответствующий локальный snapshot |
| `npm run resume:prepare -- <facts.json> <snapshot.json> <vacancy_id> --open` | Локальный пакет резюме; [формат и review](docs/operations/resume-preparation.md) |
| `npm run resume:catalog -- <facts.json> <snapshot.json>` | Каталог со ссылками на приватные пакеты без нового сбора |

Аргументы в угловых скобках замените своими путями/ID. Резюме не требует n8n или env. Команды collector/preview/review, содержащие `--env-file` в package.json, требуют существующий `.env.integration`, даже когда не пишут Sheets. Образец — [.env.integration.example](.env.integration.example); значения заполняются локально.

Legacy `collector:setup` и `collector:run:legacy` остаются для совместимости; это не основной multi-source путь. [Установка legacy workflow](docs/operations/collector-setup.md).

## n8n и типичные ошибки

Не запускайте второй Compose поверх существующего volume. Проверка действующей установки и перенос — [local runbook](docs/operations/local-runbook.md). Тестовые spreadsheet/tab должны отличаться от production; вкладка теста начинается с `JR_TEST_`.

| Симптом | Проверка |
|---|---|
| ENOENT package.json | Найдите корень проекта; при ZIP может быть вложенная папка jobradar-main |
| Missing script | Сверьте имя с package.json; команды вставляйте отдельными строками |
| Не найден .env.integration | Уберите расширение .txt, сохраните рядом с package.json; ключи не отправляйте в чат/Git |
| Не доступен localhost | Убедитесь, что Docker/n8n запущены на том же ПК; облачный runner не видит этот адрес |
| Webhook 404 / cleanup 409 | Runner уже ограниченно повторяет подтверждённую регистрацию/удаление; смотрите отчёт, не нажимайте Execute для временного теста |
| Сохранён lock / неоднозначный timeout | Проверьте workflow и исход записи до повтора; порядок восстановления — [scheduled collector](docs/operations/scheduled-collector-v0.5.md) |
| Chromium отсутствует | Выполните browser:setup; прочитайте ошибку системных зависимостей, если она осталась |

## PR и документация

Отдельная ветка → минимальное изменение → релевантные проверки → PR. Merge только после разрешения и успешных checks финальной версии. CI и его пределы — [ci.md](docs/operations/ci.md); автоматического deployment нет.

Обновляйте только затронутые основные документы. Для нового архитектурного ограничения используйте [ADR template](docs/adr/template.md), для незавершённой работы — [handoff](docs/operations/ai-context.md#передача-незавершённой-задачи). Обязательного нового Issue или нового ADR для каждой мелкой правки нет. Документальная правка не требует копии CRM; изменения инфраструктуры/данных оцениваются по своему scope.
