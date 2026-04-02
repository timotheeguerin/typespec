// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using Microsoft.TypeSpec.Generator;
using Microsoft.TypeSpec.Generator.ClientModel;
using Microsoft.TypeSpec.Generator.Input;
using Microsoft.TypeSpec.Generator.Primitives;
using Microsoft.TypeSpec.Generator.SourceInput;

namespace Microsoft.TypeSpec.Generator.Wasm;

public partial class WasmGenerator
{
    /// <summary>
    /// Generates C# source files from a tspCodeModel.json and Configuration.json.
    /// Called from JavaScript via [JSExport].
    /// </summary>
    /// <param name="codeModelJson">The tspCodeModel.json content</param>
    /// <param name="configurationJson">The Configuration.json content</param>
    /// <returns>JSON object mapping file paths to generated C# content</returns>
    [JSExport]
    public static string Generate(string codeModelJson, string configurationJson)
    {
        try
        {
            return GenerateCore(codeModelJson, configurationJson);
        }
        catch (Exception ex)
        {
            var error = new Dictionary<string, string>
            {
                ["__error"] = ex.ToString()
            };
            return JsonSerializer.Serialize(error);
        }
    }

    private static string GenerateCore(string codeModelJson, string configurationJson)
    {
        // 1. Write the code model to a temp path on the WASM virtual filesystem
        //    so that InputLibrary can load it normally
        const string tempOutputPath = "/tmp/typespec-wasm-output";
        Directory.CreateDirectory(tempOutputPath);
        File.WriteAllText(Path.Combine(tempOutputPath, "tspCodeModel.json"), codeModelJson);

        // 2. Create configuration from JSON string (internal API, accessible via InternalsVisibleTo)
        var configuration = Configuration.Load(tempOutputPath, configurationJson);

        // 3. Create the generator context and instantiate the generator directly (no MEF)
        var context = new GeneratorContext(configuration);
        var generator = new ScmCodeModelGenerator(context);

        // 4. Set up the singleton instance
        CodeModelGenerator.Instance = generator;

        // Configure() loads Roslyn metadata references from assembly paths,
        // which aren't available in WASM. This is safe to skip since we don't
        // run Roslyn post-processing in the playground.
        try
        {
            generator.Configure();
        }
        catch (Exception)
        {
            // Expected in WASM - assembly locations are empty strings
        }

        // 5. Set a minimal SourceInputModel (no custom code, no baseline contract)
        CodeModelGenerator.Instance.SourceInputModel = new SourceInputModel(null, null);

        // 6. Build the output library - this creates all type providers
        var output = generator.OutputLibrary;
        foreach (var type in output.TypeProviders)
        {
            type.EnsureBuilt();
        }

        // 7. Run visitors
        foreach (var visitor in CodeModelGenerator.Instance.Visitors)
        {
            visitor.VisitLibrary(output);
        }

        // 8. Generate code files directly (skip Roslyn post-processing for WASM)
        var generatedFiles = new Dictionary<string, string>();

        foreach (var outputType in output.TypeProviders)
        {
            var writer = CodeModelGenerator.Instance.GetWriter(outputType);
            var codeFile = writer.Write();
            generatedFiles[codeFile.Name] = codeFile.Content;

            // Also generate serialization providers
            foreach (var serialization in outputType.SerializationProviders)
            {
                writer = CodeModelGenerator.Instance.GetWriter(serialization);
                codeFile = writer.Write();
                generatedFiles[codeFile.Name] = codeFile.Content;
            }
        }

        return JsonSerializer.Serialize(generatedFiles);
    }
}
