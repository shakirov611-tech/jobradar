# Sources: адаптеры и исследование покрытия

## Справочник существующих адаптеров

Общая реализация: [src/sources/catalog.cjs](../../src/sources/catalog.cjs), проверки: [multi-source.test.cjs](../../tests/multi-source.test.cjs). Код сверён с `be5dafe`; официальные страницы прочитаны 2026-11-03. Новых live probes в этой ревизии документации не выполнялось.

| Provider | Используемый GET | Особенности данных |
|---|---|---|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | Envelope jobs; meta.total, если есть, сверяется с длиной. Числовой или канонический decimal ID; title, location.name, absolute_url, content; metadata=null допустим |
| Lever global | `https://api.lever.co/v0/postings/{board}?mode=json&skip={offset}&limit=100` | Массив; UUID ID, text, hostedUrl, categories, workplaceType; description + lists + additional |
| Lever EU | `https://api.eu.lever.co/v0/postings/{board}?mode=json&skip={offset}&limit=100` | Тот же адаптер, отдельный source scope по region |
| hh.ru | `https://api.hh.ru/vacancies` → `/vacancies/{id}` | Поиск → полный detail, [отдельные ограничения](#hhru-search-и-details); employer берётся из вакансии |

Официальные ссылки: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api). Это публичные опубликованные вакансии компаний, не весь рынок и не API автоматической отправки кандидатом. Код не обращается к application POST.

Ограничения **нашего клиента**, не заявленные квоты провайдеров:

- Registry version=1, от 1 до 8 enabled sources; provider и board token валидируются, URL собирается внутри адаптера. Два источника обрабатываются одновременно.
- Для Greenhouse/Lever на источник 30 s deadline; один fetch ограничен остатком deadline или 15 s. Для transport/429/500/502/503/504 — максимум две попытки GET. Retry-After принимается при конечном значении не более 2 s, ожидание не менее 500 ms; более длинное/некорректное значение завершает источник ошибкой. Redirect отклоняется.
- Lever запрашивает не более 10 страниц по 100; страница короче 100 завершает сбор. Десять полных страниц означают JR_SOURCE_PAGE_LIMIT, включая ровно 1000 записей, чтобы не объявить усечённую выдачу полной.
- Malformed JSON/envelope, невалидный ID/тип записи или дубль ID в нормализуемой ленте отклоняет весь источник. HH search объединяет повторные ID до details. collectSources сохраняет error code и failed, без raw payload; успешные источники продолжаются.
- ID включает provider/board/region; внешний ID не глобален. Пустой feed не закрывает прежние вакансии. Наблюдённые ролевые rows обновляются по vacancy_id; first_seen/manual fields сохраняются по [storage-контракту](../contracts.md).
- В описаниях возможен HTML/entities. Сохраняемый description ограничен 30000 code units, текст review — 12000; original URL не заменяется на придуманный canonical URL.

Список включённых boards — только [config/sources.json](../../config/sources.json). Не копируйте его в справочник как второй runtime config. Disabled reason — прошлое наблюдение, не гарантия нынешнего состояния API.

При изменении provider, pagination, rate policy или response format: проверить эту секцию, реализацию и тесты; затем актуальную официальную документацию и минимальный read-only probe при необходимости. Зафиксировать дату/endpoint/ошибку и компактную fixture. Не коммитить полный feed. Текущие quota/terms для нового сценария проверяются отдельно; факт чтения документации не доказывает совместимость неизвестного runtime.

## hh.ru: search и details

Реализация: `src/sources/hh.cjs`; общий GET transport: `src/sources/http.cjs`; интеграция: `catalog.cjs`. Тесты: `tests/hh-source.test.cjs`, synthetic collector и browser catalog fixture. Документация проверена **2026-11-05**; живой вызов с токеном ещё не выполнен.

