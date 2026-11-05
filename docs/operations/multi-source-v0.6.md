# Multi-source collector

Статус: код, изолированные тесты и read-only live preview; новый n8n write path
нужно подтвердить локальной синтетической проверкой перед рабочим запуском.

## Обновление одной командой после копирования файлов

Скачайте обновлённый проект, сохраните `.env.integration` и `.collector-state`
(особенно running.lock). Не удаляйте lock при обновлении и не запускайте manual Execute.
Обновите package.json, config, src, scripts, tests, browser/tests и docs.

```powershell
cd C:\Projects\jobradar-main\jobradar-main
npm.cmd run collector:automate
```

Команда использует прежние ключи. Сначала новый writer получает синтетический payload
трёх провайдеров (Greenhouse, Lever, HH): 5 записей входа, 4 ролевых кандидата, 4 вставки в отдельную тестовую
таблицу; строительный Project Manager исключён. Guard тестовой таблицы сохраняется.
Никаких реальных ATS запросов из test mode нет. При успешном тесте переустанавливается
прежняя Windows task: первый production run примерно через минуту, далее каждые 3 часа.
Лимит исполнения задачи увеличен с 10 до 15 минут; Docker и n8n config не меняются.

Затем:

```powershell
npm.cmd run collector:status
```

Ожидайте mode production, status passed, lock null и sourceResults по каждой компании.
`partial` означает, что некоторые источники не получены, но успешные обработаны.
Ошибка источника не закрывает вакансии и не очищает старые строки. При partial lock
освобождается после подтверждения writer; lastSuccessfulProduction остаётся от прежнего
полного успеха. Exit code partial — 1, чтобы не скрывать деградацию в планировщике.
При неизвестном исходе webhook/ошибке cleanup действует прежняя остановка с lock.

## Обзор качества без записи в CRM

```powershell
npm.cmd run collector:preview -- --open
```

Это только GET опубликованных вакансий: n8n/Sheets не вызываются. CLI загружает `.env.integration`
для optional config paths и credentials. Только HH получает свой JR_HH_ACCESS_TOKEN; n8n/Google credentials не отправляются источникам. Обзор автоматически
открывается в Windows и сохраняется в `.collector-state/preview.html`.
Для чтения public configs без env-файла: `node scripts/preview-sources.cjs`.

Обзор показывает:
- по каждому источнику: состояние, весь полученный объём, прошедших фильтр ролей;
- все полученные вакансии, включая исключённые фильтром, и причину;
- фильтры роли / география / текстовый поиск;
- предварительную географию: plausible, review, restricted; неизвестное видно.

Полный JSON preview содержит нормализованные ролевые строки и компактный каталог всех
полученных записей; HTML не содержит полных описаний и ничего не отправляет в ATS.
Автосбор тоже сохраняет `<runId>.catalog.json`, `<runId>.catalog.html` и preview.html.
Успешный test run временно заменяет preview.html синтетическим обзором; production
run или collector:preview заменяет его реальным. Catalog включает вакансии всех
профессий для аудита отсечений, Google Sheets — только прошедшие фильтр ролей.

## Конфигурация

`config/sources.json`: provider greenhouse/lever/hh, board token, отображаемая company,
enabled; для Lever region global/eu. URL строится кодом, произвольные endpoints и
credentials не принимаются. Disabled entries не читаются: причина может быть историческим отказом board или отсутствием локальной настройки HH. Активных источников может быть 1–8, source IDs уникальны.
До добавления board проверьте официальный careers link и read-only результат.

`config/search-profile.json`: страна BG, remote preference, версия role policy,
unknown policy review. Это начальные настройки одного пользователя, не onboarding
или универсальный профиль для любой страны. Другая country пока отклоняется явно.
Optional `.env.integration`: JR_SOURCES_FILE / JR_SEARCH_PROFILE_FILE указывают на
собственные локальные файлы. Не храните в source config секреты.

