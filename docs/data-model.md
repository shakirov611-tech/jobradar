# Модель данных

> Обновление 29.10.2026: получены экспорт и точный JS. Актуальные подтверждения, ограничения и результаты 12 тестов — [аудит экспорта](audit-workflow-export.md). Противоречащие ему утверждения ниже об отсутствии workflow/кода относятся к первоначальному срезу. Baseline gate ещё не закрыт.


## As-is: наблюдавшийся контракт

E4 содержит перечисленные поля; E5 добавляет last_seen_at. Заголовки и типы реальной Sheets ещё не сняты. Sheets — flat projection; следующие типы семантические, не утверждение о фактическом формате ячеек.

| Поле | Семантический тип | Правило / источник |
|---|---|---|
| vacancy_id | string | Стабильный ключ; пример greenhouse_airbnb_8262207 |
| company, title | string | Наблюдаются в E4 |
| source | string | Сейчас display value Greenhouse |
| original_url, canonical_url | URL string | В E4 совпадают; не доказана canonicalization |
| location, workplace_type | string / unknown | Remote не означает worldwide |
| language | string / unknown | Язык текста источника, не hiring requirement |
| published_at, updated_at | ISO timestamp / null | Время источника; точный mapping проверить |
| active_status | string | Наблюдаемое значение active_in_feed |
| description | string | В E4 entity-encoded HTML; raw сохранять отдельно от представления |
| first_seen_at | ISO timestamp | Первое обнаружение; не менять при обновлении |
| last_seen_at | ISO timestamp | Последнее успешное наблюдение; E5, нет в старом E4 |

Поля ручного CRM статуса, заметок, откликов и scoring в текущей таблице неизвестны. Не добавлять их по догадке к baseline.

## Целевая логическая модель (предложение)

| Сущность | Ключ и важные поля | Ограничения |
|---|---|---|
| users | user_id UUID; auth_subject; timezone | UNIQUE auth_subject; личные данные приватны |
| candidate_profiles | profile_id; user_id; version; preferences JSON; created_at | FK users; версия профиля фиксирует контекст scoring |
| source_boards | board_id; provider; board_token; enabled | UNIQUE(provider, board_token); публичный каталог |
| vacancies | vacancy_pk UUID; legacy_vacancy_id; board_id; external_job_id; title; URLs; source_updated_at; first_seen_at; last_seen_at; availability | UNIQUE(board_id, external_job_id), UNIQUE legacy_vacancy_id при наличии |
| collection_runs | run_id; board_id; started_at; ended_at; outcome; is_complete; fetched_count; error_code | outcome running/success/partial/failed; ошибка не меняет доступность |
| user_vacancies | user_id; vacancy_pk; crm_status; notes; created_at; updated_at | PK(user_id, vacancy_pk); FK users/vacancies |
| matches | user_id; vacancy_pk; profile_id; profile_version; scoring_version; score; reasons; eligibility | UNIQUE(user_id, vacancy_pk, profile_id, profile_version, scoring_version); профиль принадлежит user_id |

Все временные поля: timezone-aware, сохранение в UTC. source_updated_at отдельно от updated_at нашей записи. external_job_id — строка, scoped board; не считать numeric ID глобальным. Одинаковые вакансии в разных ATS пока остаются разными; fingerprint даёт кандидата на merge, а не автоматическое удаление.

Минимальная pilot-схема может хранить только последний match с версиями; история не обязательна. collection_runs нужна для объяснения свежести. Сроки хранения raw payload и истории выбрать до реализации; не хранить полные описания в execution logs без необходимости.

## Статусы: не смешивать три разных смысла

- availability вакансии: наблюдается в feed / неизвестно / закрытие подтверждено.
- eligibility кандидата: eligible / ineligible / unknown, с доказательством.
- crm_status пользователя: новое / сохранено / отклик / отказ / интервью / архив; окончательный enum согласовать с UX.

active_in_feed сохранить как legacy значение. active_confirmed, unverified, closed_confirmed, check_error из E2 — проектный enum, не доказанная state machine. Перед миграцией составить явную mapping table всех реальных значений; неизвестные значения не приводить молча к закрытым.

## Инварианты

1. Повторный сбор обновляет каталог, но не first_seen_at и не ручные поля user_vacancies.
2. last_seen_at меняется только при фактическом наблюдении конкретной вакансии в успешно обработанном ответе. Старое событие не уменьшает timestamp.
3. Network/429/parse error и неполный ответ не означают закрытие. Отсутствие в одном полном feed лишь повод recheck; closed_confirmed требует отдельного доказательства. Правило recheck ещё не реализовано.
4. User ID берётся из проверенной сессии backend; параметр клиента не является разрешением. Каждая приватная выборка scoped user_id; FK на профиль не должен позволять чужого владельца.
5. Upsert на БД выполняется атомарно через unique constraint. В Sheets это не гарантировано: до миграции один writer и отсутствие overlap должны быть проверены отдельно.

