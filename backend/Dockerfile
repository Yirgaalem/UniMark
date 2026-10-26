FROM gradle:8.14.3-jdk17 AS build
WORKDIR /workspace
COPY . .
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/build/libs/unimark-api-0.1.0.jar /app/unimark-api.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/unimark-api.jar"]