Штатный v0.6 использует новый registry. Старые config/reference/source_config.snapshot.json
и normalization greenhouse-airbnb.n8n.js — historical baseline, не второе место настроек
нового коллектора. Manual import и collector:setup остаются v0.4; для v0.6 используйте
collector:automate / collector:run. Они не требуют ручного создания 6 workflows.

## Поведение и ограничения

- Источники читаются в Node под тем же exclusive lock, по два одновременно. Полученные
  ролевые строки передаются одному n8n writer через одноразовый localhost webhook.
- Greenhouse целый board читается одним GET. Lever пагинируется по 100, максимум 10
  страниц и 30 секунд на источник. Незавершённая pagination — ошибка, не полный feed.
  GET имеет до 2 попыток только на transport/429/некоторые 5xx, timeout запроса до 15с.
- Обрабатываются metadata null и пустой feed. Malformed IDs/title/content, duplicate ID
  или schema error отбрасывают источник целиком; остальные продолжаются.
- Пустой успешный board отличается от ошибки. total означает сумму по успешным boards,
  а не оценку числа вакансий в недоступном источнике. matched — ролевой prefilter,
  не число персонально подходящих вакансий. HH total считает загруженные неархивные details; coverage отдельно показывает ограничение поиска. roleReview выделяет неоднозначные роли.
- Identity: greenhouse_<board>_<id>; для Airbnb прежний greenhouse_airbnb_<id> неизменен.
  Lever global: lever_<board>_<uuid>; EU: lever_eu_<board>_<uuid>. ID не глобален между
  компаниями/ATS. Semantic dedup одной должности в нескольких location posts не выполнен.
- Google Sheets schema прежняя: новые столбцы не нужны. Новая география и reasons
  живут в HTML/JSON отчёте; география не отсекает CRM и не пишет ручные CRM поля.
- Role policy добавляет Director/VP of Product и Head of Growth; исключает строительные
  Project Manager и смежные product marketing/design/analytics. Generic Growth и
  Project/Delivery остаются кандидатами с review. Текущее персональное ранжирование и язык описаны в [matching](matching-v0.7.md) и [language](language-intelligence.md).
- BG/worldwide дают только plausible; Europe/EMEA/remote — review, а не доказанную
  доступность найма. Явные US/Canada/UK location indications и onsite preference
  conflicts помечаются restricted. Анализ использует также отдельные правила текста описания, но не все оговорки (особенно RU) и не подтверждает work authorization.
- Старые строки, которые новый role prefilter не выбрал, не удаляются и не закрываются;
  их last_seen не растёт. Полная reconciliation источника и CRM availability — отдельная задача.
- Payload rows ограничен 8 MiB до отправки в n8n. До записи проверяются run ID,
  принадлежность источнику, totals, дубликаты, timestamp и владение полями. notes/review_status
  и входной first_seen не допускаются. First_seen helper и auto-map writer сохранены.

## Подключение hh.ru