## APP-01: состояния и durable граница

Controlled spike использует prepared → submitting → submitted/submission_unknown;
required_action обозначает остановку до отправки. Submitted требует receipt, связанного
с вакансией и hash пакета. Это ещё не продуктовая таблица applications.

До E/F: application_packages связывает user_id, vacancy_id, profile_version,
answers_version, artifact hashes; approval связывается с immutable package ID/hash.
Application intent имеет уникальную политику на user+vacancy (включая допустимый reapply),
а attempts хранят started_at, transport outcome, receipt/evidence и next_action.
Unknown блокирует новую попытку до reconciliation. Уникальное ограничение и reservation
в БД обязательны до side effect; in-memory state fixture не защищает от process crash.
Точную PostgreSQL migration проектировать в DATA-01, не использовать внутреннюю БД n8n.

## v0.6: source-scoped каталог и предварительная оценка

Greenhouse identity расширена до greenhouse_<board>_<id> (Airbnb unchanged).
Lever global — lever_<board>_<uuid>, EU — lever_eu_<board>_<uuid>. Все location posts
с разными ATS IDs пока отдельные записи; semantic equivalence не предполагается.

Local catalog сохраняет sourceId, title/location/URL, role decision/reason,
geography status/reason/workMode, unknown workAuthorization/teamLanguage. Это
диагностическая projection, не новая tenancy/product DB. В Google Sheets добавочные
поля не пишутся. Source completion хранит total, matched, roleReview, geography buckets,
inserted/updated и passed/failed. Run outcome может быть partial: успешные boards
записаны, неизвестные источники не интерпретируются как empty или closed.

## Work-mode evidence v0.6.1

Local geography дополнена visibility (main/unclear/excluded), formatReason,
evidence {source,snippet}, countryEvidence. Snippets получены из нормализованного текста,
не являются оригинальным HTML. Source summary содержит views counts только для role
candidates; matched остаётся прежним role-prefilter count. Writer payload полей CRM
не расширяется. Work authorization и язык команды по-прежнему unknown.

## Personal matching v0.7.0

search-profile.json сохраняет version=1; optional matching содержит policy, primaryRoles/secondaryRoles, preferredSeniority, preferredTeamLanguages, remoteOnly=true. Старый профиль без matching работает с unconfigured/review.

В catalog добавлены matching {policy,decision,family,seniority,languages,reasons,gaps,unknowns,exclusions}, reviewText (до 12000 символов), reviewTextTruncated и descriptionHash (SHA-256 нормализованного текста анализа до 120000 символов). Языковой сигнал хранит тип team/requirement и evidence; язык текста не является языком команды. Не подменяет прежнее geography.teamLanguage=unknown подтверждённым фактом.

Review snapshot хранит profile/fingerprint, policy, observedAt, sourceResults и records с contentHash; snapshotId — SHA-256 содержимого. Labels schemaVersion=1 с snapshotId, profileFingerprint, policy, answers {vacancy_id,contentHash,label,reason}. label: suitable/unsuitable/uncertain, reason до 500 символов. Чужие/повторные/устаревшие ответы отклоняются. Результат содержит матрицу решений, unlabeled/uncertain отдельно; это не population accuracy. Эти поля не пишутся в Sheets.

## Условия и оценки v0.7.1

`geography.policy=remote-bg-v2` версионирует правила условий отдельно от personal-match-v1. Catalog также хранит исходный `workplaceType` (строка или Unknown); CRM поле workplace_type не меняется. Новый snapshot перечисляет `geographyPolicies`; отсутствие этого поля в прежних снимках допускается. Непомеченные старые geography соответствуют remote-bg-v1. Fingerprint настроек и исходные snapshots не мигрируют.

Labels schemaVersion=2 сохраняет прежние привязки. `label` — suitable/unsuitable/uncertain либо null для частичного ответа; reason остаётся строкой до 500 символов. Необязательный `assessment` содержит только известные ключи: `roleInterest` и `conditions` (suitable/unsuitable/uncertain), `description` (readable/unreadable). Отсутствующее измерение = unrated; это не uncertain и не отказ.

Новый reader принимает v1 без assessment и v2. Матрица отражает только общие labels; частичные ответы не увеличивают labeled/complete. Отдельный assessments содержит счётчики каждого измерения, включая unrated. Комментарии старых labels не используются для вывода новых измерений. Все ответы проверяются одним валидатором перед применением в HTML или CLI. [ADR 013](adr/013-role-conditions-and-review-dimensions.md).
