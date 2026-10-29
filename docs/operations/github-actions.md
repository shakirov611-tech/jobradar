# Автоматические тесты GitHub Actions

Workflow Tests запускается при push, Pull Request и вручную из Actions после попадания в default branch. Job Normalization tests выполняет `node --test tests/*.test.cjs` на Node.js 22. Установка npm зависимостей не нужна.

Проверяются все текущие 20 regression/characterization tests. Часть фиксирует известные ограничения. Зелёный CI не доказывает корректность Google Sheets или локального n8n: workflow не обращается к ним и не разворачивает приложение.

Результат доступен во вкладке Actions и в checks Pull Request. При ошибке раскрыть Run regression tests. Не нужны Google credentials, secrets или открытый localhost. Права токена ограничены чтением; timeout 5 минут; старый запуск той же ветки/PR отменяется новым.

После слияния workflow будет работать и в main. Обязательный запрет merge при красных тестах требует отдельного правила защиты ветки; эта правка его не настраивает. Локальные integration tests n8n/Sheets остаются следующим этапом.
