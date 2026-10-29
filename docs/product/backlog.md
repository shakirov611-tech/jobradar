# Product Backlog

> Обновление 29.10.2026: получены экспорт и точный JS. Актуальные подтверждения, ограничения и результаты 12 тестов — [аудит экспорта](../audit-workflow-export.md). Противоречащие ему утверждения ниже об отсутствии workflow/кода относятся к первоначальному срезу. Baseline gate ещё не закрыт.


Состояние на 29.10.2026. Оценки относительные: S до 1 сессии, M несколько сессий, L отдельная итерация; не обещание сроков. Все implementation задачи — To do. Документация этой версии — Draft.

| ID | Приоритет / размер | Результат для пользователя | Acceptance criteria | Зависит от |
|---|---|---|---|---|
| JR-001 | P0 / M | Воспроизводимый baseline | Санитизированный workflow, точный JS, versions, trigger, board list, Sheets mapping и заголовки; расхождения E1–E5 разрешены | Локальный экспорт |
| JR-002 | P0 / M | Можно восстановить рабочий сервис | Полный приватный backup; изолированный restore без записи в исходную CRM; измеренное время | JR-001 |
| JR-003 | P0 / S | Настройки понятны и не теряются | Для каждого параметра указано действующее место; E2 помечен legacy либо сверен; нет второго скрытого config | JR-001 |
| JR-004 | P0 / M | Повтор не портит CRM | Два одинаковых прогона: уникальные ID неизменны; last_seen растёт; first_seen/заметки сохранены; заголовки уникальны | JR-001,002 |
| JR-005 | P1 / M | Ошибка не превращает вакансии в закрытые | Проверены 429, 5xx, malformed и partial feed; нет ложного закрытия; видна ошибка запуска | JR-004 |
| JR-006 | P1 / M | Нормализация проверяема | Существующий JS вынесен без изменения логики; fixtures и regression tests проходят | JR-004 |
| JR-007 | P1 / S | Предсказуемые обновления | Текущий digest зафиксирован; отдельный upgrade/rollback checklist проверен | JR-002 |
| JR-008 | P1 / M | Видно, когда поиск работал | run_id, время, outcome, counts и последнее успешное обновление; без секретов в logs | Baseline gate |
| JR-009 | P1 / M | Выдача полезнее сырого каталога | Версионированные критерии; unknown не rejection; US-only не считается BG eligible; причины видны; ручная оценка выборки | Baseline gate,006 |
| JR-010 | P1 / M | Пилот соответствует реальной задаче | Интервью 3–5 кандидатов; определены onboarding, полезная вакансия, успех и ожидания свежести; scope pilot | Baseline gate |
| JR-011 | P1 / L | Приватные данные изолированы | Backend auth; product DB migration; unique upsert; tests A/B deny cross-user access; backup/rollback; владелец каждого CRM поля | JR-010,009 |
| JR-012 | P1 / L | Удобное начало без ручного JSON | Минимальный UI: профиль, выдача, причина match, CRM статус, свежесть/ошибка; usability test и исправления | JR-011 |
| JR-013 | P1 / M | Работа без включённого ПК | Hosting ADR, мониторинг, secrets, проверенный restore; n8n licensing review для выбранного UX | JR-010,011 |
| JR-014 | P2 / M | Новые источники без поломки модели | Один новый adapter, свои fixtures, scoped IDs и текущие terms/rate limits проверены | JR-006,009 |
| JR-015 | P2 / M | Нет повторных уведомлений | Только после UX проверки: consent, timezone, delivery dedup, retry и unsubscribe | JR-012 |
| JR-016 | Later / L | Экономически устойчивый SaaS | Billing/support/deletion, цена и cost per useful vacancy обоснованы на pilot | Pilot gate |

Не брать сейчас: Kubernetes, микросервисы, массовый scraping LinkedIn, автоматические отклики, LLM scoring без baseline качества, billing до подтверждения ценности. Это ограничения текущего scope, не запрет на будущее.

## Уточнение scope и evidence E6
JR-001: экспорт/JS/узлы/mapping получены, остаются runtime version, headers и local regression. Резюме, autofill и автоотклики включены в core scope и больше не относятся к откладываемым функциям. Их реализация следует за baseline gate: technical spike канала → подтверждённые факты и документы → assisted → automatic selected list → rules-based selection. Gmail sync отдельно необязателен.

## Актуальный implementation срез 2026-10-29, v0.5

Эта таблица уточняет первоначальные To do выше, которые отражают исторический аудит.

| Область | Статус / evidence |
|---|---|
| Runtime baseline | n8n 2.45.5, local Docker; исходный workflow сохранён |
| Backup/restore (JR-002) | Отложен пользователем до infrastructure update / второго пользователя |
| Нормализация (JR-006) | Код и регрессионные тесты в Git, CI включён |
| Повторные записи (JR-004) | v0.4 подтверждён пользователем в тестовой и рабочей таблицах |
| Настройка collector | v0.4 автоматический импорт/Sheets wiring подтверждён пользователем |
| Ошибки/наблюдаемость (JR-005/008) | v0.5: reports, counts, last success, пустой результат, timeout, lock; локальные тесты пройдены, новый runtime pending |
| Расписание | v0.5: task каждые 3 часа, test-first installer; Windows/runtime pending |
| Auto-apply канал | Следующая продуктовая техническая проверка по согласованному плану, до реализации отправок |

Остаются ограничения нормализации: текущий title regex, отсутствие геофильтра,
entity-encoded description, ручная оценка полноты upstream. Они не исправлены v0.5.

## После подтверждения scheduled v0.5

- COL-01 / JR-008: первый scheduled production run подтверждён пользователем;
  repeat cadence остаётся наблюдать, внешних notifications нет.
- APP-01, итерация 1: read-only requirements + controlled HTTP upload/receipt/unknown
  реализованы. API key constraint проверен по официальным источникам. Реальный
  browser channel, upload и разрешённый Submit — To do; epic не закрыт.
- DATA-01: durable package/approval/attempt state обязателен до реальных отправок;
  in-memory test prototype не переносить в production adapter.
