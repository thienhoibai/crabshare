FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ backend/
COPY database/ database/
ARG SOURCE_REVISION=unknown
RUN dotnet publish backend/src/CrabShare.Api/CrabShare.Api.csproj -c Release -r linux-x64 --self-contained false -p:UseAppHost=false -p:SourceRevisionId=${SOURCE_REVISION} -o /out/api \
    && dotnet publish backend/tools/CrabShare.DbMigrator/CrabShare.DbMigrator.csproj -c Release -o /out/migrator \
    && rm -f /out/api/appsettings.Development.json

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production ASPNETCORE_HTTP_PORTS=8080 \
    Storage__RootPath=/var/lib/crabshare/storage Security__DataProtectionKeyPath=/var/lib/crabshare/keys
RUN mkdir -p /var/lib/crabshare/storage /var/lib/crabshare/keys \
    && chown -R $APP_UID:$APP_UID /var/lib/crabshare && chmod 700 /var/lib/crabshare/keys
COPY --from=build /out/api/ ./
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "CrabShare.Api.dll"]

FROM mcr.microsoft.com/dotnet/runtime:10.0 AS migrator
WORKDIR /app
COPY --from=build /out/migrator/ ./
COPY database/migrations/ database/migrations/
USER $APP_UID
ENTRYPOINT ["dotnet", "CrabShare.DbMigrator.dll"]

# Default target is the API. Migrations are an explicit separate operation.
FROM runtime AS api
