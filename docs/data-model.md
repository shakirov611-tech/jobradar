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
