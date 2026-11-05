# JobRadar

Персональный поиск работы: публичные вакансии → объяснимый подбор → локальный обзор → подготовка резюме. Рабочий каталог хранится в Google Sheets через локальный n8n. Многопользовательский SaaS и автоматическая отправка откликов — дальнейшие этапы.

Текущее состояние, подтверждения и ограничения: **[roadmap](docs/product/roadmap.md)**. Опубликованные версии — [GitHub Releases](https://github.com/shakirov611-tech/jobradar/releases); содержимое ветки может быть новее последнего релиза.

## С чего начать

| Задача | Документ |
|---|---|
| Выполнить задачу с AI | [AGENTS.md](AGENTS.md), затем нужный модуль в [карте кода](docs/architecture/codebase-map.md) |
| Установить окружение и проверить изменение | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Понять компоненты и границы | [Текущая архитектура](docs/architecture/current.md) |
| Узнать следующий этап | [Roadmap](docs/product/roadmap.md), [backlog](docs/product/backlog.md) |
| Запустить локальный сбор | [Multi-source collector](docs/operations/multi-source-v0.6.md), [расписание Windows](docs/operations/scheduled-collector-v0.5.md) |
| Подключить hh.ru | [Настройка источника](docs/operations/multi-source-v0.6.md#подключение-hhru) |
| Посмотреть подбор и оценить его | [Matching review](docs/operations/matching-v0.7.md), [remote view](docs/operations/remote-view-v0.6.1.md) |
| Настроить языки и включить языковые поля CRM | [Language Intelligence](docs/operations/language-intelligence.md) |
| Подготовить резюме | [Локальные факты и review](docs/operations/resume-preparation.md) |
| Обновить установленную версию | [Порядок релиза](docs/operations/releases.md) и инструкция конкретного релиза |

## Границы работы

Node.js выполняет CLI-команды; постоянного web-сервера приложения пока нет. HTML открывается локально. n8n работает на ПК пользователя в Docker; облачные AI-сессии и GitHub Actions не имеют доступа к его localhost.

Обычные проверки используют синтетические данные. Реальная проверка n8n/Sheets запускается отдельно на ПК и в тестовой таблице: [инструкция](docs/operations/integration-tests.md). Резюме и ключи остаются приватными — [правила безопасности](SECURITY.md).

Документация не является журналом переписки: актуальные факты поддерживаются в основных документах, причины решений — в [ADR](docs/adr/README.md), история выпусков — в [CHANGELOG](CHANGELOG.md) и release notes.

