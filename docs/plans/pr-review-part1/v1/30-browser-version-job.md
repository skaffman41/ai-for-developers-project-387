Спецификация: [#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26). Исходная задача: [#25](https://github.com/skaffman41/ai-for-developers-project-387/issues/25), часть 1. Критерии приёмки: AC-08.

## Результат

Отдельная браузерная job в `opencode-pr-review.yml` (тот же workflow, что и авторевью, общая concurrency-группа на PR):

- checkout точного `github.event.pull_request.head.sha` (не merge-коммита события) с `persist-credentials: false`;
- запись результата `git rev-parse HEAD` в отчёт шага и artifact — подтверждение проверенной версии;
- установка закреплённых инструментов (`mise install --locked`), зависимостей и Chromium, затем `mise run test:browser`;
- Actions artifact всегда, включая успешный прогон: отчёт Playwright (`playwright-report/`), при падении — trace и скриншоты (`test-results/`), плюс сохранённый вывод `git rev-parse HEAD`; имя artifact с `run_id`/`run_attempt`;
- в job нет секрета модели и нет вызова модели; после push (synchronize) проверяется новая версия PR;
- обычный CI сохраняется: `hexlet-check.yml` не меняется, `app-check.yml` продолжает полный `mise run check`.

## Критерии

- Job запускается на тех же событиях PR; устаревшая версия отменяется и заменяется проверкой новой (concurrency-группа с отменой).
- Checkout фиксирует ровно `head.sha`; сохранённый `git rev-parse HEAD` совпадает с ним.
- Artifact существует и при успехе, и при падении; содержит отчёт и (при падении) trace/скриншоты.
- Секрет модели в job недоступен; закреплённые версии сохраняются; `hexlet-check.yml` не меняется.

## Testing Decisions

- Автотест конфигурации job в том же новом тест-файле ревью-контура: YAML-проверка событий, отсутствия `OPENCODE_API_KEY`/модели, checkout по `head.sha`, шага `git rev-parse HEAD` и artifact с `if: ${{ !cancelled() }}`.
- Реальный прогон браузерной job — живая приёмка владельца после merge.
