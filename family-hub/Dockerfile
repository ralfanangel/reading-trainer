FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV FAMILY_HUB_DATA=/data
ENV FAMILY_HUB_HOST=0.0.0.0
ENV FAMILY_HUB_PORT=8755
EXPOSE 8755
VOLUME ["/data"]

CMD ["python", "server.py"]
