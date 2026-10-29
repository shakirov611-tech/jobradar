# first_seen_at v0.4

Статус: реализация подготовлена; интеграционный прогон v0.4 ещё нужен на локальном n8n. Production workflow не изменён из облака.

## Правило

- Новый vacancy_id: first_seen_at = last_seen_at текущего наблюдения.
- Существующий vacancy_id: first_seen_at не передаётся в update payload. В Sheets сохраняется исходная ячейка, включая пустую.
- Старое пустое значение не заполняется предположением: настоящее первое обнаружение неизвестно.
- Дубли vacancy_id в прочитанной таблице или входном наборе завершают подготовку ошибкой до записи. Не выбираем произвольную строку.

JS нормализации по-прежнему не создаёт first_seen: решение о вставке требует знания хранилища. Новая функция src/storage/prepare-vacancy-upsert.cjs выполняется после чтения существующих строк.

## Workflow

Ручной trigger → Greenhouse → Normalize → Read existing vacancies (один раз за запуск, always output при пустом листе) → Prepare vacancy upsert → прежний automatic append/update по vacancy_id.

Файл workflows/greenhouse-to-sheets.first-seen-v0.4.json содержит TEST placeholders, отключённую публикацию и не содержит credentials. Исторические baseline/v0.3 сохранены. npm run workflow:build обновляет jsCode в обоих TEST exports; storage helper встраивается в v0.4 автоматически.

Чтение всей таблицы приемлемо для текущего single-user MVP; это не транзакционный upsert. Не запускать параллельные writer workflows в один лист. Будущая DB обеспечит insert-only поле атомарно. Проверка duplicate stored IDs просматривает всю таблицу, поэтому существующий дубль остановит загрузку даже другой вакансии.

## Автоматическая проверка

npm test: unit/regression + соответствие embedded storage helper исходнику. Название старого normalization test об отсутствии first_seen относится только к нормализатору, не к итоговому storage payload.

npm run test:integration: синтетическая новая вакансия проходит тот же storage helper; проверяется создание first_seen равным первому last_seen, затем сохранение при обновлении, last_seen и ручные поля. В отчёте новые checks first-seen-created и first-seen-preserved. Legacy blank покрыт unit test; реальный Sheets regression для legacy blank отдельным запуском ещё не добавлен. API/webhook ожидания из предыдущей исправленной версии сохраняются.

Для следующего локального прогона обновить package.json и каталоги src, scripts, tests, workflows из main, сохранив .env.integration. Выполнить npm.cmd test, затем npm.cmd run test:integration. Прислать только отчёт, без ключей.

## Перенос в рабочий сборщик после теста

Нельзя исправить это заменой только старого jsCode: нужны Read existing и Prepare nodes. До локального подтверждения ничего в рабочем flow не менять. После успешного теста либо импортировать v0.4 отдельно с выбором существующего credential для ОБОИХ Sheets nodes и целевой CRM, либо подготовить отдельный автоматический перенос с явным ID рабочего workflow. Не держать два сборщика, пишущих в одну CRM, одновременно.

Rollback: прежний workflow/экспорт v0.3. Новые заполненные first_seen остаются в таблице; старый JS их не передаёт при update. Эта правка не обновляет image, volume и Docker config.

## Решение по backup

Пользователь 29.10.2026 явно отложил backup/restore ради скорости single-user MVP. Это больше не блокирует текущие обратимые изменения сборщика. Возврат к проверке восстановления — до обновлений инфраструктуры или подключения других пользователей. Не выдавать отложенную проверку за выполненную.
