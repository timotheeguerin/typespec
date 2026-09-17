# TypeSpec AI linter (experimental)

Run judgment-based lint rules against the compiled TypeSpec graph, from a CLI
or the TypeSpec VS Code extension. Rules select candidates in TypeScript and
provide instructions for interpreting them. A model can request bounded,
read-only views of related graph entities.

AI inference is **never part of ordinary `tsp compile`**. It is opt-in, requires
a compatible compiler/tool version, and can produce incorrect judgments.

## Configure and run

Install this package alongside a matching TypeSpec compiler. Enable rules in
the existing `tspconfig.yaml` linter configuration:

```yaml
linter:
  extends:
    - "@typespec/ai-linter/recommended"
```

```sh
tsp-ai-lint . --model <model-id>
tsp-ai-lint . --model <model-id> --format json
tsp-ai-lint . --model <model-id> --format github --annotation-level error
```

The CLI uses the Copilot SDK/CLI runtime. Supply an entitled GitHub token through
`COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`. The runtime is isolated from
ambient repository instructions, skills, tools, and session history; do not rely
on a login stored in a different Copilot home directory. An Actions installation
token is not automatically entitled to Copilot inference.

The SDK is an optional dependency. Omitting it does not prevent rule loading,
ordinary compilation, graph queries, or VS Code model use. The CLI reports a
missing SDK instead of silently changing providers.

| Exit code | Meaning                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------- |
| 0         | Completed without emitted violations; inspect abstentions before interpreting this as approval. |
| 1         | Completed with violations.                                                                      |
| 2         | Failed, cancelled, or incomplete; do not interpret this as a clean run.                         |

JSON stdout contains findings, exact project-relative source ranges, rule
revisions, evidence handles, coverage counts, provider/model identity, and run
status. Compiler messages and progress go to stderr. Evidence handles belong to
that run; they are not stable IDs for a CI baseline.

For reporting-only GitHub Actions usage:

```yaml
- name: AI lint
  continue-on-error: true
  run: pnpm exec tsp-ai-lint . --model "$MODEL" --format github --annotation-level error
  env:
    MODEL: your-model-id
    COPILOT_GITHUB_TOKEN: ${{ secrets.TYPESPEC_COPILOT_TOKEN }}
```

Remove `continue-on-error` if your workflow should block on findings or failures.
Do not expose credentials to untrusted fork PRs, or run untrusted PR code in a
privileged `pull_request_target` workflow. TypeSpec libraries and rule packages
are executable code; the compiler is not a plugin sandbox.

## VS Code

Use **TypeSpec: Enable AI Lint on Save** in a trusted workspace. Select a model
and grant VS Code's model-access consent. The current project is analyzed, and
subsequent saves trigger AI linting. Enablement is local to the current extension
session, not controlled by repository settings.

Use **TypeSpec: Run AI Lint for Current Project** for an explicit rerun and
**TypeSpec: Disable AI Lint** to stop. The status bar distinguishes running,
completed, unavailable, and incomplete analysis and includes abstention counts.

Findings appear as `TypeSpec AI` warnings, including findings in closed project
files. They use a separate diagnostic collection, so compiler errors remain
visible while inference runs. Changes conservatively invalidate AI results and
cancel in-flight work across the workspace; stale responses are discarded.
Repeated saves of the same unchanged snapshot reuse the displayed result.

After changing executable rule code or installed library dependencies, rebuild
the rule package and restart the TypeSpec server, as with other TypeSpec
libraries. Instruction Markdown changes invalidate analysis when the file is
watched; dependencies excluded by VS Code's file-watcher settings also require
a restart.

VS Code uses its Language Model API directly; it does not require the Copilot
CLI provider. Other IDEs and browser-only extension hosts are not supported by
this initial integration.

## Author rules

Export an optional `aiRules` collection from the existing `$linter`:

```ts
import { defineLinter, fileRef } from "@typespec/compiler";
import { createAiRule } from "@typespec/compiler/experimental";
import { $ } from "@typespec/compiler/typekit";

const rule = createAiRule({
  name: "use-duration",
  revision: "1",
  description: "Use duration for elapsed-time quantities.",
  severity: "warning",
  messages: { default: "Consider using duration." },
  instructions: fileRef.fromPackageRoot("rules/use-duration.instructions.md"),
  create(context) {
    return {
      modelProperty(property) {
        if ($(context.program).scalar.extendsNumeric(property.type)) {
          context.addCandidate({ target: property });
        }
      },
    };
  },
});

export const $linter = defineLinter({
  rules: [],
  aiRules: [rule],
  ruleSets: {
    ai: { enable: { "@example/typespec-rules/use-duration": true } },
  },
});
```

Instructions may be an inline string or a package-relative `fileRef`. Include
referenced instruction/documentation files in the package's published `files`.
Increment `revision` when instructions or rule behavior change. Candidate
collection is synchronous and does not call a model. Ordinary `rules` and their
automatically generated `all` ruleset retain their existing behavior.

The engine provides a fixed JSON verdict contract: `violation`, `pass`, or
`abstain`, a concise `reason`, and evidence handles. Violations require handles
that were actually supplied to the model. Rules may limit query access with
`tools: ["view"]` or `tools: []`; the default is `view` and `related`.

Use `#suppress "<package>/<rule>" "reason"` for intentional exceptions.
Suppressed candidates do not incur model requests. Unused-suppression hints are
not emitted for configured deferred AI rules, since they may not have run.
No automatic edits or code fixes are provided.

### C# TTL naming example

[Azure/typespec-azure#4446](https://github.com/Azure/typespec-azure/issues/4446)
is an example for an Azure-owned rule, not a built-in generic rule:

| Code collects/checks                                                                        | Instructions interpret                                                     |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| TTL name patterns and property/parameter targets                                            | Whether the name describes a lifetime rather than a hop count              |
| Effective C# client name and existing language-scoped overrides, through Azure library APIs | Whether documentation establishes seconds, milliseconds, or another unit   |
| Source docs and containing API context                                                      | A grounded suggestion for `TimeToLiveIn<Unit>`, without inventing the unit |

The Azure package should gather language-specific facts using its supported
APIs. Its AI rule can use the same candidate/context contract and registration.
The core engine does not inspect private Azure decorator state or rename
wire-level properties.

## Limits, privacy, and testing

The default run permits 100 evaluated candidates, 8 graph queries per candidate,
and a 60-second candidate deadline. The CLI accepts `--max-candidates`; API
hosts can configure these limits through `runAiLinter` options. Exhaustion is
reported explicitly. Graph views have depth, node-count, and output-size limits.

Only enabled candidates and permitted graph context are sent to the selected
provider. Specs can still be private even though TypeSpec itself is open source.
Review your provider's data policy before opting in. The Copilot adapter removes
its owned temporary session directory on disposal and disables remote session
export, skills, file hooks, session-store access, and host tools.

Normal tests use deterministic providers without network access. The optional
`test/evaluation.test.ts` corpus checks clear durations against count, timestamp,
rate, and hop-count negatives. To evaluate an explicitly selected model:

```sh
TYPESPEC_AI_EVAL_MODEL= < model-id > pnpm exec vitest run packages/ai-linter/test/evaluation.test.ts
```

The initial small corpus requires all labeled examples to match. It is not a
calibrated accuracy guarantee; expand it with real project cases and evaluate
precision, recall, abstentions, and repeat-run stability before making judgments
blocking in your CI. Model wording and judgments may differ between providers.
