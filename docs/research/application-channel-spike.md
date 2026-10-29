# APP-01 — проверка канала откликов, итерация 1

Дата: 2026-10-29. Статус: controlled HTTP spike готов; реальный browser channel
не проверен, этап B целиком не закрыт. Реальных откликов работодателям не отправляли.

## Вывод и выбор

Первый кандидат на browser adapter — Greenhouse hosted application form: уже есть
источник вакансий и публичное чтение вопросов. Это выбор для следующей проверки,
не утверждение о поддержке автоматического Submit на всех Greenhouse-формах.

Greenhouse Job Board GET публичный; POST приложения требует Job Board API key.
Ключ создаётся пользователем Greenhouse Recruiting с разрешением управления API
работодателя. Кандидатский сервис не получает его просто благодаря публичной вакансии.
Lever Postings API тоже описывает application POST с API key; смена ATS сама по себе
не решает доступ. Официальные рекомендации обеих систем предлагают hosted forms.

Greenhouse questions содержит группы с альтернативными полями (например, resume
upload либо resume_text). Нельзя требовать оба одновременно. Consent, скрытая локация,
нестандартные вопросы и demographic answers требуют отдельного разбора; значения
за пользователя не придумываются. Чтение схемы не доказывает соответствие текущему DOM.

Источники проверены 2026-10-29:
- [Greenhouse API](https://docs.greenhouse.io/job-board)
- [Создание employer key](https://support.greenhouse.io/hc/en-us/articles/13446638483355-Create-a-job-board-API-key-for-an-integration)
- [Developer permissions](https://support.greenhouse.io/hc/en-us/articles/201122629-Developer-permissions)
- [Lever Postings API](https://github.com/lever/postings-api)

## Матрица поддержки этой итерации

| Сценарий | Статус | Evidence / следующий шаг |
|---|---|---|
| Чтение вопросов Greenhouse | implemented, read-only | фиксированный HTTPS GET, валидация job ID, unit tests; live smoke отдельно |
| Greenhouse POST от обычного кандидата без employer key | unsupported | официальная модель доступа |
| Lever POST как замена без key | unsupported для выбранной конфигурации | documented API key; партнёрский доступ отдельно не исследован |
| Стандартные видимые поля Greenhouse в браузере | required_action / unverified | проверить конкретную hosted form и разрешённый способ исполнения |
| CAPTCHA, login, email/phone verification | required_action | передача человеку, обход не реализован |
| Известная группа alternative fields | discoverable | parser сохраняет группу, не обещает browser support |
| Hidden location, consent, demographics, неизвестная схема | required_action | unknowns видны в отчёте, автоматические ответы не формируются |
| Локальная HTTP fixture + TXT upload | supported in test fixture only | фактический multipart POST и сверка байтов файла |
| Отклик с верным receipt | supported in test fixture only | accepted + receipt ID + package hash + vacancy ID |
| 200 без receipt / другой пакет / timeout после записи | submission_unknown | автоматического повторного POST нет |
| Непроверенная новая форма | unsupported для автоматической отправки | отдельный адаптер и тестовые доказательства |

## Что реализовано

`src/applications/greenhouse-form.cjs` читает публичные требования и возвращает
apiSubmission / hostedForm отдельно от обнаруженных полей. Unknown schema не становится
готовой формой; consent и sensitive sections требуют review. JobRadar не вызывает POST
Greenhouse и не использует browser/session работодателя.

`src/applications/controlled-adapter.cjs` — изолированный технический spike. Поддерживает
только HTTP numeric loopback `127.0.0.1:<port>/fixture/apply`, синтетический адрес
@example.test и небольшой resume.txt. Это не Greenhouse adapter и не реальный ATS emulator.
Приготовленный пакет копируется, получает hash; утверждение должно совпасть с точными
ответами, вакансией и байтами резюме. Изменение пакета требует новой проверки.

State: prepared → submitting → submitted либо submission_unknown. После начала Submit
повторный вызов этого же attempt не создаёт запрос. Unknown требует проверки состояния.
required_action используется до отправки, когда не хватает данных или встретилась
неподдерживаемая проверка. Прототип не является системой авторизации пользователя:
переданный approvedHash лишь проверяет binding пакета в тесте.

HTTP fixture в tests поднимается на случайном локальном порту, декодирует multipart
через стандартный Request.formData и проверяет файл. Второй сценарий записывает receipt
на стороне fixture, затем рвёт соединение. Клиент сохраняет unknown и не повторяет запрос.
Третий оставляет запрос без ответа до timeout. Проверяется также конкурентный вызов.
Fixture не ведёт постоянный журнал и не имитирует HTML/DOM, CAPTCHA или настоящий ATS.

## Как воспроизвести

Автоматически в обычном CI и локально без n8n, Google Sheets или API key:

```powershell
npm.cmd run test:applications
```

Read-only исследование конкретной вакансии (board и ID взять из Greenhouse):

```powershell
npm.cmd run applications:inspect -- BOARD_TOKEN JOB_POST_ID
```

Вывод в терминал не сохраняется сам. Не передавайте персональные ответы или CV этой
команде: она принимает только board и job ID. Сетевой ответ может измениться; unit tests
используют синтетическую схему и не зависят от живой вакансии.

## Границы доказательств и следующий gate

Этот spike подтверждает HTTP upload, binding и conservative unknown handling в
контролируемом окружении. Он НЕ подтверждает реальный browser autofill/submit, форматы
PDF/DOCX в ATS, законность/условия конкретной автоматизации, доступ кандидата к API,
устойчивость при перезапуске процесса или отсутствие дублей между разными attempt.
Прототип хранит state в памяти: новый процесс или новый объект может повторить отправку.
Поэтому он ограничен fixture и не подключается к scheduled collector или рабочей CRM.

До реальной отправки нужны: разрешённый способ автоматизации конкретной формы,
проверка реального upload и обязательных вопросов, наблюдаемое подтверждение, durable
product DB с unique user+vacancy+application policy, журналом попыток, immutable package
и transaction/lease вокруг отправки. PostgreSQL нужен до настоящих E/F, не после.

Следующая итерация B: одна выбранная hosted форма, browser adapter в локальном worker,
проверка DOM и upload без Submit; затем отдельно разрешённый end-to-end сценарий.
Прямой обход внутренних undocumented application endpoints не планируется.

## Read-only live smoke

В 2026-10-29T12:25:43.395Z публичный GET выполнен успешно: Airbnb, job 8262207,
Product Manager, API Platform. Reader обнаружил 26 групп вопросов и явно сохранил
unknown location/compliance/demographic structures. Это подтверждает чтение API
на этом job в указанный момент, а не поддержку browser automation или пригодность
вакансии кандидату. [Сводное evidence без персональных данных](evidence/greenhouse-form-smoke-2026-10-29.json).