HH-01 добавлен после v0.8.0 и включается отдельно; без настройки прежние источники продолжают работать. Детали API/полей/бюджетов — [справочник](../research/source-coverage-v0.6.md#hhru-search-и-details). Это сбор вакансий, без авторизации соискателя, резюме HH и откликов.

1. Зарегистрируйте приложение на [dev.hh.ru](https://dev.hh.ru/) и получите **access_token приложения** по официальной [инструкции](https://github.com/hhru/api/blob/master/docs/authorization_for_application.md). JobRadar ожидает готовый токен; получение/refresh в этой итерации не автоматизированы. Не публикуйте client_secret/token и не отправляйте их в чат.
2. В существующую `.env.integration` добавьте `JR_HH_ACCESS_TOKEN` и `JR_HH_USER_AGENT` с названием/версией приложения и вашим действительным email. Пример синтаксиса — `.env.integration.example`. Пока оставьте HH disabled; `JR_HH_ENABLED=1` будет постоянным включением для расписания.
3. После обновления файлов выполните локальный synthetic writer test, затем read-only preview с HH только в текущем PowerShell:

```powershell
cd "C:\Projects\jobradar-main\jobradar-main"
npm.cmd run collector:test
$env:JR_HH_ENABLED = "1"
npm.cmd run collector:preview -- --open
Remove-Item Env:JR_HH_ENABLED
```

`collector:test` использует только фикстуры и отдельную JR_TEST таблицу, токен HH ему не нужен. После нормализации synthetic HH-ссылки заменяются на example.test, чтобы прежний guard тестовой таблицы принимал следующие запуски. Успех: status passed, cleanup completed, inserted 4. Реального n8n из облака не проверяли; этот запуск подтверждает локальную запись. Не продолжайте после ошибки writer, сначала проверьте её отчёт.

Preview не пишет в Sheets. Проверьте строку hh.ru, работодателей и ссылки вакансий, языковые пояснения и колонку покрытия. «Неполная выборка» означает лимит поиска/изменение выдачи/недоступные details; это не весь рынок. Москва в location не подтверждает и не отрицает возможность работы из BG. Неизвестные условия требуют review; язык сайта не подтверждает язык команды.

4. После проверки добавьте `JR_HH_ENABLED=1` в `.env.integration`. Существующее расписание прочтёт настройку при следующем запуске; переустанавливать его и нажимать Execute не нужно. При необходимости разовый запуск — `npm.cmd run collector:run`, статус — `npm.cmd run collector:status`. Не запускайте writer параллельно из другого каталога.

Новые n8n nodes, credentials и столбцы для HH не нужны: API читает Node, прежний writer автоматически сопоставляет машинные поля. `.env.integration`, `.collector-state` и приватные профили сохраняются при обновлении. Legacy `collector:setup` / `collector:run:legacy` не собирают HH.

Отключение без удаления данных: `JR_HH_ENABLED=0` в env. Для других запросов/лимитов используйте `search` единственного `hh/search` entry; личный config можно хранить через `JR_SOURCES_FILE`. Не добавляйте отдельные HH entries для каждого query и не меняйте board, иначе нарушится единый scope ID.

Диагностика: `JR_HH_ACCESS_TOKEN_REQUIRED` / `JR_HH_USER_AGENT_REQUIRED` — локальные настройки; HTTP 401/403 — токен, доступ приложения или ограничение HH, без автоматического обхода; 429 — отложите следующий запрос; `JR_SOURCE_DEADLINE` — общий бюджет времени; `JR_HH_INVALID_*` — конфиг или несовместимый ответ. Ошибка HH сохраняет успешные источники как partial, не закрывает старые вакансии. Успешный тест на mocks не подтверждает разрешения приложения и live-качество выборки.

## Откат без удаления вакансий

Для возврата scheduled runner к v0.5 добавьте в `.env.integration`:
`JR_COLLECTOR_MODE=legacy`. Старое расписание прочтёт значение на следующем запуске;
collector:automate тоже проверит legacy pipeline. Удаление строки возвращает v0.6.
Разовый legacy запуск: `npm.cmd run collector:run:legacy`; не параллельно с task.
Уже добавленные вакансии других компаний остаются в CRM. Не делать откат очисткой таблицы.

## Дальше

После локального writer test и production run разметить выборку 20–30 кандидатов:
полезно / не подходит / неизвестно + причина. Оценить роли, страны, seniority и языки,
только потом вводить hard exclusions и расширять покрытие. Набор компаний — стартовая
выборка, статистическая репрезентативность рынка не доказана. Следующий тип источника
с поиском по рынку/региону выбирать отдельно; 2 ATS не равны всему рынку вакансий.

Live preview: 6 активных companies, 751 полученная запись, 52 role candidates;
[evidence и ограничения покрытия](../research/source-coverage-v0.6.md).
Greenhouse meta.total, если присутствует, должен совпасть с jobs.length: явное
усечение считается ошибкой источника. Для Retry-After свыше 2 секунд запрос сразу
откладывается до следующего сбора вместо раннего повторного обращения.
