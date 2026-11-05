# Карта кода

Основа проверена по `be5dafe`; Language v1 добавлен 2026-11-04, hh.ru — 2026-11-05. Имена ниже — поисковые якоря, не копия реализации. Начните со строки задачи, затем прочитайте её тесты и непосредственные зависимости. Все пути относительно корня репозитория.

## Основные модули

| Задача / ответственность | Файлы и интерфейсы | Зависимости | Связанные тесты |
|---|---|---|---|
| Добавить источник, исправить API/ID/pagination | `src/sources/catalog.cjs`: validateSources, sourceId, feedUrl, fetchFeed, normalizeFeed, collectSources; `config/sources.json` | matching/profile, role-and-geography, personal-match; Node fetch/crypto | `tests/multi-source.test.cjs`, `tests/hh-source.test.cjs`, `tests/personal-match.test.cjs` |
| hh.ru: поиск, details, auth, лимиты | `src/sources/hh.cjs`: validateHHSource, searchUrl, fetchHH, validateJob, workplaceType; `http.cjs`: getJson | catalog; только Node GET; настройки через multi-collector.settings(env) | `tests/hh-source.test.cjs`, `browser/tests/catalog-preview.test.cjs` |
| Исправить remote/страну/роль | `src/matching/role-and-geography.cjs`: classifyRole, classifyWorkMode, classifyGeography, descriptionText | Профиль поиска; используется sources и personal-match | `tests/remote-policy.test.cjs`, `tests/multi-source.test.cjs`, `tests/personal-match.test.cjs` |
| Языковое enrichment / cache / AI | `src/language/contract.cjs`: SCHEMA, validateAnalysis; `rules.cjs`: analyzeRules; `analyzer.cjs`: languageInput, createAnalyzer, createOpenAIProvider, createMockProvider; `prompt.cjs`: PROMPT_VERSION; `config/language-analysis.json` | Только vacancy input; Node fs/crypto/fetch; без candidate profile | `tests/language-intelligence.test.cjs` |
| Language Fit / source priorities / ручная поправка | `src/language/personalize.cjs`: languageFit, sourcePriorities; `scripts/language-runtime.cjs`: languageRuntime; `presentation.cjs`: languageSummary; `sheets.cjs`: configureLanguageSheets, verifyLanguageRows | Search profile; shared analysis; приватный override; collector/preview и auto-map n8n | `tests/language-intelligence.test.cjs`, `browser/tests/language-review.test.cjs` |
| Изменить профиль и объяснения подбора | `src/matching/profile.cjs`: validateProfile, profileFingerprint; `personal-match.cjs`: matchVacancy, languageSignals; `config/search-profile.json` | role-and-geography; вызывается sources | `tests/personal-match.test.cjs`, `tests/config-check.test.cjs` |
| Изменить выборку и импорт оценок | `src/matching/review.cjs`: buildReview, validateLabels, validateAnswers, summarizeReview; `scripts/matching-report.cjs`: createReport | Snapshot/profile hash; reports/matching-review | `tests/personal-match.test.cjs`, `browser/tests/matching-review.test.cjs` |
| Исправить каталог/HTML review | `src/reports/catalog-preview.cjs`: renderCatalog; `matching-review.cjs`: renderReview; `scripts/preview-sources.cjs` CLI | sources → matching/review; опционально resume-catalog | `tests/multi-source.test.cjs`, `tests/personal-match.test.cjs`, `browser/tests/catalog-preview.test.cjs`, `browser/tests/matching-review.test.cjs` |
| Подготовить данные к Sheets upsert | `src/storage/prepare-vacancy-upsert.cjs`: prepareVacancyUpsert(incoming, existing) | Чистая функция; встраивается в workflow builders | `tests/first-seen.test.cjs`, `tests/integration-runner.test.cjs` |
| Исправить multi-source writer/lock/summary | `scripts/multi-collector.cjs`: settings, validateEnvelope, buildMultiWorkflow, runMulti; `run-collector.cjs`: run (legacy), status, STATE | sources, scheduled-workflow, integration config, .collector-state; Sheets через n8n | `tests/multi-source.test.cjs`, `tests/scheduled-collector.test.cjs` |
| Исправить n8n lifecycle / временный тест | `scripts/integration-workflow.cjs`: validateConfig, buildWorkflow; `test-integration.cjs` CLI; `scheduled-workflow.cjs`: buildScheduledWorkflow | storage, workflow JSON, локальный n8n API; test Sheet | `tests/integration-runner.test.cjs`, `tests/integration-lifecycle.test.cjs`, `tests/scheduled-collector.test.cjs`; отдельно `test:integration` на ПК |
| Расписание и legacy deployment | `scripts/collector-schedule.cjs`, `register-collector-task.ps1`; `deploy-collector.cjs`: buildProductionWorkflow, deploy | Windows Task Scheduler, Node collector; first-seen workflow | `tests/deploy-collector.test.cjs`, `tests/scheduled-collector.test.cjs`; реальный Windows scheduler проверяется отдельно |
| Legacy Airbnb normalization и сборка JSON | `src/normalization/greenhouse-airbnb.n8n.js` — n8n Code body; `scripts/build-workflow.cjs`, `build-first-seen-workflow.cjs` | `workflows/greenhouse-to-sheets.sanitized.json` → validation-v0.3 → first-seen-v0.4; storage | `tests/normalization-baseline.test.cjs`, `tests/workflow-consistency.test.cjs`, `tests/first-seen.test.cjs` |
| Факты, допустимый состав и версии резюме | `src/resumes/package.cjs`: validateProfile, buildPackage, validateSelection; `scripts/prepare-resume.cjs`: prepare, writePackage | Приватный facts JSON, vacancy snapshot, Node crypto/fs | `tests/resume-package.test.cjs` |
| Предпросмотр/экспорт/черновик резюме | `src/resumes/document.cjs`: resumeBody, resumeDocument; `render.cjs`: renderPackage; `scripts/resume-catalog.cjs`: attachResumes, createCatalog | package, reports/catalog-preview; localStorage, exports-private | `tests/resume-package.test.cjs`, `browser/tests/resume-review.test.cjs`, `browser/tests/catalog-preview.test.cjs` |
| Исследование откликов, без production Submit | `src/applications/controlled-adapter.cjs`: prepare, submit; `greenhouse-form.cjs`: inspectForm, readForm; `browser-dry-run.cjs`: validateTarget, requestAllowed, createDryContext, fillSyntheticForm | Синтетический loopback server; Playwright; allowlisted public GET. CLI: `scripts/inspect-application.cjs`, `browser-dry-run.cjs` | `tests/application-spike.test.cjs`, `tests/browser-policy.test.cjs`, `browser/tests/dry-run.test.cjs` |
| Конфигурации и CI | `scripts/check-config.cjs`: check; `eslint.config.cjs`; `package.json`, `browser/package.json`; `.github/workflows/tests.yml`, `browser-tests.yml` | Runtime validators из multi-collector; JSON config/workflows/fixtures | `tests/config-check.test.cjs`; команды и границы в [CI](../operations/ci.md) |

