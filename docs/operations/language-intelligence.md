# Language Intelligence v1

Доступно начиная с v0.8.0. [Обновление](../releases/v0.8.0.md) отделено от включения новых колонок CRM. Не считать fixture-проверки подтверждением работы установленного n8n или качества реальной модели.

## Поток и настройки

collectSources → общий language analysis → personal match → локальные catalog/review → опциональные поля CRM. collectSources анализирует все нормализованные вакансии, а не только предпочитаемый язык. Existing role filter для CRM не меняется. VacancyLanguageAnalysis не содержит профиль/score; UserVacancyMatch хранит language_fit. [Решение и альтернативы](../adr/015-language-intelligence.md).

`config/language-analysis.json` — настройки провайдера, словари aliases и posting_markers. Добавление кода/названий языка не требует изменения JS. Принимаются распознаваемые Node Intl коды ISO 639 из 2–3 строчных букв, `und` обозначается null. `provider=rules` включён по умолчанию; консервативные EN/RU конструкции дают только прямые признаки. Нераспознанная формулировка остаётся unknown. Определение языка текста по markers — эвристика; source hint используется только для publication.

Для семантического анализа: выбрать доступную модель с Structured Outputs, задать `provider=openai` и её точное имя в `model`. Добавить `JR_LANGUAGE_API_KEY` в локальный `.env.integration`. Само наличие ключа не включает AI. Не передавать ключ в n8n workflow; запросы делает Node. `JR_LANGUAGE_CONFIG` позволяет указать другой JSON. Live модель в этой задаче не вызывалась; model-specific доступ/стоимость проверяются при включении.

Первый пользователь настроен в `config/search-profile.json`: preferred ru/en с весами, candidate ru native/en A2, unknown team → review, strength high. Это данные одного пользователя, не глобальное правило. Другой профиль задаётся существующим `JR_SEARCH_PROFILE_FILE`. Старый profile без language_preferences сохраняет прежний fingerprint и legacy preference fallback. Новый профиль использует personal-match-v2; старые snapshots не переписываются.

## Контракт

Нормативная структурная схема — `SCHEMA` в `src/language/contract.cjs`; validator дополнительно проверяет codes, дубли и точное вхождение evidence. Текущая версия — language-v1.

| Поле анализа | Смысл |
|---|---|
| posting_language / posting_evidence | Код или null; excerpt из title/description/posting_hint или null |
| required_languages[] | language, level (A1…C2/native/null), mandatory, scope=role/customer, confidence, evidence |
| team_languages[] | language, basis=explicit/inferred, confidence, evidence; пусто означает unknown |
| evidence | field + quote (непустой точный фрагмент переданного нормализованного текста, до 500 символов); posting_hint запрещён как доказательство требований/команды |
| language_confidence | Минимальная ordinal confidence сигналов (low/medium/high), null без сигналов; не вероятность |
| language_analysis_status | completed — прямые сигналы; needs_review — неизвестное/предположение/усечение; pending — бюджет AI исчерпан; failed — сбой, сохранены доступные rules-сигналы |
| input_hash | Хеш title, нормализованного текста, posting hint и хеша полного исходного description |
| language_analysis_version / model / prompt_version | Версии алгоритма, модели и промпта; rules без AI prompt |
| language_analyzed_at / error_code | Дата результата и безопасный код; raw provider errors не публикуются |

Массивы ограничены 16 сигналами; неизвестные поля/schema/code/выдуманная цитата отклоняются. Вход в rules использует существующий descriptionText с пределом 120000 символов; AI получает ограниченный текст, по умолчанию 20000 символов description и 1000 title. Хеш включает полный исходный description, поэтому изменение хвоста инвалидирует кэш. AI-усечение всегда помечается needs_review.

Языковые предпочтения: preferred_team_languages[{language,weight:0..1}], candidate_languages[{language,level}], unknown_team_language_policy=review/keep, preference_strength=low/medium/high. Валидатор запрещает дубли и неизвестные уровни. Fingerprint профиля включает эти настройки.

Language Fit возвращает независимые requirements (meets/mismatch/unknown), requirement_details, team_preference и rank_boost. Сравнение CEFR — порядковое; native выше C2. Fluent/proficient не превращается в уровень. Отсутствие языка в профиле — unknown, не автоматический mismatch. Требование низкой/средней confidence, failed/pending анализ или неизвестный уровень не дают жёсткого отказа. Optional/альтернативное требование не используется как mandatory.

Team preference — мягкая: explicit даёт вес предпочтения, inferred четверть веса, затем множитель strength (0.25/0.5/1). Используется для сортировки внутри одной категории решения; это не match probability. При обязательном несовпадении уровня персональная категория excluded, но вакансия остаётся в общем каталоге и CRM. Unknown team при policy review даёт review. Professional/язык/география/overall представлены отдельными dimensions; профессиональная оценка по-прежнему частичная, без сопоставления всех навыков.

## Кэш, ошибки и стоимость

Кэш `.collector-state/language-cache/` используется preview и multi-source collector. Key зависит от input, algorithm version, provider/model, prompt version и текста, schema, словарей и input limit; не от кандидата, бюджета или timeout. Изменение профиля пересчитывает только fit. Одинаковые одновременные запросы внутри одного процесса объединяются; durable JSON пишется через временный файл/rename. Межпроцессного AI lock нет: два независимо запущенных preview могут дублировать оплаченный запрос.

