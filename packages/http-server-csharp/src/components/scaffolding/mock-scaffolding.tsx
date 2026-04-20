import { code, For, SourceDirectory, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Interface, Operation, Program, Type } from "@typespec/compiler";
import { isErrorModel, isVoidType } from "@typespec/compiler";
import { useTsp } from "@typespec/emitter-framework";
import { CSharpFile } from "../csharp-file.jsx";
import { TypeExpression } from "../type-expression.jsx";

export interface MockScaffoldingProps {
  interfaceRegistrations: string[];
  interfaces: Interface[];
}

/**
 * Renders the mock scaffolding files: IInitializer, Initializer, MockRegistration,
 * and per-interface mock implementation classes.
 */
export function MockScaffolding(props: MockScaffoldingProps): Children {
  return (
    <cs.Namespace name="TypeSpec.Helpers">
      <SourceDirectory path="mocks">
        <InitializerInterface />
        <InitializerImplementation />
        {props.interfaceRegistrations.length > 0 && (
          <MockRegistration interfaceRegistrations={props.interfaceRegistrations} />
        )}
        <For each={props.interfaces}>
          {(iface) => <MockImplementation type={iface} />}
        </For>
      </SourceDirectory>
    </cs.Namespace>
  );
}

function InitializerInterface(): Children {
  return (
    <CSharpFile path="IInitializer.cs">
      {code`
        public interface IInitializer
        {
          object? Initialize(System.Type type);
          T Initialize<T>() where T : class, new();
        }
      `}
    </CSharpFile>
  );
}

function InitializerImplementation(): Children {
  return (
    <CSharpFile path="Initializer.cs">
      {code`
        public class Initializer : IInitializer
        {
          public Initializer(IDictionary<Type, object?> cache)
          {
            Cache = cache;
          }

          internal virtual IDictionary<Type, object?> Cache { get; }

          internal object? CacheAndReturn(Type type, object? instance)
          {
            Cache[type] = instance;
            return instance;
          }

          public object? Initialize(Type type)
          {
            if (Cache.ContainsKey(type)) return Cache[type];
            if (type == typeof(string)) return CacheAndReturn(type, string.Empty);
            if (type == typeof(int)) return CacheAndReturn(type, 0);
            if (type == typeof(long)) return CacheAndReturn(type, 0L);
            if (type == typeof(double)) return CacheAndReturn(type, 0.0);
            if (type == typeof(bool)) return CacheAndReturn(type, false);
            if (type == typeof(DateTime)) return CacheAndReturn(type, DateTime.UtcNow);
            if (type == typeof(DateTimeOffset)) return CacheAndReturn(type, DateTimeOffset.UtcNow);
            if (type == typeof(TimeSpan)) return CacheAndReturn(type, TimeSpan.Zero);
            if (type.IsArray)
            {
              var element = type.GetElementType();
              if (element == null) return null;
              return CacheAndReturn(type, Array.CreateInstance(element, 0));
            }
            if (type.IsClass) return InitializeClass(type);
            if (type.IsEnum) return CacheAndReturn(type, Enum.GetValues(type).GetValue(0));
            return new object();
          }

          public T Initialize<T>() where T : class, new()
          {
            var result = new T();
            var initialized = InitializeClass(typeof(T), result);
            return initialized as T ?? result;
          }

          private object? InitializeClass(Type type, object? instance = null)
          {
            if (Cache.ContainsKey(type)) return Cache[type];
            var result = instance ?? Activator.CreateInstance(type);
            foreach (var property in type.GetProperties())
            {
              if (property.CanWrite)
              {
                property.SetValue(result, Initialize(property.PropertyType));
              }
            }
            return CacheAndReturn(type, result);
          }
        }
      `}
    </CSharpFile>
  );
}

function MockRegistration(props: { interfaceRegistrations: string[] }): Children {
  const registrations = props.interfaceRegistrations
    .map((r) => `builder.Services.AddScoped<${r}>();`)
    .join("\n");

  return (
    <CSharpFile path="MockRegistration.cs" using={["Microsoft.AspNetCore.Http.Features"]}>
      {code`
        public static class MockRegistration
        {
          public static void Register(WebApplicationBuilder builder)
          {
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<IJsonSerializationProvider, JsonSerializationProvider>();
            builder.Services.AddSingleton<IDictionary<Type, object?>>(new Dictionary<Type, object?>());
            builder.Services.AddScoped<IInitializer, Initializer>();
            ${registrations}
            builder.Services.Configure<FormOptions>(options =>
            {
              options.MemoryBufferThreshold = int.MaxValue;
              options.MultipartBodyLengthLimit = int.MaxValue;
            });
          }
        }
      `}
    </CSharpFile>
  );
}

