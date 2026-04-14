import { type Children } from "@alloy-js/core";
import { CsprojFile } from "@alloy-js/csharp";

export interface CsprojProps {
  /** The project name (without extension). */
  projectName: string;
  /** Whether to include SwaggerUI NuGet package. */
  useSwaggerUI?: boolean;
}

/**
 * Renders a .csproj file for the ASP.NET service project.
 */
export function Csproj(props: CsprojProps): Children {
  const swaggerPackage = props.useSwaggerUI
    ? `\n  <ItemGroup>\n    <PackageReference Include="SwashBuckle.AspNetCore" Version="7.3.1" />\n  </ItemGroup>`
    : "";

  return (
    <CsprojFile path={`${props.projectName}.csproj`} sdk="Microsoft.NET.Sdk.Web">
      {`  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>${swaggerPackage}`}
    </CsprojFile>
  );
}
