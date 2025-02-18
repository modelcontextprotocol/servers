FROM python:3.11-slim AS builder

COPY src /app
COPY requirements.txt /app/requirements.txt

WORKDIR /app

RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim AS release

COPY --from=builder /app /app

WORKDIR /app

CMD ["python", "-m", "sequentialthinking"]