/**
 * Extracts the "success" type from a return type (same logic as interfaces.tsx).
 */
function getSuccessReturnType(program: Program, returnType: Type): Type | undefined {
  if (isVoidType(returnType)) return undefined;

  if (returnType.kind === "Union") {
    for (const variant of returnType.variants.values()) {
      const variantType = variant.type;
      if (isVoidType(variantType)) continue;
      if (variantType.kind === "Model") {
        try {
          if (isErrorModel(program, variantType)) continue;
        } catch {
          // isErrorModel may fail on certain types
        }
        if (variantType.name && variantType.name.toLowerCase() === "error") {
          continue;
        }
      }
      return variantType;
    }
    return undefined;
  }

  return returnType;
}

/**
 * Returns a mock return statement for a method based on its return type.
 */
function getMockReturnStatement(
  program: Program,
  returnType: Type,
): Children {
  const successType = getSuccessReturnType(program, returnType);
  if (!successType) {
    return "return Task.CompletedTask;";
  }

  if (successType.kind === "Model" && successType.indexer) {
    // Array-like type
    const elementType = successType.indexer.value;
    return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>([]);`;
  }

  if (successType.kind === "Scalar") {
    if (successType.name === "string") {
      return `return Task.FromResult("");`;
    }
    return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>(default);`;
  }

  if (successType.kind === "Model") {
    return code`return Task.FromResult(_initializer.Initialize<${(<TypeExpression type={successType} />)}>());`;
  }

  return code`return Task.FromResult<${(<TypeExpression type={successType} />)}>(default);`;
}

interface MockImplementationProps {
  type: Interface;
}

/**
 * Generates a mock implementation class for a business logic interface.
 */
function MockImplementation(props: MockImplementationProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const { $ } = useTsp();
  const interfaceName = `I${namePolicy.getName(props.type.name, "class")}`;
  const className = `Mock${namePolicy.getName(props.type.name, "class")}`;
  const operations = Array.from(props.type.operations.entries());

  return (
    <CSharpFile
      path={`${className}.cs`}
      using={[
        "System",
        "System.Net",
        "System.Text.Json",
        "System.Text.Json.Serialization",
        "System.Threading.Tasks",
        "Microsoft.AspNetCore.Mvc",
      ]}
    >
      {code`
        public class ${className} : ${interfaceName}
        {
          public ${className}(IInitializer initializer, IHttpContextAccessor accessor)
          {
            _initializer = initializer;
            HttpContextAccessor = accessor;
          }

          private IInitializer _initializer;

          public IHttpContextAccessor HttpContextAccessor { get; }

          ${(<MockMethods operations={operations} program={$.program} />)}
        }
      `}
    </CSharpFile>
  );
}

interface MockMethodsProps {
  operations: [string, Operation][];
  program: Program;
}

function MockMethods(props: MockMethodsProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  return (
    <For each={props.operations} doubleHardline>
      {([name, op]) => {
        const methodName = `${namePolicy.getName(name, "class-method")}Async`;
        const successType = getSuccessReturnType(props.program, op.returnType);

        const returnTypeExpr = successType
          ? code`Task<${(<TypeExpression type={successType} />)}>`
          : code`Task`;

        const parameters = Array.from(op.parameters.properties.entries()).map(
          ([pName, prop]) => ({
            name: namePolicy.getName(pName, "type-parameter"),
            type: (<TypeExpression type={prop.type} />) as Children,
          }),
        );

        const paramList = parameters.map(
          (p, i) => code`${p.type} ${p.name}${i < parameters.length - 1 ? ", " : ""}`,
        );

        const returnStatement = getMockReturnStatement(props.program, op.returnType);

        return code`public ${returnTypeExpr} ${methodName}(${paramList})
{
  ${returnStatement}
}`;
      }}
    </For>
  );
}
