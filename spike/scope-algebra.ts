type Availability = "Unavailable" | "Added" | "Available" | "Removed";

interface OrderedDimension {
  readonly name: string;
  readonly kind: "finite";
  readonly values: readonly string[];
}

interface OpenDimension {
  readonly name: string;
  readonly kind: "open";
  readonly knownValues: readonly string[];
}

type Dimension = OrderedDimension | OpenDimension;

type Constraint =
  | { readonly kind: "none" }
  | { readonly kind: "all" }
  | { readonly kind: "some"; readonly values: ReadonlySet<string> };

type Box = ReadonlyMap<string, Constraint>;

interface Predicate {
  readonly name: string;
  readonly terms: readonly Box[];
}

interface ContainmentResult {
  readonly ok: boolean;
  readonly witness?: Record<string, string>;
  readonly fastPath: boolean;
  readonly checkedCells: number;
}

const NONE: Constraint = { kind: "none" };
const ALL: Constraint = { kind: "all" };

function some(values: readonly string[]): Constraint {
  return values.length === 0 ? NONE : { kind: "some", values: new Set(values) };
}

function box(entries: Record<string, Constraint>): Box {
  return new Map(Object.entries(entries));
}

function predicate(name: string, ...terms: Box[]): Predicate {
  return { name, terms };
}

function constraintFor(box: Box, dimension: Dimension): Constraint {
  return box.get(dimension.name) ?? ALL;
}

function constraintContains(constraint: Constraint, value: string): boolean {
  switch (constraint.kind) {
    case "none":
      return false;
    case "all":
      return true;
    case "some":
      return constraint.values.has(value);
  }
}

function pointInBox(point: Record<string, string>, term: Box, dimensions: readonly Dimension[]) {
  return dimensions.every((dimension) =>
    constraintContains(constraintFor(term, dimension), point[dimension.name]),
  );
}

function pointInPredicate(
  point: Record<string, string>,
  pred: Predicate,
  dimensions: readonly Dimension[],
) {
  return pred.terms.some((term) => pointInBox(point, term, dimensions));
}

function constraintSubset(left: Constraint, right: Constraint, dimension: Dimension): boolean {
  if (left.kind === "none" || right.kind === "all") return true;
  if (right.kind === "none") return left.kind === "none";
  if (left.kind === "all") {
    if (right.kind !== "some") return false;
    return (
      dimension.kind === "finite" && dimension.values.every((value) => right.values.has(value))
    );
  }
  if (right.kind === "some") {
    return [...left.values].every((value) => right.values.has(value));
  }
  return false;
}

function boxSubset(left: Box, right: Box, dimensions: readonly Dimension[]): boolean {
  return dimensions.every((dimension) =>
    constraintSubset(constraintFor(left, dimension), constraintFor(right, dimension), dimension),
  );
}

function atomsForDimension(source: Predicate, target: Predicate, dimension: Dimension): string[] {
  const atoms = new Set<string>();
  if (dimension.kind === "finite") {
    for (const value of dimension.values) atoms.add(value);
  } else {
    for (const value of dimension.knownValues) atoms.add(value);
    atoms.add("<future-emitter>");
  }
  for (const pred of [source, target]) {
    for (const term of pred.terms) {
      const c = constraintFor(term, dimension);
      if (c.kind === "some") {
        for (const value of c.values) atoms.add(value);
      }
    }
  }
  return [...atoms];
}

function contains(
  source: Predicate,
  target: Predicate,
  dimensions: readonly Dimension[],
): ContainmentResult {
  const fastPath = source.terms.every((sourceTerm) =>
    target.terms.some((targetTerm) => boxSubset(sourceTerm, targetTerm, dimensions)),
  );
  if (fastPath) return { ok: true, fastPath: true, checkedCells: 0 };

  const atomsByDimension = dimensions.map((dimension) =>
    atomsForDimension(source, target, dimension).filter((value) =>
      source.terms.some((term) => constraintContains(constraintFor(term, dimension), value)),
    ),
  );
  let checkedCells = 0;
  const point: Record<string, string> = {};

  function search(index: number): Record<string, string> | undefined {
    if (index === dimensions.length) {
      checkedCells++;
      if (
        pointInPredicate(point, source, dimensions) &&
        !pointInPredicate(point, target, dimensions)
      ) {
        return { ...point };
      }
      return undefined;
    }

    const dimension = dimensions[index];
    for (const atom of atomsByDimension[index]) {
      point[dimension.name] = atom;
      const found = search(index + 1);
      if (found) return found;
    }
    return undefined;
  }

  const witness = search(0);
  return { ok: witness === undefined, witness, fastPath: false, checkedCells };
}

