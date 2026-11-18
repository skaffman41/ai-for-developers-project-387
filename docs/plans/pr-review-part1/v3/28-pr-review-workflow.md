Спецификация: [#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26). Исходная задача: [#25](https://github.com/skaffman41/ai-for-developers-project-387/issues/25), часть 1. Критерии приёмки: AC-01, AC-02, AC-03, AC-04, частично AC-09 (тесты допуска/отказов). Блокер: [#27](https://github.com/skaffman41/ai-for-developers-project-387/issues/27).

## Результат

1. Новый workflow `.github/workflows/opencode-pr-review.yml`:
   - триггер только `pull_request: [opened, synchronize, reopened]`; `pull_request_target` не используется;
   - job `authorize` без checkout и секретов: репозиторий `skaffman41/ai-for-developers-project-387`, доверенные авторы — `skaffman41` (тип User) и `opencode-agent[bot]` (тип Bot; PR OpenCode App обязательны к ревью), head и base в этом репозитории, PR открыт; недоверенные и fork — явный notice без секрета;
   - проверка версии до модели: по истории Actions (API списка runs этого workflow с маркером PR в run-name) не допускается повторное ревью той же пары «PR + head SHA»;
   - job `review` с concurrency-группой на PR (`cancel-in-progress: true`), тайм-аут 30 минут, checkout точного `head.sha` с `persist-credentials: false`, подготовка закреплённого runtime в новом режиме ревью (`GITHUB_AGENT_MODE=pr-review`, тот же pinned action-набор, версия 1.19.6, модель `opencode/glm-5.3-flash-free`);
   - контекст ревью готовится шагами без модели: REVIEW.md из checkout, тело PR, diff `base...head` с ограничением объёма, сводка CI по PR, список неразобранных замечаний PR — всё передаётся в prompt фиксированным шагом, без выполнения кода PR;
   - read-only сессия обычного CLI закреплённого OpenCode (`opencode run` с агентом чтения) формирует текст ревью в файл вне checkout; модель не имеет shell/записи/публикации;
   - отдельный шаг публикации без модели публикует один комментарий PR через API: текст ревью + строка «Проверенная версия: <head sha>», без approve; публикация только если head SHA не изменился с начала ревью, иначе — пометка об устаревании;
   - job/шаг без модели при неуспехе ревью: `timeout`/`agent_failed`/`infra` с последним SHA, ссылкой на run и «нужен человек».
2. `scripts/prepare-github-agent.mjs` и `scripts/verify-github-agent.mjs` поддерживают режим `pr-review`: событие `pull_request`, агент чтения, инструменты только read/glob/skill; существующие режимы read-only и publish не меняются.
3. Тесты допуска/отказов ревью-контура (новый файл в `tests/`, стиль `tests/release-workflow.test.ts`): доверенные и недоверенные авторы, fork, PR приложения, маркер версии, публикация/устаревание, конфигурация prepare/verify для режима ревью.

## Критерии

- Разрешённые события проходят, недоверенные авторы/fork отклоняются до checkout и секрета; PR `opencode-agent[bot]` допускается к ревью.
- Эффективные инструменты ревью-сессии — ровно read/glob/skill; записи, shell, task и публикация со стороны модели отклоняются (пробы debug/verify локально).
- Публикация замечаний — отдельный шаг без модели; дефекты содержат файл, строку, условия и последствия; отсутствие дефектов сообщается честно; approve PR нет.
- Повторное ревью той же версии PR не создаётся; новое ревью запускается на synchronize; устаревшее отменяется concurrency-группой.
- `hexlet-check.yml`, календарь, контракт и закреплённые версии не меняются; полный `mise run check` зелёный.

## Testing Decisions

- Новые автотесты поручены (см. выше); логика authorize/версии/публикации исполняется в тестах с моками REST API по образцу `tests/release-workflow.test.ts`.
- Локальные пробы `opencode debug agent` для режима ревью; YAML-разбор, форматирование, `git diff --check`, полный `mise run check`, две независимые оси ревью.
- Живые прогоны workflow — отдельное решение владельца после merge.
