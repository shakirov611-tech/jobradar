# CI: проверки до слияния

GitHub Actions запускается на push, pull_request и вручную. Workflow Tests / Quality checks:
1. Node 22, npm ci по package-lock.json (dev dependencies; lifecycle scripts отключены).
2. ESLint: синтаксис и recommended correctness rules, без принудительного форматирования.
3. JSON syntax для config, workflows и tests/fixtures; runtime-контракт sources/profile; ссылки между узлами workflow.
4. npm test: unit/regression и fixture integration через локальные HTTP mocks. Без production credentials и живой Google Sheets.

Browser fixture tests отдельно устанавливает Chromium и запускает контролируемые формы и HTML обзор.
Зелёный CI не доказывает выполнение реального n8n/Sheets: `npm.cmd run test:integration` остаётся локальным
тестом с .env.integration и отдельной тестовой таблицей. localhost пользователя недоступен hosted runner.
Не добавлять production secrets или self-hosted runner на рабочий ПК в PR workflow.

Локальная полная проверка: `npm.cmd ci --ignore-scripts`, затем `npm.cmd run check`.
Обычный collector и `npm test` не требуют ESLint; зависимости разработки нужны для lint.
Встроенные строки JS в workflow проверяются существующими execution/consistency tests, не обычным ESLint.
JSON checker не является полной схемой всех исторических reference/example файлов: для них проверяется синтаксис.

CI предоставляет результаты PR, но не создаёт branch protection. Обязательный запрет merge при красных checks
нужно отдельно включить в GitHub ruleset для main (Quality checks и controlled-browser). В этом изменении
правила доступа не менялись; до их настройки не сливать PR с failed/pending checks вручную.

Это CI, не автоматическое развёртывание: публикация релиза и обновление локальной установки — отдельные этапы.
