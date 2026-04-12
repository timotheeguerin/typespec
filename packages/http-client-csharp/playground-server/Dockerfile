# Build from the http-client-csharp package root:
#   docker build -f playground-server/Dockerfile -t csharp-playground-server .
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Build the generator with ReadyToRun pre-compilation to minimize JIT at runtime
COPY generator/ generator/
COPY eng/ eng/
RUN dotnet publish generator/Microsoft.TypeSpec.Generator/src -c Release -r linux-x64 --self-contained false -p:PublishReadyToRun=true -o dist/generator

# Build the server
COPY playground-server/playground-server.csproj playground-server/
RUN dotnet restore playground-server/playground-server.csproj
COPY playground-server/ playground-server/
RUN dotnet publish playground-server -c Release -o /app

# Copy generator output and test data
RUN cp -r dist/generator /app/generator
RUN mkdir -p /app/test-data && \
    cp generator/TestProjects/Spector/http/routes/tspCodeModel.json /app/test-data/ && \
    cp generator/TestProjects/Spector/http/routes/Configuration.json /app/test-data/

# Need full SDK (not just aspnet) because the server spawns `dotnet` to run the generator DLL
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Install SSH for remote debugging
RUN apt-get update && apt-get install -y openssh-server \
    && echo "root:Docker!" | chpasswd \
    && mkdir -p /run/sshd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY playground-server/sshd_config /etc/ssh/

ENV DOTNET_ENVIRONMENT=Production
ENV GENERATOR_PATH=/app/generator/Microsoft.TypeSpec.Generator.dll
ENV TMPDIR=/tmp
# Increase default stack size to 8MB (may be restricted in App Service)
ENV DOTNET_DefaultStackSize=0x800000
ENV COMPlus_DefaultStackSize=800000

EXPOSE 5174 2222
COPY playground-server/entrypoint.sh /entrypoint.sh
COPY playground-server/test-generator.sh /app/test-generator.sh
RUN chmod +x /entrypoint.sh /app/test-generator.sh
ENTRYPOINT ["/entrypoint.sh"]
