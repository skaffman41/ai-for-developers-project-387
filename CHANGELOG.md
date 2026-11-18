# Changelog

## [0.6.0](https://github.com/skaffman41/ai-for-developers-project-387/compare/v0.5.0...v0.6.0) (2026-11-18)


### Features

* **audit:** collect dependency reports and maintain journal ([#54](https://github.com/skaffman41/ai-for-developers-project-387/issues/54)) ([b3515e3](https://github.com/skaffman41/ai-for-developers-project-387/commit/b3515e3e117fecacce21ae9b038fc93ab389fba0))
* **audit:** publish findings and replay verified reports ([#55](https://github.com/skaffman41/ai-for-developers-project-387/issues/55)) ([a344f20](https://github.com/skaffman41/ai-for-developers-project-387/commit/a344f20802949e353a80a6ba33323724bae76044))
* **audit:** регулярный аудит зависимостей ([#53](https://github.com/skaffman41/ai-for-developers-project-387/issues/53)) ([0e374ac](https://github.com/skaffman41/ai-for-developers-project-387/commit/0e374ac4572ce8b22b3fb5f97496b022a5b479a7))
* **booking:** восстановить тему разговора при повторе отправки ([#20](https://github.com/skaffman41/ai-for-developers-project-387/issues/20)) ([23838a6](https://github.com/skaffman41/ai-for-developers-project-387/commit/23838a694751e7e5276e3091dacbf66ff49216c4))
* **booking:** добавить необязательную тему разговора ([#19](https://github.com/skaffman41/ai-for-developers-project-387/issues/19)) ([b0187ff](https://github.com/skaffman41/ai-for-developers-project-387/commit/b0187ff587321b147cccc79ccc01f8a51598aad1))
* **booking:** добавить тему разговора к бронированию ([#17](https://github.com/skaffman41/ai-for-developers-project-387/issues/17)) ([14393bb](https://github.com/skaffman41/ai-for-developers-project-387/commit/14393bb14808a899e6f9c3969442db21173ff394))


### Bug Fixes

* **agent:** allow sixty-minute manual iterations ([#25](https://github.com/skaffman41/ai-for-developers-project-387/issues/25)) ([b0dcf3d](https://github.com/skaffman41/ai-for-developers-project-387/commit/b0dcf3d6d658f35f0d75d8252659ae0c6238b5a1))
* **agent:** увеличить ручной лимит до 60 минут ([#25](https://github.com/skaffman41/ai-for-developers-project-387/issues/25)) ([f983f84](https://github.com/skaffman41/ai-for-developers-project-387/commit/f983f841c89851ebc03c5ef0b3f3baf71d1f5986))
* **audit:** isolate validated model inputs ([#54](https://github.com/skaffman41/ai-for-developers-project-387/issues/54)) ([c7e56ee](https://github.com/skaffman41/ai-for-developers-project-387/commit/c7e56eec002b6dd54909e1885db3d991966c33be))
* **audit:** scope runner context to steps ([#54](https://github.com/skaffman41/ai-for-developers-project-387/issues/54)) ([1793a00](https://github.com/skaffman41/ai-for-developers-project-387/commit/1793a004e338100353b948872ebe2de59835af13))
* isolate validated audit inputs from runner status ([#54](https://github.com/skaffman41/ai-for-developers-project-387/issues/54)) ([c57216e](https://github.com/skaffman41/ai-for-developers-project-387/commit/c57216ed3864b5e448a0d94c954716646d32b1c1))

## [0.5.0](https://github.com/skaffman41/ai-for-developers-project-387/compare/v0.4.0...v0.5.0) (2026-11-18)


### Features

* **ci:** bound manual PR attempts and report failures ([#29](https://github.com/skaffman41/ai-for-developers-project-387/issues/29)) ([b96983f](https://github.com/skaffman41/ai-for-developers-project-387/commit/b96983fe458f4d4df98ac3079616a3d9acc34f54))
* **ci:** integrate PR review infrastructure ([#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26)) ([d084a05](https://github.com/skaffman41/ai-for-developers-project-387/commit/d084a05a32dd1a7e52aa1c1c79d35fa290fbe690))
* **ci:** preserve exact PR browser evidence ([#30](https://github.com/skaffman41/ai-for-developers-project-387/issues/30)) ([a8a2725](https://github.com/skaffman41/ai-for-developers-project-387/commit/a8a2725c0509eb4b069cfce60f43ba34350df078))
* **ci:** ревью PR, бюджет запусков и браузерные артефакты ([#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26)) ([d084a05](https://github.com/skaffman41/ai-for-developers-project-387/commit/d084a05a32dd1a7e52aa1c1c79d35fa290fbe690))
* **review:** add isolated read-only PR review ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([4d3a001](https://github.com/skaffman41/ai-for-developers-project-387/commit/4d3a0013dfe9c6075e6335c123db130eed81dd55))


### Bug Fixes

* **ci:** admit PR reviews before cancellation ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([be0c310](https://github.com/skaffman41/ai-for-developers-project-387/commit/be0c3106c775af13b9d567c88cb696a8c48790aa))
* **ci:** allow manual reports on pull requests ([#29](https://github.com/skaffman41/ai-for-developers-project-387/issues/29)) ([cd0800d](https://github.com/skaffman41/ai-for-developers-project-387/commit/cd0800dced714b5a19a9c9e80ce568a4d8992e28))
* **ci:** authenticate manual admission history ([#29](https://github.com/skaffman41/ai-for-developers-project-387/issues/29)) ([b8ae266](https://github.com/skaffman41/ai-for-developers-project-387/commit/b8ae26688cd9d0bc6a3912ad77ee98952b923f76))
* **ci:** bind manual reporter to workflow identity ([#29](https://github.com/skaffman41/ai-for-developers-project-387/issues/29)) ([50ffc02](https://github.com/skaffman41/ai-for-developers-project-387/commit/50ffc0266788a26e7ed315424a08911d68c4bd8a))
* **ci:** bind PR reporter to workflow identity ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([fc56ce5](https://github.com/skaffman41/ai-for-developers-project-387/commit/fc56ce51a294afc88a1715e05739089e719f2640))
* **ci:** complete trusted PR review bootstrap ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([ae83d32](https://github.com/skaffman41/ai-for-developers-project-387/commit/ae83d32e3cff960ceb9ce66689a614a0fff05e38))
* **ci:** complete trusted review bootstrap dependencies ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([bd98509](https://github.com/skaffman41/ai-for-developers-project-387/commit/bd98509a86f519e28de599b12fdb6020c61d0587))
* **ci:** expose safe review progress and failure diagnostics ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([e658d09](https://github.com/skaffman41/ai-for-developers-project-387/commit/e658d0988b73abf67d4a23f53062b93b71c0c5de))
* **ci:** merge approved DeepSeek bootstrap ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([b4f264d](https://github.com/skaffman41/ai-for-developers-project-387/commit/b4f264d3167049027a84f70a739b17619dcb5bbd))
* **ci:** merge manual reports and Russian PR reviews ([#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26)) ([855cc3c](https://github.com/skaffman41/ai-for-developers-project-387/commit/855cc3c9b44b5bdff933d7ae70a93ac9e91df6dc))
* **ci:** pin approved free DeepSeek model ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([053c9d4](https://github.com/skaffman41/ai-for-developers-project-387/commit/053c9d4a2f1914d3b22032fb0f5ae4d83137a37b))
* **ci:** publish bounded CLI text reviews ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([58dc49b](https://github.com/skaffman41/ai-for-developers-project-387/commit/58dc49bb24500a4f38e23d4c75e1753b22537ad1))
* **ci:** publish manual reports and Russian PR reviews ([#26](https://github.com/skaffman41/ai-for-developers-project-387/issues/26)) ([855cc3c](https://github.com/skaffman41/ai-for-developers-project-387/commit/855cc3c9b44b5bdff933d7ae70a93ac9e91df6dc))
* **ci:** replace retired free model with DeepSeek ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([b4f264d](https://github.com/skaffman41/ai-for-developers-project-387/commit/b4f264d3167049027a84f70a739b17619dcb5bbd))
* **ci:** подготовить доверенный bootstrap авторевью PR ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([631c9b6](https://github.com/skaffman41/ai-for-developers-project-387/commit/631c9b623b010146159564f33e155d72360dc622))
* **ci:** подготовить доверенный bootstrap авторевью PR ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([8647ceb](https://github.com/skaffman41/ai-for-developers-project-387/commit/8647ceb5adb5ed39a54c461fe2d507f8ad3177b3))
* **review:** merge CLI output bootstrap ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([0c16f5c](https://github.com/skaffman41/ai-for-developers-project-387/commit/0c16f5cce02e4cf602bd64684b97fb75f08dca33))
* **review:** preserve ordinary CLI review output ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([e8a8447](https://github.com/skaffman41/ai-for-developers-project-387/commit/e8a84472e62c66ad148f635341e1a7f17b405ab0))
* **review:** request Russian PR review text ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([3e4c206](https://github.com/skaffman41/ai-for-developers-project-387/commit/3e4c2068790e50b87fe1ce40b874817d9f685f40))
* **review:** поддержать текстовый ответ CLI ([#28](https://github.com/skaffman41/ai-for-developers-project-387/issues/28)) ([0c16f5c](https://github.com/skaffman41/ai-for-developers-project-387/commit/0c16f5cce02e4cf602bd64684b97fb75f08dca33))

## [0.4.0](https://github.com/skaffman41/ai-for-developers-project-387/compare/v0.3.0...v0.4.0) (2026-11-17)


### Features

* **agent:** triage new owner issues automatically ([#14](https://github.com/skaffman41/ai-for-developers-project-387/issues/14)) ([1e93c31](https://github.com/skaffman41/ai-for-developers-project-387/commit/1e93c3108971f049b6c0ab00fdac3b6025fbf0e1))
* **agent:** triage new owner issues automatically ([#14](https://github.com/skaffman41/ai-for-developers-project-387/issues/14)) ([f486a00](https://github.com/skaffman41/ai-for-developers-project-387/commit/f486a00df35f4dea99df939a98f8d5a245c650b7))


### Bug Fixes

* **agent:** allow pinned gh tracker operations and new plan snapshots ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([5f2a808](https://github.com/skaffman41/ai-for-developers-project-387/commit/5f2a8086d6a09126f79169b91d2b290644e67786))
* **agent:** authorize bounded GitHub planning operations ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([fe91626](https://github.com/skaffman41/ai-for-developers-project-387/commit/fe9162606a504031d9bc65a08c7019e82011f0d3))
* **agent:** enable bounded GitHub planning ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([16eb345](https://github.com/skaffman41/ai-for-developers-project-387/commit/16eb345a39b0dd25b5b8437be44df6cb9b14198b))
* **agent:** gh ops, snapshots ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ✓ ([fe711d8](https://github.com/skaffman41/ai-for-developers-project-387/commit/fe711d81c5e41c07edd6315d6068dd7e4a6a7158))
* **agent:** queue only authorized answers ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([18681f5](https://github.com/skaffman41/ai-for-developers-project-387/commit/18681f59f8e80436d556d032867f3a6a6d1db672))
* **agent:** queue only authorized answers ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([c1e94b9](https://github.com/skaffman41/ai-for-developers-project-387/commit/c1e94b9061e0a2fa0378cf6faae389904ad4f132))
* **agent:** resolve pinned bootstrap version without latest ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([9a0f656](https://github.com/skaffman41/ai-for-developers-project-387/commit/9a0f6569c01b3768561033c2f72fe5a88bd9cc2c))
* **agent:** use pinned release for bootstrap cache ([#12](https://github.com/skaffman41/ai-for-developers-project-387/issues/12)) ([8f18c7c](https://github.com/skaffman41/ai-for-developers-project-387/commit/8f18c7cf1c8b4b8410a76d7fa7fdeb2b2104251c))

## [0.3.0](https://github.com/skaffman41/ai-for-developers-project-387/compare/v0.2.0...v0.3.0) (2026-11-17)


### Features

* **ci:** add read-only GitHub comment agent ([#4](https://github.com/skaffman41/ai-for-developers-project-387/issues/4)) ([c36bcb0](https://github.com/skaffman41/ai-for-developers-project-387/commit/c36bcb04c104942006d7ce71be6312a5a545d0a3))
* **ci:** enable explicit GitHub agent publication ([#5](https://github.com/skaffman41/ai-for-developers-project-387/issues/5)) ([5bd2b23](https://github.com/skaffman41/ai-for-developers-project-387/commit/5bd2b233d0bd82a0cea153efeee36574fa7498d5))
* **ci:** integrate GitHub comment agent ([#3](https://github.com/skaffman41/ai-for-developers-project-387/issues/3)) ([04a9561](https://github.com/skaffman41/ai-for-developers-project-387/commit/04a9561a2f64410bc52c98cbda17110397039606))
* **ci:** подключить GitHub-агента по команде владельца ([#3](https://github.com/skaffman41/ai-for-developers-project-387/issues/3)) ([04a9561](https://github.com/skaffman41/ai-for-developers-project-387/commit/04a9561a2f64410bc52c98cbda17110397039606))


### Bug Fixes

* **ci:** allow fresh OpenCode runtime installation ([#6](https://github.com/skaffman41/ai-for-developers-project-387/issues/6)) ([c4ca70f](https://github.com/skaffman41/ai-for-developers-project-387/commit/c4ca70fbe37e192f7d0175bc285953576b083401))
* **ci:** allow fresh OpenCode runtime installation ([#6](https://github.com/skaffman41/ai-for-developers-project-387/issues/6)) ([88230d0](https://github.com/skaffman41/ai-for-developers-project-387/commit/88230d08c2295f61f3cbbff316f268bfdaf5dccf))
* **ci:** integrate fresh runtime installation ([#6](https://github.com/skaffman41/ai-for-developers-project-387/issues/6)) ([c4ca70f](https://github.com/skaffman41/ai-for-developers-project-387/commit/c4ca70fbe37e192f7d0175bc285953576b083401))

## [0.2.0](https://github.com/skaffman41/ai-for-developers-project-386/compare/v0.1.0...v0.2.0) (2026-11-11)


### Features

* **api:** generate contract from TypeSpec ([#49](https://github.com/skaffman41/ai-for-developers-project-386/issues/49)) ([6ec2d46](https://github.com/skaffman41/ai-for-developers-project-386/commit/6ec2d4637a18bcdb0262b7d903c7820c36562f79))
* **api:** use TypeSpec as contract source ([#48](https://github.com/skaffman41/ai-for-developers-project-386/issues/48)) ([403a3c2](https://github.com/skaffman41/ai-for-developers-project-386/commit/403a3c2004f872873aee0e3815f7ac8f47d8abb0))
* **docker:** запуск календаря одним контейнером ([#56](https://github.com/skaffman41/ai-for-developers-project-386/issues/56)) ([52e9d79](https://github.com/skaffman41/ai-for-developers-project-386/commit/52e9d797a83a3f257c213de8e18d25e5f7725656))
* package calendar for Docker and prepare Railway MCP ([7a96e8b](https://github.com/skaffman41/ai-for-developers-project-386/commit/7a96e8ba3c60a2691d1896e1c4c929043caa1d80))

## 0.1.0 (2026-11-10)


### Features

* **booking:** choose Moscow dates and available slots ([#40](https://github.com/skaffman41/ai-for-developers-project-386/issues/40)) ([eabd1cd](https://github.com/skaffman41/ai-for-developers-project-386/commit/eabd1cdbc8ded6a88aae203a0f4eeeafb946ea4a))
* **booking:** confirm bookings with safe retries ([883e71e](https://github.com/skaffman41/ai-for-developers-project-386/commit/883e71e8df1bac53a7004079b0c41f0e104c15f8))
* **booking:** create persistent meeting types ([#39](https://github.com/skaffman41/ai-for-developers-project-386/issues/39)) ([47d8a41](https://github.com/skaffman41/ai-for-developers-project-386/commit/47d8a4168cc6ddd5d8bca5cee7c620696f2d5b0e))
* **booking:** show meeting types through shared contract ([#38](https://github.com/skaffman41/ai-for-developers-project-386/issues/38)) ([2c9c6d0](https://github.com/skaffman41/ai-for-developers-project-386/commit/2c9c6d07bdb6c7e20b7daa1bf626e8150ba506ee))
* **booking:** show owner bookings and refresh lists ([#42](https://github.com/skaffman41/ai-for-developers-project-386/issues/42)) ([eddae25](https://github.com/skaffman41/ai-for-developers-project-386/commit/eddae25e88d26b261a4037a2a31511f580f7b2c2))
* **booking:** запись гостей и календарь владельца ([bab12ec](https://github.com/skaffman41/ai-for-developers-project-386/commit/bab12ec41c2ce954f3eacebf3dc3e80975d16ad4))
* **booking:** запись гостей и календарь владельца ([#45](https://github.com/skaffman41/ai-for-developers-project-386/issues/45)) ([bab12ec](https://github.com/skaffman41/ai-for-developers-project-386/commit/bab12ec41c2ce954f3eacebf3dc3e80975d16ad4))


### Bug Fixes

* **ci:** budget the full browser suite on hosted runners ([7e7482b](https://github.com/skaffman41/ai-for-developers-project-386/commit/7e7482b8e3915d3aa34d17d2abe0646bc7ca47c0))
* **ci:** формат CHANGELOG и лимит браузерного набора ([049422b](https://github.com/skaffman41/ai-for-developers-project-386/commit/049422bb738f3bc3dc391ab2a74427852149576b))
* **release:** preserve generated changelog formatting ([#43](https://github.com/skaffman41/ai-for-developers-project-386/issues/43)) ([b77e006](https://github.com/skaffman41/ai-for-developers-project-386/commit/b77e0060c546d1fff81f691d4f3d4a797f89288e))

## Changelog

Release notes are maintained by release-please. The first release is pending.