function versionAvailability(
  versions: readonly string[],
  added: readonly string[] = [],
  removed: readonly string[] = [],
): Map<string, Availability> {
  const addSet = new Set(added);
  const removeSet = new Set(removed);
  const addedFirst =
    added.length > 0 &&
    (removed.length === 0 || versions.indexOf(added[0]) < versions.indexOf(removed[0]));
  const effectiveAdded = addedFirst ? added : [versions[0], ...added];

  let isAvailable = false;
  const map = new Map<string, Availability>();
  for (const version of versions) {
    if (removeSet.has(version)) {
      isAvailable = false;
      map.set(version, "Removed");
    } else if (addSet.has(version) || effectiveAdded.includes(version)) {
      isAvailable = true;
      map.set(version, "Added");
    } else if (isAvailable) {
      map.set(version, "Available");
    } else {
      map.set(version, "Unavailable");
    }
  }
  return map;
}

function existsConstraint(map: Map<string, Availability>): Constraint {
  return some(
    [...map.entries()]
      .filter(([, status]) => status === "Added" || status === "Available")
      .map(([version]) => version),
  );
}

function currentReferenceDiagnostics(
  source: Map<string, Availability> | undefined,
  target: Map<string, Availability>,
): string[] {
  if (source === undefined) {
    return [...target.values()].every((x) => x === "Added" || x === "Available") ? [] : ["default"];
  }
  const diagnostics: string[] = [];
  for (const key of new Set([...source.keys(), ...target.keys()])) {
    const sourceVal = source.get(key);
    const targetVal = target.get(key);
    if (sourceVal === "Added" && (targetVal === "Removed" || targetVal === "Unavailable")) {
      diagnostics.push("addedAfter");
    }
    if (sourceVal === "Removed" && targetVal === "Unavailable") {
      diagnostics.push("removedBefore");
    }
  }
  return diagnostics;
}

function currentContainsDiagnostics(
  source: Map<string, Availability> | undefined,
  target: Map<string, Availability>,
): string[] {
  if (source === undefined) return [];
  const diagnostics: string[] = [];
  for (const key of new Set([...source.keys(), ...target.keys()])) {
    const sourceVal = source.get(key);
    const targetVal = target.get(key);
    if (targetVal === "Added" && (sourceVal === "Removed" || sourceVal === "Unavailable")) {
      diagnostics.push("dependentAddedAfter");
    }
    if (sourceVal === "Removed" && (targetVal === "Added" || targetVal === "Available")) {
      diagnostics.push("dependentRemovedBefore");
    }
  }
  return diagnostics;
}

