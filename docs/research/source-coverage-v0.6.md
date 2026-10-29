# Source coverage v0.6 — 2026-10-29

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

Официальные API:
- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board): public GET board jobs,
  параметры content и структура fields.
- [Lever Postings API](https://github.com/lever/postings-api): public published postings,
  JSON array, skip/limit, hosted URL и workplace type. Наличие read API не даёт права
  автоматически отправлять application POST и не заменяет employer credentials.

Следующий quality gate: разметить 20–30 реальных candidates полезно/нет/unknown с причинами,
посчитать качество по источнику и ролевым группам. Затем выбирать следующий региональный
источник и корректировать правила, не подгоняя критерии под одну компанию. До этого
нельзя сравнивать число ролевых кандидатов с interview conversion или полезностью.
