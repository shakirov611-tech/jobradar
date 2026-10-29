# Безопасность и приватность

Не коммитить credentials n8n, OAuth secrets/tokens, .env, encryption keys, volume dumps, CRM, реальные профили и execution/pinned data. Workflow JSON также может содержать секреты в expressions и JS: автоматическое удаление credentials блока недостаточно. Перед загрузкой в GitHub проверить diff вручную и secret scanner выбранной платформы. При утечке отозвать токен и перевыпустить credential; удаление из последнего commit не устраняет историю.

Локальный n8n остаётся на loopback. Внешний доступ не нужен для документации. Перед hosted pilot: auth, authorization по owner, защита приватных endpoints, минимальные OAuth scopes, политика retention/deletion, тесты cross-user доступа. Не выдавать n8n editor пользователям по умолчанию.

Raw vacancy HTML недоверенный: не выполнять и не отображать без безопасной обработки. Если позже появятся пользовательские board URLs, использовать allowlist provider/board tokens и защиту от запросов во внутреннюю сеть. Не реализовано этим пакетом.
