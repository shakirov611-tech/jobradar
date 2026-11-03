# Sources: адаптеры и исследование покрытия

## Справочник существующих адаптеров

Реализация: [src/sources/catalog.cjs](../../src/sources/catalog.cjs), проверки: [multi-source.test.cjs](../../tests/multi-source.test.cjs). Код сверён с `be5dafe`; официальные страницы прочитаны 2026-11-03. Новых live probes в этой ревизии документации не выполнялось.

| Provider | Используемый GET | Особенности данных |
|---|---|---|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | Envelope jobs; meta.total, если есть, сверяется с длиной. Числовой или канонический decimal ID; title, location.name, absolute_url, content; metadata=null допустим |
| Lever global | `https://api.lever.co/v0/postings/{board}?mode=json&skip={offset}&limit=100` | Массив; UUID ID, text, hostedUrl, categories, workplaceType; description + lists + additional |
| Lever EU | `https://api.eu.lever.co/v0/postings/{board}?mode=json&skip={offset}&limit=100` | Тот же адаптер, отдельный source scope по region |

Официальные ссылки: [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Lever Postings API](https://github.com/lever/postings-api). Это публичные опубликованные вакансии компаний, не весь рынок и не API автоматической отправки кандидатом. Код не обращается к application POST.

Ограничения **нашего клиента**, не заявленные квоты провайдеров:

- Registry version=1, от 1 до 8 enabled sources; provider и board token валидируются, URL собирается внутри адаптера. Два источника обрабатываются одновременно.
- На источник 30 s deadline; один fetch ограничен остатком deadline или 15 s. Для transport/429/500/502/503/504 — максимум две попытки GET. Retry-After принимается при конечном значении не более 2 s, ожидание не менее 500 ms; более длинное/некорректное значение завершает источник ошибкой. Redirect отклоняется.
- Lever запрашивает не более 10 страниц по 100; страница короче 100 завершает сбор. Десять полных страниц означают JR_SOURCE_PAGE_LIMIT, включая ровно 1000 записей, чтобы не объявить усечённую выдачу полной.
- Malformed JSON/envelope, невалидный ID/тип записи или дубль ID отклоняет весь источник. collectSources сохраняет error code и failed, без raw payload; успешные источники продолжаются.
- ID включает provider/board/region; внешний ID не глобален. Пустой feed не закрывает прежние вакансии. Наблюдённые ролевые rows обновляются по vacancy_id; first_seen/manual fields сохраняются по [storage-контракту](../contracts.md).
- В описаниях возможен HTML/entities. Сохраняемый description ограничен 30000 code units, текст review — 12000; original URL не заменяется на придуманный canonical URL.

Список включённых boards — только [config/sources.json](../../config/sources.json). Не копируйте его в справочник как второй runtime config. Disabled reason — прошлое наблюдение, не гарантия нынешнего состояния API.

При изменении provider, pagination, rate policy или response format: проверить эту секцию, реализацию и тесты; затем актуальную официальную документацию и минимальный read-only probe при необходимости. Зафиксировать дату/endpoint/ошибку и компактную fixture. Не коммитить полный feed. Текущие quota/terms для нового сценария проверяются отдельно; факт чтения документации не доказывает совместимость неизвестного runtime.

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
