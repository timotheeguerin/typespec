// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Reflection.Metadata;
using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Simplification;
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

    /// <summary>
    /// Creates a MetadataReference from a loaded assembly using in-memory metadata,
    /// avoiding file system access which isn't available in WASM.
    /// </summary>
    private static unsafe MetadataReference? CreateMetadataReferenceFromAssembly(Assembly assembly)
    {
        if (assembly.TryGetRawMetadata(out byte* blob, out int length))
        {
            var moduleMetadata = ModuleMetadata.CreateFromMetadata((IntPtr)blob, length);
            var assemblyMetadata = AssemblyMetadata.Create(moduleMetadata);
            return assemblyMetadata.GetReference();
        }
        return null;
    }

    /// <summary>
    /// Collects metadata references from all loaded assemblies for Roslyn compilation.
    /// </summary>
    private static List<MetadataReference> CollectMetadataReferences()
    {
        var references = new List<MetadataReference>();
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.IsDynamic)
                continue;
            try
            {
                var reference = CreateMetadataReferenceFromAssembly(assembly);
                if (reference != null)
                    references.Add(reference);
            }
            catch
            {
                // Skip assemblies that can't provide metadata
            }
        }
        return references;
    }

    /// <summary>
    /// Runs Roslyn simplification and formatting on generated C# code.
    /// </summary>
    private static async System.Threading.Tasks.Task<Dictionary<string, string>> PostProcessFilesAsync(
        Dictionary<string, string> generatedFiles)
    {
        var metadataReferences = CollectMetadataReferences();

        using var workspace = new AdhocWorkspace();
        var projectId = ProjectId.CreateNewId();
        var projectInfo = ProjectInfo.Create(
            projectId,
            VersionStamp.Create(),
            "GeneratedCode",
            "GeneratedCode",
            LanguageNames.CSharp,
            compilationOptions: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary),
            metadataReferences: metadataReferences);

        var project = workspace.AddProject(projectInfo);

        // Add all generated files as documents
        var documentMap = new Dictionary<DocumentId, string>();
        foreach (var (filePath, content) in generatedFiles)
        {
            var document = project.AddDocument(filePath, Microsoft.CodeAnalysis.Text.SourceText.From(content));
            documentMap[document.Id] = filePath;
            project = document.Project;
        }

        // Apply the updated project to the workspace
        workspace.TryApplyChanges(project.Solution);
        project = workspace.CurrentSolution.GetProject(projectId)!;

        // Process each document: simplify and format
        var processed = new Dictionary<string, string>();

        foreach (var document in project.Documents)
        {
            if (!documentMap.ContainsKey(document.Id))
                continue;

            try
            {
                // Run Roslyn simplification (reduces qualified names like System.String → string)
                var simplified = await Simplifier.ReduceAsync(document);
                // Run Roslyn formatting
                var formatted = await Formatter.FormatAsync(simplified);
                var text = await formatted.GetTextAsync();
                processed[documentMap[document.Id]] = text.ToString();
            }
            catch
            {
                // If post-processing fails for a file, use the raw output
                var text = await document.GetTextAsync();
                processed[documentMap[document.Id]] = text.ToString();
            }
        }

        return processed;
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

        // 4. Set up the singleton instance and configure with in-memory metadata references
        CodeModelGenerator.Instance = generator;

        // Configure the generator, catching metadata reference errors that occur in WASM
        // (Assembly.Location is empty in WASM, but we handle references separately)
        try
        {
            generator.Configure();
        }
        catch (Exception)
        {
            // Expected - ScmCodeModelGenerator.Configure() tries CreateFromFile with empty paths
        }

        // Add metadata references from in-memory assemblies (works in WASM)
        foreach (var reference in CollectMetadataReferences())
        {
            generator.AddMetadataReference(reference);
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

        // 8. Generate raw code files
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

        // 9. Run Roslyn post-processing (simplification + formatting)
        try
        {
            generatedFiles = PostProcessFilesAsync(generatedFiles).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WASM] Roslyn post-processing failed, using raw output: {ex.Message}");
        }

        return JsonSerializer.Serialize(generatedFiles);
    }
}
