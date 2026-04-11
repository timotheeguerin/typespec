# Build from the http-client-csharp package root:
#   docker build -f playground-server/Dockerfile -t csharp-playground-server .
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Build the generator targeting net9.0 (instead of net10.0) for runtime stability
COPY generator/ generator/
COPY eng/ eng/
RUN dotnet build generator -c Release -p:TargetFramework=net9.0

# Build the server
COPY playground-server/playground-server.csproj playground-server/
RUN dotnet restore playground-server/playground-server.csproj
COPY playground-server/ playground-server/
RUN dotnet publish playground-server -c Release -o /app

# Copy generator output
RUN cp -r dist/generator /app/generator

# Need full SDK (not just aspnet) because the server spawns `dotnet` to run the generator DLL
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Install SSH, lldb, and dotnet-dump for crash analysis
RUN apt-get update && apt-get install -y openssh-server lldb \
    && echo "root:Docker!" | chpasswd \
    && mkdir -p /run/sshd \
    && dotnet tool install -g dotnet-dump \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY playground-server/sshd_config /etc/ssh/
ENV PATH="$PATH:/root/.dotnet/tools"

ENV DOTNET_ENVIRONMENT=Production
ENV GENERATOR_PATH=/app/generator/Microsoft.TypeSpec.Generator.dll
ENV TMPDIR=/tmp
# Disable .NET diagnostics to prevent segfaults in containers
ENV COMPlus_EnableDiagnostics=0
ENV DOTNET_EnableDiagnostics=0

EXPOSE 5174 2222
COPY playground-server/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
