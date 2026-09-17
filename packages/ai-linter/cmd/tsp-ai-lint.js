#!/usr/bin/env node
const { runAiLintCli } = await import("../dist/src/cli.js");
await runAiLintCli(process.argv.slice(2));
