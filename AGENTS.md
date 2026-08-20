## Harness Execution Protocol

When the Captain asks to run the harness:

1. Read `harness/prompts/run-harness.md`.
2. Use the planner agent to write `harness/plans/plan.md`.
3. Use the implementer agent to read `harness/plans/plan.md` and implement the patch.
4. Use the tester agent to write `harness/reports/test-results.md`.
5. Use the reviewer agent to write `harness/reports/review.md`.
6. If the tester fails, repeat implementer -> tester.
7. If the review fails, repeat implementer → tester → reviewer.
8. Use files as the source of truth, not chat output.

Testing:
- Assume PHPUnit unless the repo says otherwise.
- Bug fixes should include regression tests when practical.
- New behavior should include unit and/or feature tests as appropriate.
- Use Laravel helpers such as actingAs(), assertStatus(), assertJson(), assertDatabaseHas().
- Use fakes where appropriate: Mail::fake(), Notification::fake(), Queue::fake(), Event::fake(), Storage::fake(), Http::fake() if supported.
- Keep factories and fixtures small and explicit.

Useful commands:
- vendor/bin/phpunit --no-coverage --testdox --filter SomeTestName
- vendor/bin/phpunit --no-coverage --testdox --group SomeGroup
- vendor/bin/phpunit --no-coverage --testdox
- php artisan route:list
- php artisan config:clear
- php artisan cache:clear
- php artisan route:clear
- npm run build, only when frontend assets are affected

Git safety:
- Before editing, inspect git status.
- Do not overwrite unrelated dirty files.
- Keep patches focused.

File handoff:
- Do not rely on chat output as the only handoff.
- Read required input files before acting.
- Write required output files before finishing.
- The next agent must be able to continue from files alone.
- Keep harness/state/context.json concise and factual.
- Put raw command output in harness/logs/ or harness/artifacts/.
