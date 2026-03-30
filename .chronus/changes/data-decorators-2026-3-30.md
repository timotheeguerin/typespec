---
changeKind: feature
packages:
  - "@typespec/compiler"
---

Added `data` decorator modifier for declaring decorators that auto-store their arguments as metadata without requiring a JavaScript implementation.

```typespec
data dec label(target: Model, value: valueof string);

@label("my-model")
model Foo {}
```

Added compiler API `hasDataDecorator`, `getDataDecoratorValue`, and `getDataDecoratorTargets` for reading data decorator values by FQN.