По умолчанию максимум 20 provider attempts за запуск, 15 s на попытку, 2 попытки на анализ; timeout/invalid JSON/evidence не теряют вакансию. HTTP auth/config failure не повторяется. failed-кэш удерживается 5 минут; pending не закрепляется как completed. При недоступном ключе collector сохраняет вакансии и видимый failed-статус. При повреждении кэша выполняется повторный анализ; ошибка записи кэша учитывается в stats, без потери вакансии. Success/unknown переиспользуется до изменения key. Невалидная конфигурация требует исправления до запуска.

Отчёт language_processing содержит attempts (`ai_calls`, включая ошибки до отправки), cache_hits/failures/cache_errors/budget_deferred. Реальная стоимость и token usage не измеряются. Официальная основа optional transport: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat), проверено 2026-11-04. Промпт и version — `src/language/prompt.cjs`; изменение содержания тоже инвалидирует кэш.

## Локальная проверка и CRM

После получения этой версии сначала обычный preview:

```powershell
npm.cmd run collector:preview -- --open
```

AI-ключ не нужен для rules. В HTML видны язык публикации, команда/предположение/unknown, обязательные уровни и ограничения профиля. В JSON сохраняется полный анализ. Выбор remote/географии остаётся прежним.

По умолчанию новые колонки Sheets не отправляются. Для включения:

1. В отдельной тестовой вкладке проверить строку заголовков. Добавить **только отсутствующие** `language_analysis` и `language_fit` справа; каждое имя должно встретиться ровно один раз без пробелов. Существующий `language` не переименовывать; новые поля машинные, ручные исправления в них будут перезаписываться.
2. Включить флаг только для текущего окна PowerShell и выполнить команду ниже. Она использует synthetic feed, тестовую таблицу и rules независимо от AI config; настройки установленного расписания не меняются.

```powershell
$env:JR_LANGUAGE_SHEETS = '1'
try { npm.cmd run collector:test } finally { Remove-Item Env:JR_LANGUAGE_SHEETS }
```

3. Проверить `status: passed`, `cleanup: completed`. Генератор включает read-back языковых JSON после upsert; отсутствие или неверное значение не считается успехом. Existing first_seen/last_seen/manual-field integration остаётся доступной через `npm.cmd run test:integration`.
4. После успешного теста добавить только отсутствующие два заголовка в рабочую таблицу. Затем добавить `JR_LANGUAGE_SHEETS=1` в `.env.integration`. Очередной collector:run или установленное расписание применит enrichment.

Map Automatically сохраняется; handlingExtraData=error запрещает неявное создание новых колонок. Генератор обновляется сам из кода, импортировать workflow вручную не нужно. Legacy collector:setup/run:legacy и сохранённые JSON baseline остаются прежними. При ошибке read-back или неоднозначном результате сначала проверить оставленный workflow/lock по [runbook](scheduled-collector-v0.5.md), не повторять запись вслепую.

Rollback opt-in: удалить/выключить JR_LANGUAGE_SHEETS; дополнительные колонки можно оставить, новые записи их не затрагивают. Это не удаляет данные. Если заполненные columns уже использованы пользователем, сохранять их как историческую проекцию, не объявлять свежими без language_analyzed_at.

## Ручная корректировка

Задать `JR_LANGUAGE_OVERRIDES=config/private/language-overrides.json`. Формат: version=1, overrides[]; элемент содержит vacancy_id, input_hash из preview JSON, reviewed_at ISO, note и analysis. Analysis — ровно четыре поля SCHEMA: posting_language, posting_evidence, required_languages, team_languages. Взять их из записи preview и исправить; цитаты должны буквально присутствовать в текущем тексте вакансии. Внешние сведения о компании пока сюда не переносить.

При изменении текста старый hash помечается stale, некорректные evidence — invalid, данные не применяются. Валидная поправка участвует только в личном match и language_review, общий кэш не меняется. В SaaS это будущая owner-scoped UserVacancyLanguageReview. Удаление записи отменяет поправку при следующем preview; старые snapshot JSON сохраняются. UI-редактор и валидация внешнего источника — следующие итерации.

## Discovery и оставшаяся работа

language_source_priorities содержит **все** источники, role_count, explicit_team_count, unknown_team_count, preference_yield и processing_cost=null. Yield — средний персональный boost среди ролевых записей данного сбора, не точность на рынке. На MVP это подсказка для выбора дополнительных boards, без отключения остальных или изменения scheduler. Для адаптивного бюджета нужны исторические расходы, sample size, пользовательские labels, fairness/exploration и сравнение качества; интерфейс уже отделён от списка fetch.

`config/examples/company-language-signals.json` — только структура будущих signals: company ID, team/company scope, язык, источник, observed_at/expiry и confidence. Сейчас автоматически не применяется. До использования нужно доказать соответствие team ID вакансии; один team signal не обобщается на компанию.

Проверки: `npm run check` включает language unit/pipeline/transport mocks и старые регрессии; `npm run test:browser` включает проверку языка в каталоге. CI не выполняет live AI и локальный n8n. Перед production rollout остаются реальный тест двух новых колонок и, при включении AI, оценка выбранной модели на размеченной выборке. Общая geographic policy всё ещё BG; PostgreSQL и tenant isolation не реализованы этой задачей.
