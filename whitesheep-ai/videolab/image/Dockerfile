FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime
RUN pip install --no-cache-dir diffusers==0.32.2 transformers==4.47.1 accelerate==1.2.1 safetensors==0.5.2
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HOME=/tmp/huggingface
WORKDIR /app
CMD ["python", "-u", "/app/image_worker.py"]
