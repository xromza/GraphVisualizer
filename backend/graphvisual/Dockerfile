FROM eclipse-temurin:25-jdk-jammy AS builder
WORKDIR /build

COPY .mvn/ .mvn
COPY mvnw ./

COPY pom.xml ./

RUN --mount=type=cache,target=/root/.m2/repository ./mvnw dependency:go-offline -Dmaven.test.skip=true -B -am

COPY src ./src

RUN --mount=type=cache,target=/root/.m2/repository ./mvnw clean package -Dmaven.test.skip=true -am
RUN java -Djarmode=tools -jar target/*-exec.jar extract --layers --launcher --destination extracted_layers

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=builder /build/extracted_layers/dependencies/ ./
COPY --from=builder /build/extracted_layers/spring-boot-loader/ ./
COPY --from=builder /build/extracted_layers/snapshot-dependencies/ ./
COPY --from=builder /build/extracted_layers/application/ ./

ENV JAVA_OPTS="-XX:+UseG1GC -XX:MaxRAMPercentage=75.0"

ENTRYPOINT [ "sh", "-c", "java $JAVA_OPTS org.springframework.boot.loader.launch.JarLauncher" ]