Официальные источники: [search](https://api.hh.ru/openapi/redoc#tag/Poisk-vakansij/operation/get-vacancies), [detail](https://api.hh.ru/openapi/redoc#tag/Vakansii/operation/get-vacancy), [авторизация](https://github.com/hhru/api/blob/master/docs/authorization.md), [токен приложения](https://github.com/hhru/api/blob/master/docs/authorization_for_application.md), [ошибки](https://github.com/hhru/api/blob/master/docs/errors.md), [регистрация](https://dev.hh.ru/).

API требует User-Agent/HH-User-Agent; неавторизованный поиск может требовать CAPTCHA уже после первого запроса. Клиент требует bearer token и contact header заранее. Параметр `host=hh.ru` выбирает сайт, а не страну найма; `area` задаёт географию поиска. API допускает до 100 элементов страницы и глубину выдачи 2000; неизвестные параметры могут игнорироваться сервером, поэтому локальный конфиг имеет whitelist. Актуальный параметр формата — `work_format`; `schedule` устаревает.

**Наши ограничения, не квоты HH:** от 1 до 6 queries; periodDays 1–30, perPage 1–100, maxPages 1–5 на query, maxVacancies 1–100 на запуск. Значения по умолчанию находятся только в `config/sources.json`. Опциональные areaIds (до 10) и workFormat не зависят от языкового профиля. Поиск идёт по названию (`search_field=name`) с сортировкой по publication_time. Страницы запросов чередуются; очередь уникальных ID также чередует запросы до применения detail budget.

HH имеет общий deadline 120 s; GET до 15 s, между попытками минимум 250 ms. Дополнительно действуют общие bounded retry/Retry-After правила выше. 401/403/CAPTCHA не повторяются и не обходятся; нет анонимного fallback. URL деталей строится из проверенного ID на фиксированном origin, `url` из search response не используется. Токен не попадает в n8n workflow, Sheets, каталог, report или заголовки других провайдеров. Транспорт не сохраняет сырые error bodies.

Detail: `id` → `hh_search_<id>`; `name` → title; `employer.name` → company (при отсутствии — «Не указан»); `area.name` → location; полный HTML `description` → общий нормализатор; `alternate_url` → original/canonical (проверенный HTTPS hh.ru, без обращения по ссылке); `published_at` сохраняется, updated_at остаётся неизвестным. Единственный work_format REMOTE/ON_SITE/HYBRID отображается в remote/on-site/hybrid; смешанные/новые значения — Unknown, затем обычный анализ текста. При отсутствии work_format допустим legacy schedule.remote. Поле `languages` HH **не** означает язык публикации или команды; v1 анализирует требования из полного текста, structured languages ещё не участвует в fit.

Search envelope/ID и полный detail проверяются. Schema/HTTP failure отклоняет HH целиком, сохраняя другие источники. Detail 404 или archived=true пропускается с отдельным счётчиком. Удаление/закрытие CRM не выполняется. Отсутствие в ограниченном окне не доказывает закрытие; last_seen растёт только у реально полученных ролевых строк. Между queries дедупликация по native ID; между HH и другими ATS semantic dedup отсутствует.

`source.coverage` хранится в локальных JSON/HTML отчётах и completion summary: period_days, queries (text/found/pages_fetched/ids_seen/complete), unique_candidates, detail_limit, details_fetched, unavailable, archived, truncated, complete. `total` — полученные неархивные details, **не** сумма found разных queries. Полнота относится только к заданному окну. Изменение found/повторение страниц не объявляется полным snapshot; неизменный found тоже не гарантирует атомарную выдачу. Ограничение страниц/details даёт successful status с неполным coverage; недоступность API даёт failed/partial. Это разделение позволяет не считать каждый ожидаемый бюджетный предел сбоем расписания.

Новые колонки Sheets не нужны. Языковые JSON-поля остаются opt-in по существующей инструкции. Существующий content cache повторно использует неизменённый языковой анализ; сами HH details запрашиваются заново. Настройка и локальная приёмка — [runbook](../operations/multi-source-v0.6.md#подключение-hhru); причина выбора — [ADR 016](../adr/016-hh-search-source.md).

## Историческое покрытие — 2026-10-29


[Read-only evidence](evidence/multi-source-smoke-2026-10-29.json) получен реальными
public GET с новым кодом нормализации. n8n/Sheets в этой проверке не вызывались.

| Компания | Provider | Получено | Ролевые кандидаты |
|---|---|---:|---:|
| Airbnb | Greenhouse | 190 | 17 |
| PandaDoc | Greenhouse | 9 | 6 |
| Grafana Labs | Greenhouse | 129 | 9 |
| Canonical | Greenhouse | 314 | 15 |
| Tide | Greenhouse | 96 | 4 |
| Superside | Lever | 13 | 1 |
| Всего | 2 ATS, 6 companies | 751 | 52 |

Из 52: plausible 1, review 36, restricted 15 по узкой BG/location policy. Это не
52 рекомендации и не 1 доказанно подходящая вакансия. В частности, Superside Project
Manager имеет delivery_domain_needs_review: область/язык/уровень нужно сверить.
Указание Europe/EMEA, слова remote и существование компании в BG не считаются
доказательством доступности любой её роли из BG. Sample source diversity увеличена,
статистическая репрезентативность не установлена.

Поиск источников включал проверку публичных company boards и фактического API:
- Manychat board вернул успешный пустой jobs array: сохранён disabled с причиной;
- Hostinger global и EU endpoints вернули 404: disabled, не входит в 6 источников;
- Grafana metadata null оказался валидным вариантом: адаптер исправлен и повторный
  live preview успешен, не превращаем null в schema error;
- Remote/GitLab/другие непроверенные бренды автоматически не добавлялись. Отдельные
  probes remotecom/nordsec были пустыми, miro/preply — 404 и не включены в registry.

Scope: public, published company jobs через официальные read APIs. Не scraping
личных аккаунтов, не закрытые LinkedIn/HH данные. Оригинальные URL сохраняются в CRM.
Числа изменятся на следующем сборе; это timestamped observation, не гарантированный
размер выдачи. Semantic duplicates по разным location post IDs пока остаются раздельными.

Это исторический срез покрытия, а не актуальный размер каталога или следующий этап. Результаты последующей оценки и текущий приоритет — в [roadmap](../product/roadmap.md). Число ролевых кандидатов не равно полезности или interview conversion.

