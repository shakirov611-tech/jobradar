# Первая правка: validation v0.3

Дата: 29.10.2026. Статус: реализовано и проверено изолированно; в локальный n8n пользователя не установлено.

## Изменение поведения

Отсутствующий/неверный envelope jobs → JR_INVALID_FEED; не object элемент → JR_INVALID_JOB; отсутствующий или некорректный ID → JR_INVALID_JOB_ID. В ошибку попадает индекс, но не содержимое вакансии. ID допускается как положительный safe integer number либо каноническая десятичная строка без ведущих нулей. Строка не преобразуется в number, поэтому её точность не теряется. Для Airbnb ожидаемые целочисленные ID и текущие vacancy_id сохраняются.

Весь jobs array проверяется до фильтрации. Если одна запись повреждена, Code node бросает ошибку до выдачи любых items в Sheets. Это осознанный fail-fast без quarantine в первой правке: повреждённая нецелевая вакансия тоже останавливает run. Корректный jobs: [] возвращает [] без ошибки. Здесь нет journal run/status: успешный пустой ответ виден только в n8n execution.

Не изменены regex, output fields, fallback values, truncation description, source timestamps и last_seen_at. first_seen_at по-прежнему отсутствует; duplicate feed IDs не устранены. Типы других полей и metadata пока не валидируются отдельным контрактом.

## Файлы

- src/normalization/greenhouse-airbnb.n8n.js — обновлённое тело Code node.
- workflows/greenhouse-to-sheets.sanitized.json — сохранённый baseline E6.
- workflows/greenhouse-to-sheets.validation-v0.3.json — новый TEST workflow. Отличается от baseline именем, jsCode, отключённой MCP публикацией; active=false. В нём placeholders Sheets и отсутствует credential reference.
- tests/normalization-baseline.test.cjs — 20 regression/characterization tests; часть фиксирует ещё не исправленные ограничения.

## Как проверить локально

1. Сохранить экспорт действующего workflow. Для этой правки не менять образ n8n, volume, credentials и compose.
2. В Google Sheets сделать копию CRM для тестирования. В существующей тестовой строке заполнить notes и review_status контрольными значениями, записать first_seen/last_seen и число строк.
3. В n8n создать отдельный workflow через Import from File: greenhouse-to-sheets.validation-v0.3.json. Убедиться, что имя оканчивается TEST, scheduled triggers отсутствуют, MCP publication выключена.
4. В Google Sheets node выбрать имеющийся Google OAuth credential, тестовую таблицу и лист Vacancies. Обновить cached schema при необходимости. Сохранить appendOrUpdate, autoMapInputData и match vacancy_id. Убедиться, что нигде не выбрана исходная CRM.
5. Запустить вручную дважды. Проверить отсутствие новых дублей при повторе, обновление last_seen, неизменность notes/review_status и ранее заполненного first_seen. Для новой записи first_seen пока ожидаемо пустой, если его не заполняют отдельно formulas.
6. Проверить валидный пустой ответ и неверный envelope в отдельной тестовой копии входа Code node (например, pinned HTTP output в TEST workflow): jobs: [] → 0 items; объект без jobs → JR_INVALID_FEED; jobs: [{id:null,title:'Product Manager'}] → JR_INVALID_JOB_ID. Проверить, что Sheets не исполнялся. После теста удалить pinned data.
7. Если проверки успешны, в исходном workflow заменить ТОЛЬКО текст Code node кодом из src/normalization/greenhouse-airbnb.n8n.js. Не менять исходную Sheets config на placeholders нового workflow. Повторить ручной прогон и сохранить export версии.

При ошибке вернуть прежний jsCode из baseline export. Ошибка валидации сама ничего не записывает; если после корректного прогона обнаружена порча CRM, восстановить поля из предварительной копии. Backup/restore инфраструктуры и runtime version остаются незакрытыми задачами baseline; эта локальная проверка их не подменяет.

## Проверка в среде разработки

node --test tests/normalization-baseline.test.cjs → 20 passed, 0 failed. Проверены invalid envelope/job/ID, index-only errors, valid empty feed и эквивалентность корректного output baseline без last_seen timestamp. Проверка n8n runtime / реальной Sheets не выполнялась.
