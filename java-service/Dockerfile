# ═══════════════════════════════════════════════════════════════
# NetBypass Java Service — Dockerfile
# For deployment on Railway, Render, or any container platform.
# ═══════════════════════════════════════════════════════════════

# Stage 1: Build with Maven
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /build

# Copy pom first (layer-cache dependencies)
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build fat JAR
COPY src ./src
RUN mvn package -DskipTests -q

# ───────────────────────────────────────────────────────────────
# Stage 2: Runtime — slim JRE image
# ───────────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-jammy

WORKDIR /app

# Copy the fat JAR from the builder stage
COPY --from=builder /build/target/netbypass-service-1.0.0.jar app.jar

# Railway sets PORT automatically; default to 8080
EXPOSE 8080

# Run the Spring Boot app
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
