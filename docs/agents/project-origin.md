# Источники переноса из проекта 386

Приложение перенесено 17 ноября 2026 года в подготовленный репозиторий
[`skaffman41/ai-for-developers-project-387`](https://github.com/skaffman41/ai-for-developers-project-387).
Основание — шаг «Подготовка» проекта
[«Календарь звонков (продолжение)»](https://ru.hexlet.io/projects/387/members/54793).

Источник — рабочая ветка `docs/repeat-booking-plan` первого проекта, commit
[`ed41bc8c068ca9a5954453e740450e0cb87266eb`](https://github.com/skaffman41/ai-for-developers-project-386/tree/ed41bc8c068ca9a5954453e740450e0cb87266eb).
В новый клон скопированы отслеживаемые файлы приложения, Dockerfile, контракт,
существующие проверки, workflows, инструкции, словарь и решения. Локальные зависимости,
результаты сборки, настройки IDE, секреты и данные SQLite не переносятся.
Исходная история доступна по ссылкам и в локальной ветке `archive/project-386`.
Рабочая ветка переноса `chore/import-calendar` основана на исходном `main` проекта 387;
его `.github/workflows/hexlet-check.yml` сохранён побайтно.

## Трекер и исторические ссылки

Новые карты, спецификации и задачи относятся к
[`skaffman41/ai-for-developers-project-387/issues`](https://github.com/skaffman41/ai-for-developers-project-387/issues).
Их чтение и запись выполняются по [правилам текущего трекера](issue-tracker.md).

Существующие `docs/plans/**`, `.scratch/**`, `tracker-migration.*`, ADR,
отчёты приёмки и `CHANGELOG.md` описывают проект 386. Их номера, хеши и ссылки
сохранены; одинаковый номер в новом репозитории обозначает другую задачу.
Историческую ссылку разрешайте по её полному URL либо `repository` в manifest.
Для публикации продолжения в 387 создавайте новый план со ссылками на исходные решения.
ADR 0001 фиксирует выбор трекера в первом проекте; текущий адрес задаёт `issue-tracker.md`.

| Источник                        | Ссылка                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Основная запись на встречу      | [Спецификация #37](https://github.com/skaffman41/ai-for-developers-project-386/issues/37) и [снимок плана](../plans/booking-core/v1/spec.md)                                                                                        |
| Повторная запись                | [Спецификация #63](https://github.com/skaffman41/ai-for-developers-project-386/issues/63), [задача #64](https://github.com/skaffman41/ai-for-developers-project-386/issues/64) и [снимок плана](../plans/repeat-booking/v1/spec.md) |
| Хранение бронирований           | [Решение #31](https://github.com/skaffman41/ai-for-developers-project-386/issues/31) и [ADR 0003](../adr/0003-booking-storage.md)                                                                                                   |
| Контракт API                    | [Решение #32](https://github.com/skaffman41/ai-for-developers-project-386/issues/32), [ADR 0004](../adr/0004-api-contract.md) и [ADR 0005](../adr/0005-typespec-contract-source.md)                                                 |
| Воркфлоу агента                 | [Спецификация #1](https://github.com/skaffman41/ai-for-developers-project-386/issues/1) и [приёмка](workflow-verification.md)                                                                                                       |
| Публичный стенд первого проекта | [Задача #58](https://github.com/skaffman41/ai-for-developers-project-386/issues/58) и [отчёт Railway](../deployment/railway.md)                                                                                                     |

## Проверка и публикация

Запуск приложения описан в [README](../../README.md). Полная локальная проверка —
`mise run check`. Прежние успешные Actions относятся к проекту 386.
Успех переноса в GitHub подтверждается новым запуском `app-check` и `hexlet-check`
в проекте 387 после отдельно разрешённой публикации. До этого шаг Hexlet остаётся незавершённым.

Настройки release-please перенесены с версией приложения `0.2.0`;
`bootstrap-sha` указывает на исходный commit `main` проекта 387, чтобы первый
диапазон выпуска опирался на историю нового репозитория. Выпуски и права Actions
из проекта 386 автоматически в 387 не переносятся: перед первым выпуском проверьте
[инструкцию выпуска](../releasing.md).

Существующий Railway-стенд и исторический `render.yaml` ссылаются на проект 386.
Перенос приложения не меняет их источник, авторизацию или опубликованную версию.
