# ADR 008 — Проверка candidate-side канала до реализации отправки

Дата: 2026-10-29. Статус: Accepted for spike; production channel unverified.

## Контекст

Коллектор v0.5 прошёл первый scheduled production run на Windows: 190 получено,
15 отобрано, 0 новых, 15 обновлено, cleanup completed, lock null, task result 0.
Следующий риск — реальная отправка кандидатом, а не дальнейшее развитие сборщика.
Публичные GET вакансий не дают employer credentials для POST приложений.

## Решение

Исследуем Greenhouse hosted form как первый кандидат на browser adapter. Сейчас
реализуем read-only discovery вопросов и отдельную controlled HTTP fixture для
upload/confirmation/unknown handling. Не смешиваем fixture support с поддержкой ATS.
Stage B остаётся открытым до проверки реальной формы и разрешённого end-to-end.

В fixture связываем review с точными байтами и ответами через package hash, принимаем
успех только по receipt, а неизвестный результат не повторяем автоматически. State
прототипа в памяти применяется только к loopback fixture. До реальных отправок вводим
durable application state в продуктовой PostgreSQL и отдельную модель approval.

## Альтернативы

- Предположить, что Greenhouse POST публичный: противоречит документации доступа.
- Сменить ATS на Lever и считать доступ решённым: документация тоже описывает key.
- Сразу делать универсальный browser robot: слишком много неизвестных форм.
- Объявить автоотклики готовыми по upload в fixture: неверная граница evidence.

## Последствия

Нет реальных отправок в этом релизе. Рабочие n8n, Sheets и Windows task не меняются.
Следующая проверка требует конкретной формы, локального browser runtime и контроля
подтверждения; неизвестная проверка передаётся пользователю. Подробности и источники:
[APP-01](../research/application-channel-spike.md).
