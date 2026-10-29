# ADR 010 — Multi-source каталог с одним writer

Дата: 2026-10-29. Статус: Accepted for implementation; local n8n path verification pending.

## Контекст

Пользователь видит только 15 вакансий Airbnb и справедливо указывает на смещение выборки.
До продолжения application spike нужно расширить источники и видеть, что именно отсекается.
Рабочие n8n/Sheets и Windows single-writer уже проверены, сложность MVP ограничена.

## Решение

Добавляем JSON source registry, два public read adapters (Greenhouse/Lever), версионированный
role prefilter и осторожную geography annotation для BG. Сбор/нормализация выполняются
в локальном Node runner под существующим lock; один n8n workflow записывает объединённые
успешные источники. Ошибка board изолирована, partial явно виден, вакансии не закрываются.
Не используем новую БД для текущего каталога; до application sends требование DB сохраняется.

Сохраняем Airbnb IDs, first_seen helper, 14 machine-owned полей и auto-map Sheets writer.
Не расширяем заголовки Sheets ради промежуточного matching. Компактный HTML/JSON каталог
показывает все полученные записи и причины; CRM содержит только ролевые кандидаты.
Публичная attribution/identity сохраняется оригинальным URL, source и company.

Неизвестное не становится reject: review остаётся в каталоге/CRM. Даже plausible BG
не считается подтверждённым разрешением на работу. Role match не называется personalized fit.
Результаты источников и неизвестное покрытие показываются раздельно.

## Альтернативы

- Добавить только больше Greenhouse компаний: проще, но сохраняет смещение одного ATS.
- Отдельный независимый workflow на каждую компанию: создаёт риск параллельных Sheets writes.
- Универсальный crawler/LLM matching: преждевременно, нет benchmark и ясных source contracts.
- Сразу product DB/UI: нужны позже; HTML review и текущая CRM достаточны для проверки выборки.

## Последствия

Новый Node orchestration использует тот же n8n lifecycle через prepare/accept hooks,
а не копию cleanup/retry логики. Legacy run доступен для отката. Source read deadlines,
pagination и payload size ограничены. Реальный новый write path проверяется installer-ом
на синтетике обоих провайдеров; HTTP mocks и VM tests не заменяют этот runtime gate.

Выборка компаний не является рынком: нужна пользовательская оценка качества и дальнейший
региональный/рыночный источник. Автоотклики приостановлены в приоритете до этой проверки.
[Операции](../operations/multi-source-v0.6.md).