Имена файлов без полного префикса внутри одной ячейки относятся к указанной там папке. `validateProfile` в matching и resumes — разные контракты: search preferences и факты кандидата соответственно.

## Документы по области

| Область задачи | Читать при необходимости |
|---|---|
| Источники и внешние API | [Справочник адаптеров](../research/source-coverage-v0.6.md#справочник-существующих-адаптеров), ADR [010](../adr/010-multi-source-catalog.md), [016](../adr/016-hh-search-source.md) |
| Writer / данные | [Контракты](../contracts.md), [модель](../data-model.md), [integration setup](../operations/integration-tests.md), ADR [004](../adr/004-identity.md), [007](../adr/007-local-scheduled-writer.md) |
| Matching / UI review | [Инструкция](../operations/matching-v0.7.md), ADR [011](../adr/011-confirmed-remote-main-view.md), [012](../adr/012-explainable-matching-review.md), [013](../adr/013-role-conditions-and-review-dimensions.md) |
| Language Intelligence | [Контракт и операции](../operations/language-intelligence.md), ADR [015](../adr/015-language-intelligence.md) |
| Резюме | [Инструкция](../operations/resume-preparation.md), ADR [014](../adr/014-local-facts-resume-review.md) |
| Отклики | [HTTP spike](../research/application-channel-spike.md), [browser evidence](../research/browser-dry-run.md), ADR [008](../adr/008-application-channel-spike.md), [009](../adr/009-browser-dry-run-boundary.md) |
| Docker / установка / релиз | [Local runbook](../operations/local-runbook.md), [releases](../operations/releases.md) |
| Передача задачи / измерение контекста | [AI context protocol](../operations/ai-context.md) |

Не загружайте все документы строки автоматически. Например, изменение текста кнопки требует renderer и browser-тест, но не полного исследования API.

## Данные, а не исходники

`config/reference/`, `tests/fixtures/`, `docs/research/evidence/` — обезличенные наблюдения и fixtures; даты evidence ограничивают применимость. `config/examples/` — примеры будущих/частичных контрактов, не runtime config.

`.env.integration`, `.collector-state/`, `config/private/`, `exports-private/` — локальные приватные данные, игнорируемые Git. Не просматривайте/публикуйте их содержимое ради общего знакомства с проектом. Для ошибки запрашивайте минимальный обезличенный результат.

Карту обновляют в том же PR, где меняются пути, интерфейсы или расположение тестов. Полное дерево доступно через `rg --files`; не поддерживайте его вторую копию здесь.

