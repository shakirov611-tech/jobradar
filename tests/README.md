# План проверок

> Обновление 29.10.2026: получены экспорт и точный JS. Актуальные подтверждения, ограничения и результаты 12 тестов — [аудит экспорта](../docs/audit-workflow-export.md). Противоречащие ему утверждения ниже об отсутствии workflow/кода относятся к первоначальному срезу. Baseline gate ещё не закрыт.


Runtime тесты пока не запускались: workflow и JS отсутствуют. Fixture normalized-vacancy.observed.json — сокращённая наблюдавшаяся запись E4 без description; не эталон исправленного last_seen и не схема.

| Сценарий | Проверяемый результат | Уровень |
|---|---|---|
| Повтор того же feed | Нет новых ID; last_seen обновлён; first_seen неизменен | Integration, копия Sheets |
| Ручная заметка + новый сбор | Заметка/статус не затёрты | Integration |
| Две boards с одинаковым job ID | Разные vacancy_id | Unit после получения JS |
| Пустой complete feed | 0 наблюдений, без массового закрытия | Unit/integration |
| 429/500/timeout | Run error, без ложного закрытия | Adapter |
| Неполный/некорректный ответ | Partial/failed, не успешное отсутствие вакансий | Adapter |
| Missing fields, HTML entities | Предсказуемый reject/unknown; безопасный вывод | Unit |
| Повтор после частичной записи | Нет duplicate insert | Integration |
| Старый timestamp | last_seen не откатывается | Storage |
| Parallel run | Один writer или атомарный upsert | Integration; текущая гарантия неизвестна |
| Remote US, English description | Нет выдуманного BG eligibility/language requirement | Matching |
| Пользователь A → данные B | Доступ запрещён к профилю, CRM и match | Pilot authorization |
| Restore | Credentials читаются, workflow работает на тестовой CRM | Operations |

Пакет документации проверяется на корректность JSON, локальные Markdown links, целостность ZIP и diff whitespace. Это не заменяет runtime проверки. CI для приложения добавить после получения исполнимого кода, не создавать формально зелёный pipeline без проверяемой логики.
