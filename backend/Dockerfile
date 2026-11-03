FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY gradlew settings.gradle build.gradle ./
COPY gradle ./gradle
RUN chmod +x gradlew
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:25-jre
RUN groupadd --system ajin && useradd --system --gid ajin --uid 10001 ajin && mkdir -p /app/storage && chown ajin:ajin /app/storage
WORKDIR /app
COPY --from=build /workspace/build/libs/ajin-on-api-0.1.0.jar /app/app.jar
USER ajin
ENV HOST=0.0.0.0 STORAGE_ROOT=/app/storage
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
