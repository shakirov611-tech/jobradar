# Аудит фактического экспорта n8n — 29.10.2026

Статус: static/code audit + изолированные characterization tests исходного JavaScript. Это дополнение заменяет неопределённые утверждения раннего audit.md в части структуры workflow. Реальная Sheets, credentials, контейнер и резервное восстановление по-прежнему не проверены. Новый evidence E6: предоставленный пользователем JobRadar — Vacancy Collector.json. Приватный оригинал не включён в комплект.

## Подтверждённая архитектура

Manual Trigger v1 → HTTP Request v4.5 → Code v2 → Google Sheets v4.7.

- Export active=false; Schedule Trigger отсутствует. Это workflow с ручным запуском; расписание из source_config.json здесь не используется.
- HTTP URL фиксирован на Airbnb Greenhouse с content=true. Явные pagination, timeout и retry в экспорте не настроены. Значения defaults зависят от runtime версии, которую ещё нужно снять.
- Code читает только $input.first().json и фильтрует jobs по regex title. Ни source_config.json, ни candidate_profile.json в этом workflow не читаются; нет nodes загрузки профиля и AI/scoring.
- vacancy_id жёстко привязан к greenhouse_airbnb и job.id. Для текущей одной board это разумный ключ, расширять board list без изменения контракта нельзя.
- published_at = job.first_published; updated_at = job.updated_at. canonical_url копирует absolute_url без обработки.
- Sheets: appendOrUpdate; matchingColumns=[vacancy_id]; mappingMode=autoMapInputData. columns.value также содержит last_seen_at expression. Это остаточное ручное значение при автоматическом режиме, а не доказательство ручного mapping; не удалять в рамках фиксации baseline.
- last_seen_at создаётся в JS для каждого элемента. В cached schema last_seen_at указан один раз. Состояние актуального листа и возможные изменения после экспорта этим не проверяются.
- 28 cached headers, среди них notes, review_status, match_score и другие. Наличие заголовка не означает реализованный функционал. Полный список: config/reference/sheets-schema.observed.json.
- pinData пуст; Google OAuth credential reference присутствует, но сам секрет в обычном credentials reference не содержится. Для репозитория удалены credential ref, instance/workflow IDs и spreadsheet references.
- availableInMCP=true — настройка публикации workflow, не доказательство сетевой доступности localhost и не способ доступа из этой среды.

## Находки

| ID | Приоритет | Подтверждение | Риск / следующий шаг |
|---|---|---|---|
| E6-01 | P1 | first_seen_at не возвращается кодом | Новые записи этим workflow не получают first_seen; происхождение уже имеющихся значений неизвестно. Перед исправлением проверить Sheets formulas/defaults и insert-only сохранение |
| E6-02 | P1 | input.jobs || [] | Успешный HTTP ответ неожиданного формата без jobs превращается в 0 записей. Валидация envelope должна отличать ошибку от пустого feed |
| E6-03 | P1 | Нет проверки job.id | Missing ID создаёт greenhouse_airbnb_undefined; разные повреждённые записи могут совпасть по ключу |
| E6-04 | P1 | Нет retry/timeout overrides и error workflow reference | Явная устойчивость не настроена; не утверждаем, что defaults равны нулю или ошибки скрываются всегда |
| E6-05 | P1 | Regex по title | Пропускает Head of Growth/Director of Product, допускает Construction Project Manager. Это предварительный recall/precision filter, не персональная рекомендация |
| E6-06 | P1 | Не применяются профиль и geography/language rules | US-only remote остаётся в выдаче; language — поле источника, не требование к кандидату |
| E6-07 | P1 | Upsert в Sheets, без overlap guard в graph | Последовательный повтор проверен пользователем; конкурентная запись и частичный retry не доказаны безопасными |
| E6-08 | P2 | description.slice(0,30000) | Сохраняется encoded HTML, обрезка теряет хвост и может разрезать markup. Порог не обоснован контрактом; пока сохраняем как baseline |
| E6-09 | P2 | first input only | При добавлении нескольких HTTP items часть данных потеряется. Сейчас один request, поэтому это ограничение расширения |
| E6-10 | P2 | cached schema шире output | Большинство CRM/scoring fields не заполняются. Сохранность непереданных ручных значений надо проверить на копии Sheets для версии 4.7 |

Нет логики закрытия вакансий и recheck; active_in_feed выставляется каждой возвращённой записи. Поэтому массовое закрытие при пустом feed сейчас НЕ происходит. Однако существующие строки просто остаются со старыми last_seen_at. Дубликаты внутри одного feed остаются в output JS; фактическое поведение Sheets при этом требует отдельного теста.

## Проверки, выполненные здесь

Команда: node --test tests/normalization-baseline.test.cjs. 12/12 пройдены на неизменённом тексте jsCode через изолированный Node vm с подставленным $input и без сети.

Проверены: scoped ID/timestamp, отсутствие first_seen, missing jobs, неверный тип jobs, missing ID, duplicate input, false negatives/positives regex, US Remote, truncation/entities, first input only, source timestamp mapping.

Эти tests намеренно фиксируют и дефекты. Зелёный результат означает воспроизводимость наблюдения, НЕ production readiness. n8n node defaults, OAuth, Sheets upsert и runtime scheduling не воспроизводились. После исправления соответствующий characterization test заменяется требованием корректного поведения.

## Реестр полей

JS выдаёт 15 полей: vacancy_id, company, title, source, original_url, canonical_url, location, workplace_type, language, published_at, updated_at, active_status, description, last_seen_at.

first_seen_at отсутствует. Не перезаписывается кодом, но и не устанавливается для новых строк. role_family/source_job_id/remote_scope/language_requirements/salary_text/last_checked_at/match_score/priority/hard_filter_status/review_status/ai_reason/description_hash/notes не выдаются. Проверка на листе должна различать «не передано» и «передано пустое значение».

## Приоритет продолжения

1. Снять n8n version/image digest/volume и выполнить backup/restore drill по runbook.
2. На копии Sheets: две одинаковые загрузки, новая строка, ручные notes/review_status, first_seen и last_seen до/после; сверить реальный header list.
3. После этого baseline gate можно закрыть, зафиксировав известные дефекты как backlog; отсутствие дефектов не требуется, их риск должен быть понятен.
4. Первые отдельные исправления: валидация envelope и ID; first_seen insert-only; error/run summary; явные retry/timeout и single writer. Новые функции — после фиксации baseline.

Ничего в локальном runtime не изменено. Санитизированный workflow — reference для тестовой конфигурации, не замена работающему экземпляру: нужно выбрать свои тестовые Sheets и OAuth credential перед импортом/исполнением.

## Источники

- Исходный экспорт пользователя E6 и точный jsCode.
- https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/sheet-operations.md — auto mapping и append/update.
- https://github.com/n8n-io/n8n-docs/blob/main/docs/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/common-issues.md — явная настройка retry.
