# Источники и пределы проверки

Проверено 29.10.2026 по официальным материалам. Они дополняют аудит артефактов, а не подтверждают текущий runtime.

- [n8n: Docker](https://docs.n8n.io/hosting/installation/docker/): постоянное хранение состояния и варианты DB.
- [n8n: Backup and restore, официальный репозиторий документации](https://github.com/n8n-io/n8n-docs/blob/main/docs/deploy/host-n8n/keep-n8n-running/backup-and-restore.md): полный backup шире workflow export; ключ шифрования нужен для credentials; SQLite snapshot должен быть согласованным.
- [n8n: Which license do I need?](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case): различаются выдача результатов клиентам и предоставление возможности создавать/конфигурировать workflows. Применимость к окончательному JobRadar UX требует отдельной оценки до коммерческого pilot, без вывода «любой SaaS разрешён».

Greenhouse endpoint взят из E2, а поля — из E4. Актуальные API terms, quota и pagination в рамках этого документального аудита не проверялись; проверка — prerequisite для изменения adapter. Google Sheets node поведение должно быть проверено для фактической версии n8n по локальному экспорту.
