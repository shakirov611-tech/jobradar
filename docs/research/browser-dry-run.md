# APP-01 — browser dry run, итерация 2

Дата: 2026-10-29. Scope: изолированная browser fixture и узкий live dry-run runner.
Реальная отправка работодателю не входит в эту итерацию.

## Наблюдение живой формы

Через облачный браузер открыта ссылка job-boards.greenhouse.io/airbnb/jobs/8262207.
Она перенаправила на `https://careers.airbnb.com/positions/8262207/?gh_jid=8262207`.
Вкладка Application содержит iframe `#grnhse_iframe`; его origin —
`https://job-boards.greenhouse.io`. В src есть временный validityToken: его нельзя
сохранять в конфигурации, документации или повторно использовать как постоянный URL.

По живому DOM подтверждены текстовые поля с accessible names First Name, Last Name,
Email и input file внутри группы Resume/CV*. Наблюдались обязательные вопросы о праве
на работу, sponsorship, профильном опыте, privacy и AI attestation. Эти вопросы не
заполнялись. Демографические ответы и согласия за пользователя не выбирались.
Поля настоящей формы не заполняли, файл не выбирали и не отправляли. Это DOM evidence,
а не успешный live autofill/upload. Роль — пример формы, не рекомендация кандидату.

## Реализация

Playwright 1.64.1 закреплён в отдельном browser/package.json и lockfile. Основной
collector и обычные unit tests не требуют браузерных зависимостей. Браузерный job CI
устанавливает только Chromium headless shell и запускает локальную HTTP fixture;
не зависит от доступности Airbnb/Greenhouse и не использует credentials.

`src/applications/browser-dry-run.cjs` создаёт новый контекст без существующей сессии,
блокирует service workers и WebSocket. Live network policy разрешает только HTTPS
GET/HEAD к точному списку hosts Greenhouse/Airbnb. Все POST/PUT/DELETE, сторонние hosts
и неожиданные порты блокируются до отправки запроса. Submit event и form submit methods
также отключены. Это защита dry run с синтетическими данными, не sandbox для произвольных
персональных данных или доверие любому JS работодателя.

Fixture policy отдельно разрешает только POST на `/fixture/upload` своего numeric
loopback origin, а `/fixture/apply` остаётся заблокированным. Только этот тест проверяет
реальную доставку байтов файла серверу. Нет live upload allowlist и нет скрытого
переключателя, разрешающего настоящую отправку.

Runner умеет прямую страницу и наблюдённый Airbnb wrapper с iframe. Находит три
однозначных стандартных поля и resume file input по accessible role/name. Заполняет
только JobRadar / Synthetic Test / candidate@example.test и выбирает автоматически
созданный TXT из памяти. Никаких локальных пользовательских файлов не читает.
CAPTCHA, login, неоднозначные или неизвестные элементы → required_action.

`dry_run_completed` означает проверенные значения трёх полей и выбранный файл,
не готовность всей application form и не приём файла ATS. remoteUploadConfirmed всегда
false для live runner; submissionPerformed всегда false. Если UI сразу загружает файл
через POST, этот запрос будет заблокирован — это ожидаемое ограничение, а не повод
считать upload успешным. Неизвестные обязательные вопросы остаются на review.

## Автоматические browser acceptance tests

- Реальный Chromium: iframe → три поля → setInputFiles → multipart upload на fixture;
  fixture подтверждает приём точного синтетического текста.
- Click Submit не создаёт application POST; прямой fetch application также блокируется.
- Неизвестный mandatory answer остаётся пустым.
- Видимая CAPTCHA или два одинаковых стандартных поля дают required_action до upload.
- Live policy блокирует upload POST даже к локальному тестовому получателю.

В текущей облачной shell-среде скачивание Chromium завершилось повреждённым/пустым
архивом. Поэтому browser suite проверяется в GitHub CI; обычные unit tests проходят
локально. Результат CI фиксируется после выполнения, не предполагается заранее.
Live DOM осмотрен отдельно доступным облачным браузером; guard runner там не запускался.

## Команды для Windows (не нужны для работающего коллектора)

Один раз, только если нужна локальная browser-проверка:

```powershell
npm.cmd run browser:setup
npm.cmd run test:browser
```

Опциональный live dry run после установки браузера:

```powershell
npm.cmd run applications:browser:dry-run
```

По умолчанию используется исследованная вакансия Airbnb. Другой ID допускается только
в узких форматах Greenhouse job URL / Airbnb positions URL. Постоянное хранение embed
src с validityToken не поддержано. Другие ATS, кастомные employer websites и локали
не объявляются поддержанными. Сеть или DOM могут измениться после исследования.

Отчёт сохраняется в `.browser-artifacts/<runId>.json` и выводится в терминал. Он содержит
только origin/path основной страницы без query, результаты проверок и method/host
блокированных запросов; не включает тела запросов, cookies и frame tokens.
Файлы отчётов не входят в Git. User data/state не переносится из cloud browser в worker.

## Остающийся gate B

Нужен проверенный live browser fill и upload в разрешённом сценарии, полный разбор
mandatory questions и проверка подтверждения до настоящего Submit. До E/F необходимы
immutable package, review и durable application state. Нынешний dry run не снимает
эти требования и не закрывает весь этап B.

Документация API: [Playwright input](https://playwright.dev/docs/input),
[network](https://playwright.dev/docs/network),
[BrowserContext](https://playwright.dev/docs/api/class-browsercontext),
[browser installation](https://playwright.dev/docs/browsers).

## CI evidence

Первая browser suite успешно прошла в Chromium на GitHub Actions:
[run 40875283916](https://github.com/shakirov611-tech/jobradar/actions/runs/40875283916).
Проверены все четыре сценария выше. Это подтверждает fixture browser path;
не является доказательством выполнения live runner на форме работодателя.
