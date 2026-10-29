# Локальный runbook

Команды выполняет владелец на своём компьютере в каталоге ДЕЙСТВУЮЩЕГО compose. Облачная среда их не выполняла. Вывод с секретами не коммитить.

## Снять доказательства без изменения установки

```bash
docker compose ps
docker compose exec n8n n8n --version
docker inspect jobradar-n8n --format '{{.Image}}'
docker inspect jobradar-n8n --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

Зафиксировать version, image ID/digest (локально уточнить RepoDigests образа), фактическое имя volume, дату. Не использовать полный docker inspect / compose config в публичных материалах: там могут быть секреты. Не делать pull до фиксации версии.

В редакторе n8n экспортировать workflow JSON. Сохранить приватный оригинал отдельно. Для Git удалить credentials identifiers, spreadsheet IDs, email, instance URLs, pinned data, execution data, встроенные auth headers и секреты в expressions/Code nodes. Проверить экспорт вручную. Сохранить JS точно как есть, режим Code node и версию node. Не менять поведение ради санитизации рабочего workflow.

В Google Sheets снять уникальный список заголовков, число строк/unique vacancy_id, форматы дат. Подготовить 2–3 обезличенные строки и execution summary повторного запуска: число insert/update/error, first_seen до/после, last_seen до/после. Проверки выполнять на копии CRM, не на production листе.

## Backup / restore

Перед любым обновлением: приватно сохранить Compose, версию образа, реальную конфигурацию, workflow и полную согласованную копию .n8n volume, включая ключ шифрования. Узнать фактическое имя volume через mount inspection: Compose может добавлять project prefix. При SQLite остановить n8n на время копирования либо применить согласованный snapshot. Если обнаружится внешняя DB — резервировать её отдельно. Учесть дополнительные storage mounts, если есть.

Экспорт workflow не заменяет backup credentials и состояния. Не менять существующий encryption key на случайный новый: сохранённые credentials должны оставаться читаемыми. Не применять down -v. Backup с credentials хранить шифрованно вне репозитория и вне исходного диска.

Restore drill: изолированный compose project, другой container_name, другой localhost port и ОТДЕЛЬНЫЙ volume; восстановить копию, закрепить исходную версию образа, не запускать trigger, не разрешать запись в исходную Sheets. Проверить вход, наличие workflow, чтение credentials и ручной прогон на тестовую CRM. Зафиксировать время восстановления и утрату данных относительно snapshot. Подробные команды копирования составить после выяснения Windows/WSL пути и имени volume, не подставлять guessed values.

## Ограничение установки из пакета

infra/local/docker-compose.yml — неизменённый артефакт E1, НЕ безопасный restore compose. Запуск из нового каталога способен создать новый project-scoped volume и конфликт container_name. До переноса проверить project name и mount. Pinning версии оформить отдельным PR после backup, baseline и проверки совместимости.
