# Проверки JobRadar

Тесты используют встроенный `node:test`, синтетические данные, локальные HTTP servers и HTML fixtures. Реальные профили/CRM не входят в тестовый набор. Матрица модуль→тест находится в [карте кода](../docs/architecture/codebase-map.md); команды окружения — в [CONTRIBUTING](../CONTRIBUTING.md).

| Набор | Что проверяет | Чего не доказывает |
|---|---|---|
| `npm test` / `tests/*.test.cjs` | Нормализация, sources/pagination/errors, matching, storage preparation, workflow consistency, runner lifecycle/locks, resume packages, controlled application HTTP | Совместимость конкретного установленного n8n, production Sheets, live ATS Submit |
| `npm run test:browser` / `browser/tests/*.test.cjs` | Controlled forms, request policy, catalog/review DOM, drafts/import/export и approval на синтетическом профиле | Правильность всех live форм, сохранность localStorage между браузерами, качество настоящего CV/PDF |
| `npm run test:integration` | Временный workflow в локальном n8n и отдельной тестовой Sheets: insert/dedup/update, даты, ручные поля, cleanup | Долговременную стабильность scheduler, multi-user isolation и restore |
| `npm run collector:test` | Синтетический сценарий текущего collector через локальный n8n и тестовую таблицу | Полноту live источников и работу production writer |
| `npm run check` | ESLint, config contracts и Node-набор | Browser-тесты и живую интеграцию — они отдельные |

Точные задания — [.github/workflows](../.github/workflows). [CI](../docs/operations/ci.md) не получает секретов и не обращается к пользовательскому localhost.

Выбирайте регрессию по изменяемому поведению, не копируйте реализацию в assert и не удаляйте существующий тест, чтобы скрыть сбой. Для JSON workflow проверяйте встроенный код и обе производные версии после сборки. Для browser JS/HTML одной Node-проверки недостаточно.

Fixture `normalized-vacancy.observed.json` — историческая сокращённая запись; это не полная runtime schema. Новые тесты должны использовать минимальные обезличенные данные и явно отличать ошибку источника от успешного пустого результата.

Числа passed/failed и SHA фиксируйте в PR/результате CI, а не в постоянно устаревающей строке README. Незапущенный тест обозначайте как незапущенный; skipped не является passed. Будущие тесты monotonic timestamps, tenant isolation и restore добавляются вместе с соответствующей реализацией, а не объявляются существующими.
