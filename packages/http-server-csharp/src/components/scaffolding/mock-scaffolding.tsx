import { code, For, SourceDirectory, type Children } from "@alloy-js/core";
import * as cs from "@alloy-js/csharp";
import type { Interface, Operation, Program, Type } from "@typespec/compiler";
import { isErrorModel, isVoidType } from "@typespec/compiler";
import type { OperationHttpCanonicalization } from "@typespec/http-canonicalization";
import { useTsp } from "@typespec/emitter-framework";
import { CSharpFile } from "../csharp-file.jsx";
import { TypeExpression } from "../type-expression.jsx";

export interface MockHelpersProps {
  interfaceRegistrations: string[];
}

/**
 * Renders the mock helper files: IInitializer, Initializer, MockRegistration.
 * These go under the TypeSpec.Helpers namespace.
 */
export function MockHelpers(props: MockHelpersProps): Children {
  return (
    <cs.Namespace name="TypeSpec.Helpers">
      <SourceDirectory path="mocks">
        <InitializerInterface />
        <InitializerImplementation />
        {props.interfaceRegistrations.length > 0 && (
          <MockRegistration interfaceRegistrations={props.interfaceRegistrations} />
        )}
      </SourceDirectory>
    </cs.Namespace>
  );
}

export interface MockImplementationsProps {
  interfaces: Interface[];
  /** Map from interface name to its canonicalized HTTP operations. */
  canonicalOpsMap?: Map<string, OperationHttpCanonicalization[]>;
}

/**
 * Renders per-interface mock implementation classes.
 * These go under the service namespace.
 */
export function MockImplementations(props: MockImplementationsProps): Children {
  return (
    <SourceDirectory path="mocks">
      <For each={props.interfaces}>
        {(iface) => (
          <MockImplementation
            type={iface}
            canonicalOps={props.canonicalOpsMap?.get(iface.name)}
          />
        )}
      </For>
    </SourceDirectory>
  );
}

