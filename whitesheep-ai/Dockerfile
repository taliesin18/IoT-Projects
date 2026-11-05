FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY requirements.txt requirements-dev.txt ./
RUN pip install --no-cache-dir -r requirements-dev.txt && useradd --uid 10001 --create-home whitesheep
COPY app ./app
COPY config ./config
COPY videolab/generated/SCENE_API.md ./videolab/generated/SCENE_API.md
COPY videolab/generated/AUTHORING_GUIDE.md ./videolab/generated/AUTHORING_GUIDE.md
COPY videolab/image_worker.py ./videolab/image_worker.py
COPY tests ./tests
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers"]
