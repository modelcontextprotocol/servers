FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml README.md LICENSE ./
COPY aag ./aag
COPY fixtures ./fixtures
RUN pip install --no-cache-dir .
LABEL org.opencontainers.image.source="https://github.com/AAH20/agent-action-gate"
LABEL org.opencontainers.image.description="Gate/Prove MCP server — deny unattended destructive agent tools"
LABEL io.modelcontextprotocol.server.name="io.github.AAH20/agent-action-gate"
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python3", "-m", "aag", "serve"]