function assertEqual(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${name}\nexpected: ${e}\nactual:   ${a}`);
  }
  console.log(`ok - ${name}`);
}

function assertContainment(result: ContainmentResult, expected: boolean, name: string) {
  if (result.ok !== expected) {
    throw new Error(`${name}\nexpected containment ${expected}, got ${JSON.stringify(result)}`);
  }
  console.log(
    `ok - ${name}: ${result.ok ? "contained" : `counterexample ${JSON.stringify(result.witness)}`} (${result.fastPath ? "box fast path" : `${result.checkedCells} cells`})`,
  );
}

const version: OrderedDimension = {
  name: "version",
  kind: "finite",
  values: ["v1", "v2", "v3", "v4"],
};
const emitter: OpenDimension = {
  name: "emitter",
  kind: "open",
  knownValues: ["@typespec/openapi3", "@typespec/json-schema"],
};
const language: OrderedDimension = { name: "language", kind: "finite", values: ["ts", "csharp"] };

const targetAddedV3 = versionAvailability(version.values, ["v3"]);
const sourceAddedV2 = versionAvailability(version.values, ["v2"]);
assertEqual(
  currentReferenceDiagnostics(sourceAddedV2, targetAddedV3),
  ["addedAfter"],
  "current added-after diagnostic",
);
assertContainment(
  contains(
    predicate("source@v2+", box({ version: existsConstraint(sourceAddedV2) })),
    predicate("target@v3+", box({ version: existsConstraint(targetAddedV3) })),
    [version],
  ),
  false,
  "version-only set containment catches added-after",
);

const sourceRemovedV3 = versionAvailability(version.values, [], ["v3"]);
const targetRemovedV2 = versionAvailability(version.values, [], ["v2"]);
assertEqual(
  currentReferenceDiagnostics(sourceRemovedV3, targetRemovedV2),
  ["removedBefore"],
  "current removed-before diagnostic",
);
assertContainment(
  contains(
    predicate("source removed v3", box({ version: existsConstraint(sourceRemovedV3) })),
    predicate("target removed v2", box({ version: existsConstraint(targetRemovedV2) })),
    [version],
  ),
  false,
  "version-only set containment catches removed-before",
);

assertEqual(
  currentContainsDiagnostics(
    versionAvailability(version.values, ["v3"]),
    versionAvailability(version.values, ["v2"]),
  ),
  ["dependentAddedAfter"],
  "current dependent-added-after diagnostic",
);
assertEqual(
  currentContainsDiagnostics(
    versionAvailability(version.values, [], ["v2"]),
    versionAvailability(version.values, [], ["v3"]),
  ),
  ["dependentRemovedBefore"],
  "current dependent-removed-before diagnostic",
);

const sourceV1Forever = versionAvailability(version.values, ["v1"]);
assertEqual(
  currentReferenceDiagnostics(sourceV1Forever, targetRemovedV2),
  [],
  "current boundary check has no diagnostic for v1+ source referencing v2-removed target",
);
assertContainment(
  contains(
    predicate("source v1+", box({ version: existsConstraint(sourceV1Forever) })),
    predicate("target removed v2", box({ version: existsConstraint(targetRemovedV2) })),
    [version],
  ),
  false,
  "set containment rejects the v1+ source / v2-removed target gap",
);

assertContainment(
  contains(
    predicate("all emitters", box({ emitter: ALL })),
    predicate("openapi3 only", box({ emitter: some(["@typespec/openapi3"]) })),
    [emitter],
  ),
  false,
  "open emitter dimension: all emitters is not contained in one named emitter",
);
assertContainment(
  contains(
    predicate("openapi3 only", box({ emitter: some(["@typespec/openapi3"]) })),
    predicate("all emitters", box({ emitter: ALL })),
    [emitter],
  ),
  true,
  "open emitter dimension: named emitter is contained in all/future emitters",
);

const sourceV2Openapi = predicate(
  "source v2+ openapi3",
  box({
    version: some(["v2", "v3"]),
    emitter: some(["@typespec/openapi3"]),
    language: some(["ts"]),
  }),
);
const targetV2AnyKnownEmitter = predicate(
  "target v2+ any emitter",
  box({ version: some(["v2", "v3", "v4"]), emitter: ALL, language: ALL }),
);
assertContainment(
  contains(sourceV2Openapi, targetV2AnyKnownEmitter, [version, emitter, language]),
  true,
  "version × emitter × language without Cartesian materialisation on box fast path",
);

const sourceAnyEmitter = predicate(
  "source v1-v3 any emitter",
  box({ version: some(["v1", "v2", "v3"]), emitter: ALL }),
);
const targetOpenapiV2 = predicate(
  "target v2-v3 openapi3",
  box({ version: some(["v2", "v3"]), emitter: some(["@typespec/openapi3"]) }),
);
assertContainment(
  contains(sourceAnyEmitter, targetOpenapiV2, [version, emitter]),
  false,
  "combined dimensions produce a symbolic counterexample",
);

console.log("\nComplexity:");
console.log("- Single-conjunction predicates: O(references × dimensions); no Cartesian product.");
console.log(
  "- DNF/union fallback: exact containment checks atoms per dimension and is exponential in dimensions in the worst case.",
);
console.log(
  "- Open dimensions remain decidable here only because predicates are finite equality sets plus ALL/<future-emitter>.",
);
