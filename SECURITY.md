# Безопасность и приватность

Не коммитить credentials n8n, OAuth secrets/tokens, .env, encryption keys, volume dumps, CRM, реальные профили и execution/pinned data. Workflow JSON также может содержать секреты в expressions и JS: автоматическое удаление credentials блока недостаточно. Перед загрузкой в GitHub проверить diff вручную и secret scanner выбранной платформы. При утечке отозвать токен и перевыпустить credential; удаление из последнего commit не устраняет историю.

Локальный n8n остаётся на loopback. Внешний доступ не нужен для документации. Перед hosted pilot: auth, authorization по owner, защита приватных endpoints, минимальные OAuth scopes, политика retention/deletion, тесты cross-user доступа. Не выдавать n8n editor пользователям по умолчанию.

Raw vacancy HTML недоверенный: не выполнять и не отображать без безопасной обработки. Текущий sources/catalog принимает ограниченные provider/board tokens и строит URL на фиксированных API hosts; произвольные пользовательские board URLs не поддерживаются. Если такая возможность появится, отдельно проверить SSRF, redirect и доступ к внутренней сети. Не включать персональные CV/facts или исходные цитаты в документацию и fixtures.
