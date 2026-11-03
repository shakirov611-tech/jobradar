# Внешние источники и пределы проверки

Основной справочник существующих job-source адаптеров — [source coverage](research/source-coverage-v0.6.md#справочник-существующих-адаптеров): endpoints, ограничения клиента, ошибки, дата сверки и официальные ссылки. Не копировать сюда API-контракты.

Для изменения n8n-интеграции:

- [Официальный n8n REST API](https://docs.n8n.io/api/) — вход в authentication/reference; страница проверена 2026-11-03. Применимость отдельного endpoint зависит от установленной версии.
- Текущий код использует локальный `/api/v1/workflows`, создание, activate/deactivate и удаление workflow, затем собственный production webhook. Реальные retry/cleanup правила — в scripts и [contracts](contracts.md), тестовый setup — в [integration-tests](operations/integration-tests.md).
- [n8n Docker](https://docs.n8n.io/hosting/installation/docker/) и [backup/restore](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/host-n8n/keep-n8n-running/backup-and-restore.md) — источники первоначального аудита 2026-10-29; перед изменением установки проверить заново. [Local runbook](operations/local-runbook.md) содержит границы безопасного переноса.
- [n8n licensing](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case) — историческая ссылка для отдельной оценки окончательного hosted UX до коммерческого пилота; этот аудит не подтверждает правовой вывод.

Официальная документация дополняет код и версионные тесты, но не является доказательством запуска на ПК. Не считать старую ссылку или успешный fixture-тест достаточной проверкой актуальной версии API.