function InitializerInterface(): Children {
  return (
    <CSharpFile path="IInitializer.cs">
      {code`
        /// <summary>
        /// Interface for object initialization in mocks
        /// </summary>
        public interface IInitializer
        {
          /// <summary>
          /// Initialize an object of the given type
          /// </summary>
          /// <param name="type"> The type to initialize</param>
          /// <returns>An instance of the given type. Or null if initialization was impossible.</returns>
          object? Initialize(System.Type type);
          /// <summary>
          /// Initialize an object of the given type
          /// </summary>
          /// <typeparam name="T">The type to initialize</typeparam>
          /// <returns>An instance of the given type</returns>
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
        /// <summary>
        /// Default initializer for mock implementations of business logic interfaces
        /// </summary>
        public class Initializer : IInitializer
        {
          /// <summary>
          /// Instantiate the initializer.  The cache *should* be instantiated using ASP.Net Core's dependency injection
          /// </summary>
          /// <param name="cache"></param>
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

          /// <summary>
          /// Initialize an object fo the given type
          /// </summary>
          /// <param name="type"> The type to initialize</param>
          /// <returns>An instance of the given type. Or null if initialization was impossible.</returns>
          public object? Initialize(Type type)
          {
            if (Cache.ContainsKey(type))
            {
              return Cache[type];
            }
            if (type == typeof(string))
            {
              return CacheAndReturn(type, string.Empty);
            }
            if (type == typeof(int))
            {
              return CacheAndReturn(type, 0);
            }
            if (type == typeof(long))
            {
              return CacheAndReturn(type, 0L);
            }
            if (type == typeof(float))
            {
              return CacheAndReturn(type, 0.0f);
            }
            if (type == typeof(double))
            {
              return CacheAndReturn(type, 0.0);
            }
            if (type == typeof(decimal))
            {
              return CacheAndReturn(type, 0.0m);
            }
            if (type == typeof(bool))
            {
              return CacheAndReturn(type, false);
            }
            if (type == typeof(byte))
            {
              return CacheAndReturn(type, (byte)0);
            }
            if (type == typeof(char))
            {
              return CacheAndReturn(type, (char)0);
            }
            if (type == typeof(short))
            {
              return CacheAndReturn(type, (short)0);
            }
            if (type == typeof(uint))
            {
              return CacheAndReturn(type, (uint)0);
            }
            if (type == typeof(ulong))
            {
              return CacheAndReturn(type, (ulong)0);
            }
            if (type == typeof(ushort))
            {
              return CacheAndReturn(type, (ushort)0);
            }
            if (type == typeof(sbyte))
            {
              return CacheAndReturn(type, (sbyte)0);
            }
            if (type == typeof(DateTime))
            {
              return CacheAndReturn(type, DateTime.UtcNow);
            }
            if (type == typeof(DateTimeOffset))
            {
              return CacheAndReturn(type, DateTimeOffset.UtcNow);
            }
            if (type == typeof(TimeSpan))
            {
              return CacheAndReturn(type, TimeSpan.Zero);
            }
            if (type.IsArray)
            {
              var element = type.GetElementType();
              if (element == null)
                return null;
              return CacheAndReturn(type, Array.CreateInstance(element, 0));
            }
            if (type.IsGenericType)
            {
              var elementType = type.GetGenericArguments()[0];
              if (elementType == null)
                return null;

              if (type.GetGenericTypeDefinition() == typeof(IEnumerable<>))
              {
                return CacheAndReturn(type, Activator.CreateInstance(typeof(List<>).MakeGenericType(elementType)));
              }
              if (type.GetGenericTypeDefinition() == typeof(ISet<>))
              {
                return CacheAndReturn(type, Activator.CreateInstance(typeof(HashSet<>).MakeGenericType(elementType)));
              }
            }
            if (type.IsClass)
            {
              return InitializeClass(type);
            }
            var genericType = Nullable.GetUnderlyingType(type);
            if ((genericType != null))
            {
              return Initialize(genericType);
            }
            if (type.IsEnum)
            {
              return CacheAndReturn(type, Enum.GetValues(type).GetValue(0));
            }
            return new object();
          }

          /// <summary>
          /// Initialize an object of the given type
          /// </summary>
          /// <typeparam name="T">The type to initialize</typeparam>
          /// <returns>An instance of the given type</returns>
          public T Initialize<T>() where T : class, new()
          {
            var result = new T();
            var initialized = InitializeClass(typeof(T), result);
            return initialized as T ?? result;
          }

          private object? InitializeClass(Type type, object? instance = null)
          {
            if (Cache.ContainsKey(type))
            {
              instance = Cache[type];
              return instance;
            }

            var result = instance == null ? Activator.CreateInstance(type) : instance;
            foreach (var property in type.GetProperties())
            {
              if (property.CanWrite)
              {
                var propertyType = property.PropertyType;
                property.SetValue(result, Initialize(propertyType));
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
        /// <summary>
        /// Register Business Logic implementations. Replace with actual implementations when available.
        /// </summary>
        public static class MockRegistration
        {
          public static void Register(WebApplicationBuilder builder)
          {
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddScoped<IJsonSerializationProvider, JsonSerializationProvider>();
            // Used for mock implementation only. Remove once business logic interfaces are implemented.
            builder.Services.AddSingleton<IDictionary<Type, object?>>(new Dictionary<Type, object?>());
            builder.Services.AddScoped<IInitializer, Initializer>();
            // Mock business logic implementations
            ${registrations}
            // Included for multipart/form-data support
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
  canonicalOps?: OperationHttpCanonicalization[];
}

/**
 * Generates a mock implementation class for a business logic interface.
 */
function MockImplementation(props: MockImplementationProps): Children {
  const namePolicy = cs.useCSharpNamePolicy();
  const { $ } = useTsp();
  const interfaceName = `I${namePolicy.getName(props.type.name, "class")}`;
  const className = namePolicy.getName(props.type.name, "class");
  const operations = Array.from(props.type.operations.entries());

  // Build canonical ops map by name
  const canonicalMap = new Map<string, OperationHttpCanonicalization>();
  if (props.canonicalOps) {
    for (const cop of props.canonicalOps) {
      canonicalMap.set(cop.name, cop);
    }
  }

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
        /// <summary>
        /// This is a mock implementation of the business logic interface for
        /// demonstration and early development.  Feel free to overwrite this file.
        /// Or replace it with another implementation, and register that implementation
        /// in the dependency injection container
        /// </summary>
        public class ${className} : ${interfaceName}
        {
          /// <summary>
          /// The controller constructor, using the dependency injection container to satisfy the parameters.
          /// </summary>
          /// <param name="initializer">The initializer class, registered with dependency injection</param>
          /// <param name="accessor">The accessor for the HttpContext, allows your implementation to
          /// get properties of the incoming request and to set properties of the outgoing response.</param>
          public ${className}(IInitializer initializer, IHttpContextAccessor accessor)
          {
            _initializer = initializer;
            HttpContextAccessor = accessor;
          }

          private IInitializer _initializer;

          /// <summary>
          /// Use this property in your implementation to access properties of the incoming HttpRequest
          /// and to set properties of the outgoing HttpResponse
          /// </summary>
          public IHttpContextAccessor HttpContextAccessor { get; }

          ${(<MockMethods operations={operations} program={$.program} canonicalMap={canonicalMap} />)}
        }
      `}
    </CSharpFile>
  );
}

interface MockMethodsProps {
  operations: [string, Operation][];
  program: Program;
  canonicalMap?: Map<string, OperationHttpCanonicalization>;
}

/** Get body property names to filter for GET operations. */
function getGetBodyPropNames(
  opName: string,
  canonicalMap?: Map<string, OperationHttpCanonicalization>,
): Set<string> {
  const bodyPropNames = new Set<string>();
  const canonicalOp = canonicalMap?.get(opName);
  if (!canonicalOp || canonicalOp.method !== "get") return bodyPropNames;

  const body = canonicalOp.requestParameters.body;
  if (body?.bodyKind === "single" && body.bodies.length > 0) {
    const bodyType = body.bodies[0].type.sourceType;
    if (bodyType.kind === "Model") {
      for (const [name] of bodyType.properties) {
        bodyPropNames.add(name);
      }
    }
  }
  for (const p of canonicalOp.requestParameters.properties) {
    if (p.kind === "body" || p.kind === "bodyRoot" || p.kind === "bodyProperty") {
      bodyPropNames.add(p.property.sourceType.name);
    }
  }
  return bodyPropNames;
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

        const bodyPropNames = getGetBodyPropNames(name, props.canonicalMap);
        const parameters = Array.from(op.parameters.properties.entries())
          .filter(([pName]) => !bodyPropNames.has(pName))
          .map(([pName, prop]) => ({
            name: namePolicy.getName(pName, "parameter"),
            type: (<TypeExpression type={prop.type} />) as Children,
            optional: prop.optional,
          }))
          // Required parameters must come before optional ones in C#
          .sort((a, b) => (a.optional === b.optional ? 0 : a.optional ? 1 : -1));

        const paramList = parameters.map(
          (p, i) => code`${p.type}${p.optional ? "?" : ""} ${p.name}${i < parameters.length - 1 ? ", " : ""}`,
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
