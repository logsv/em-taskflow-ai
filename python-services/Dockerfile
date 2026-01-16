FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY . .

EXPOSE 8001 8002

CMD ["bash", "./start-services.sh"]

