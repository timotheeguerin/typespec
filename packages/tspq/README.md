# @typespec/tspq (experimental)

Inspect processed TypeSpec graph information rather than searching source text.
The CLI compiles the project once with its local compiler and configuration,
without running emitters. Install matching compiler and tool versions.

```sh
tspq summary --entrypoint ./main.tsp
tspq summary --entrypoint ./main.tsp --json
tspq view MyNamespace.Settings.timeout --entrypoint . --depth 1 --json
tspq list --entrypoint . --offset 0 --limit 50
```

`--entrypoint` defaults to the current directory. `--config` overrides config
resolution. Diagnostics go to stderr; JSON stdout remains parseable.

Views include documentation, property/parameter information, exact source ranges,
semantic relationships, scalar encodings, and opt-in library type information.
They no longer expose raw compiler state maps. Library information is descriptive
Markdown, not a structured metadata guarantee.

```ts
import { createTypeQuery } from "@typespec/tspq";

const query = createTypeQuery(program);
const property = query.view("MyNamespace.Settings.timeout");
const related = query.related(property.id);
```

Query IDs belong to one in-memory session and are invalid in another. `list`
returns `nextOffset` when more project entities are available. Views allow depth
0-2, at most 128 expanded nodes and 32 KiB of output; pages contain 1-100 entities.
Oversized or invalid requests fail explicitly. Locations are project-relative,
with 1-based lines/UTF-16 columns and exclusive end positions. Synthetic types
do not receive invented locations.

The exported API accepts an already-compiled Program and performs no model calls.
TypeSpec compilation still executes trusted libraries; read-only query access
does not sandbox those libraries.
