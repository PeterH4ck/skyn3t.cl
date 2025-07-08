version: '3.8'

services:
  # =====================================================
  # DATABASES
  # =====================================================
  
  postgres:
    image: postgres:15-alpine
    container_name: skyn3t-postgres
    environment:
      POSTGRES_DB: master_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres123}
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=en_US.UTF-8"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/src/database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./backend/src/database/seeds:/docker-entrypoint-initdb.d/seeds
    ports:
      - "5432:5432"
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  postgres-replica:
    image: postgres:15-alpine
    container_name: skyn3t-postgres-replica
    environment:
      POSTGRES_DB: master_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres123}
      POSTGRES_MASTER_SERVICE: postgres
    volumes:
      - postgres_replica_data:/var/lib/postgresql/data
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  # =====================================================
  # CACHE & MESSAGE QUEUE
  # =====================================================

  redis-master:
    image: redis:7-alpine
    container_name: skyn3t-redis-master
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis123}
    volumes:
      - redis_master_data:/data
    ports:
      - "6379:6379"
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis-slave:
    image: redis:7-alpine
    container_name: skyn3t-redis-slave
    command: redis-server --slaveof redis-master 6379 --requirepass ${REDIS_PASSWORD:-redis123} --masterauth ${REDIS_PASSWORD:-redis123}
    volumes:
      - redis_slave_data:/data
    networks:
      - skyn3t-network
    depends_on:
      - redis-master
    restart: unless-stopped

  redis-sentinel:
    image: redis:7-alpine
    container_name: skyn3t-redis-sentinel
    command: redis-sentinel /etc/redis-sentinel/sentinel.conf
    volumes:
      - ./config/redis-sentinel.conf:/etc/redis-sentinel/sentinel.conf
    networks:
      - skyn3t-network
    depends_on:
      - redis-master
      - redis-slave
    restart: unless-stopped

  rabbitmq:
    image: rabbitmq:3.12-management-alpine
    container_name: skyn3t-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-admin}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD:-rabbitmq123}
      RABBITMQ_DEFAULT_VHOST: skyn3t
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
      - rabbitmq_logs:/var/log/rabbitmq
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # =====================================================
  # STORAGE
  # =====================================================

  minio:
    image: minio/minio:latest
    container_name: skyn3t-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin123}
      MINIO_DEFAULT_BUCKETS: documents,photos,backups,exports
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    restart: unless-stopped

  # =====================================================
  # SEARCH & ANALYTICS
  # =====================================================

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: skyn3t-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200"]
      interval: 30s
      timeout: 10s
      retries: 5
    restart: unless-stopped

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: skyn3t-kibana
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    ports:
      - "5601:5601"
    networks:
      - skyn3t-network
    depends_on:
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  # =====================================================
  # TIME SERIES DATABASE
  # =====================================================

  influxdb:
    image: influxdb:2.7-alpine
    container_name: skyn3t-influxdb
    environment:
      DOCKER_INFLUXDB_INIT_MODE: setup
      DOCKER_INFLUXDB_INIT_USERNAME: ${INFLUXDB_USER:-admin}
      DOCKER_INFLUXDB_INIT_PASSWORD: ${INFLUXDB_PASSWORD:-influxdb123}
      DOCKER_INFLUXDB_INIT_ORG: skyn3t
      DOCKER_INFLUXDB_INIT_BUCKET: metrics
      DOCKER_INFLUXDB_INIT_ADMIN_TOKEN: ${INFLUXDB_TOKEN:-mytoken123}
    ports:
      - "8086:8086"
    volumes:
      - influxdb_data:/var/lib/influxdb2
      - influxdb_config:/etc/influxdb2
    networks:
      - skyn3t-network
    restart: unless-stopped

  # =====================================================
  # MONITORING
  # =====================================================

  prometheus:
    image: prom/prometheus:latest
    container_name: skyn3t-prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    networks:
      - skyn3t-network
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: skyn3t-grafana
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-grafana123}
      GF_INSTALL_PLUGINS: grafana-clock-panel,grafana-simple-json-datasource
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./config/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./config/grafana/datasources:/etc/grafana/provisioning/datasources
    networks:
      - skyn3t-network
    depends_on:
      - prometheus
      - influxdb
    restart: unless-stopped

  # =====================================================
  # MQTT BROKER FOR IOT
  # =====================================================

  mosquitto:
    image: eclipse-mosquitto:latest
    container_name: skyn3t-mosquitto
    ports:
      - "1883:1883"
      - "9002:9001"
    volumes:
      - ./config/mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data
      - mosquitto_logs:/mosquitto/log
    networks:
      - skyn3t-network
    restart: unless-stopped

  # =====================================================
  # API GATEWAY
  # =====================================================

  kong:
    image: kong:3.4-alpine
    container_name: skyn3t-kong
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /kong/declarative/kong.yml
      KONG_PROXY_ACCESS_LOG: /dev/stdout
      KONG_ADMIN_ACCESS_LOG: /dev/stdout
      KONG_PROXY_ERROR_LOG: /dev/stderr
      KONG_ADMIN_ERROR_LOG: /dev/stderr
      KONG_ADMIN_LISTEN: 0.0.0.0:8001
    ports:
      - "8000:8000"  # Proxy
      - "8443:8443"  # Proxy SSL
      - "8001:8001"  # Admin API
      - "8444:8444"  # Admin API SSL
    volumes:
      - ./config/kong.yml:/kong/declarative/kong.yml
    networks:
      - skyn3t-network
    healthcheck:
      test: ["CMD", "kong", "health"]
      interval: 10s
      timeout: 10s
      retries: 10
    restart: unless-stopped

  # =====================================================
  # MICROSERVICES
  # =====================================================

  auth-service:
    build:
      context: ./backend
      dockerfile: Dockerfile.auth
    container_name: skyn3t-auth-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3001
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      JWT_SECRET: ${JWT_SECRET:-your-jwt-secret-here}
      JWT_EXPIRE: 7d
      REFRESH_TOKEN_EXPIRE: 30d
    ports:
      - "3001:3001"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
    restart: unless-stopped

  permission-service:
    build:
      context: ./permission-service
      dockerfile: Dockerfile
    container_name: skyn3t-permission-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3002
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: master_db
      DB_USER: postgres
      DB_PASSWORD: ${POSTGRES_PASSWORD:-postgres123}
      REDIS_HOST: redis-master
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-redis123}
      JWT_SECRET: ${JWT_SECRET:-your-jwt-secret-here}
      FRONTEND_URL: ${FRONTEND_URL:-http://localhost:3000}
    ports:
      - "3002:3002"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
    restart: unless-stopped

  user-service:
    build:
      context: ./backend
      dockerfile: Dockerfile.users
    container_name: skyn3t-user-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3003
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      MINIO_ENDPOINT: minio
      MINIO_PORT: 9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin123}
    ports:
      - "3003:3003"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped

  device-service:
    build:
      context: ./backend
      dockerfile: Dockerfile.devices
    container_name: skyn3t-device-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3004
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      MQTT_BROKER: mqtt://mosquitto:1883
      INFLUXDB_URL: http://influxdb:8086
      INFLUXDB_TOKEN: ${INFLUXDB_TOKEN:-mytoken123}
      INFLUXDB_ORG: skyn3t
      INFLUXDB_BUCKET: metrics
    ports:
      - "3004:3004"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      mosquitto:
        condition: service_started
      influxdb:
        condition: service_started
    restart: unless-stopped

  payment-service:
    build:
      context: ./payment-service
      dockerfile: Dockerfile
    container_name: skyn3t-payment-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3005
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      RABBITMQ_URL: amqp://${RABBITMQ_USER:-admin}:${RABBITMQ_PASSWORD:-rabbitmq123}@rabbitmq:5672/skyn3t
      # Bank configurations (encrypted in production)
      BANCO_ESTADO_API_KEY: ${BANCO_ESTADO_API_KEY}
      SANTANDER_CLIENT_ID: ${SANTANDER_CLIENT_ID}
      BCI_API_TOKEN: ${BCI_API_TOKEN}
      PAYPAL_CLIENT_ID: ${PAYPAL_CLIENT_ID}
      PAYPAL_CLIENT_SECRET: ${PAYPAL_CLIENT_SECRET}
    ports:
      - "3005:3005"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

  notification-service:
    build:
      context: ./notification-service
      dockerfile: Dockerfile
    container_name: skyn3t-notification-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3006
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      RABBITMQ_URL: amqp://${RABBITMQ_USER:-admin}:${RABBITMQ_PASSWORD:-rabbitmq123}@rabbitmq:5672/skyn3t
      # Email config
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      # SMS config
      TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID}
      TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN}
      TWILIO_PHONE_NUMBER: ${TWILIO_PHONE_NUMBER}
      # WhatsApp config
      WHATSAPP_API_URL: ${WHATSAPP_API_URL}
      WHATSAPP_API_TOKEN: ${WHATSAPP_API_TOKEN}
    ports:
      - "3006:3006"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

  analytics-service:
    build:
      context: ./analytics-service
      dockerfile: Dockerfile
    container_name: skyn3t-analytics-service
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      PORT: 3007
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      INFLUXDB_URL: http://influxdb:8086
      INFLUXDB_TOKEN: ${INFLUXDB_TOKEN:-mytoken123}
      INFLUXDB_ORG: skyn3t
      INFLUXDB_BUCKET: metrics
      ELASTICSEARCH_URL: http://elasticsearch:9200
    ports:
      - "3007:3007"
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      influxdb:
        condition: service_started
      elasticsearch:
        condition: service_healthy
    restart: unless-stopped

  ocr-service:
    build:
      context: ./ocr-service
      dockerfile: Dockerfile
    container_name: skyn3t-ocr-service
    environment:
      PYTHONUNBUFFERED: 1
      PORT: 3008
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin123}
      # OCR settings
      TESSERACT_LANG: spa+eng
      PLATE_RECOGNITION_MODEL: /models/chilean_plates.pkl
    ports:
      - "3008:3008"
    volumes:
      - ./ocr-service/models:/models
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      minio:
        condition: service_healthy
    restart: unless-stopped

  ml-service:
    build:
      context: ./ml-service
      dockerfile: Dockerfile
    container_name: skyn3t-ml-service
    environment:
      PYTHONUNBUFFERED: 1
      PORT: 3009
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      INFLUXDB_URL: http://influxdb:8086
      INFLUXDB_TOKEN: ${INFLUXDB_TOKEN:-mytoken123}
      MODEL_PATH: /models
      TRAINING_SCHEDULE: "0 2 * * *"
    ports:
      - "3009:3009"
    volumes:
      - ./ml-service/models:/models
      - ml_training_data:/data
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      influxdb:
        condition: service_started
    restart: unless-stopped

  # =====================================================
  # SCHEDULED JOBS
  # =====================================================

  scheduler:
    build:
      context: ./scheduler
      dockerfile: Dockerfile
    container_name: skyn3t-scheduler
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:-postgres123}@postgres:5432/master_db
      REDIS_URL: redis://:${REDIS_PASSWORD:-redis123}@redis-master:6379/0
      RABBITMQ_URL: amqp://${RABBITMQ_USER:-admin}:${RABBITMQ_PASSWORD:-rabbitmq123}@rabbitmq:5672/skyn3t
    networks:
      - skyn3t-network
    depends_on:
      postgres:
        condition: service_healthy
      redis-master:
        condition: service_healthy
      rabbitmq:
        condition: service_healthy
    restart: unless-stopped

  # =====================================================
  # BACKUP SERVICE
  # =====================================================

  backup:
    build:
      context: ./backup
      dockerfile: Dockerfile
    container_name: skyn3t-backup
    environment:
      BACKUP_SCHEDULE: "0 3 * * *"
      RETENTION_DAYS: 30
      POSTGRES_HOST: postgres
      POSTGRES_DB: master_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres123}
      MINIO_ENDPOINT: minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD:-minioadmin123}
      MINIO_BUCKET: backups
    volumes:
      - backup_temp:/tmp/backups
    networks:
      - skyn3t-network
    depends_on:
      - postgres
      - minio
    restart: unless-stopped

  # =====================================================
  # NGINX REVERSE PROXY
  # =====================================================

  nginx:
    image: nginx:alpine
    container_name: skyn3t-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/ssl:/etc/nginx/ssl
      - nginx_logs:/var/log/nginx
    networks:
      - skyn3t-network
    depends_on:
      - kong
      - grafana
      - kibana
    restart: unless-stopped

  # =====================================================
  # FRONTEND (PLACEHOLDER - WILL BE IMPLEMENTED IN PHASE 4)
  # =====================================================

  frontend:
    image: nginx:alpine
    container_name: skyn3t-frontend
    ports:
      - "3000:80"
    volumes:
      - ./frontend/build:/usr/share/nginx/html
      - ./nginx/frontend.conf:/etc/nginx/nginx.conf
    networks:
      - skyn3t-network
    restart: unless-stopped

# =====================================================
# NETWORKS
# =====================================================

networks:
  skyn3t-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.0.0/16

# =====================================================
# VOLUMES
# =====================================================

volumes:
  # Database volumes
  postgres_data:
    driver: local
  postgres_replica_data:
    driver: local
  
  # Cache volumes
  redis_master_data:
    driver: local
  redis_slave_data:
    driver: local
  
  # Message queue volumes
  rabbitmq_data:
    driver: local
  rabbitmq_logs:
    driver: local
  
  # Storage volumes
  minio_data:
    driver: local
  
  # Search volumes
  elasticsearch_data:
    driver: local
  
  # Time series volumes
  influxdb_data:
    driver: local
  influxdb_config:
    driver: local
  
  # Monitoring volumes
  prometheus_data:
    driver: local
  grafana_data:
    driver: local
  
  # MQTT volumes
  mosquitto_data:
    driver: local
  mosquitto_logs:
    driver: local
  
  # ML volumes
  ml_training_data:
    driver: local
  
  # Backup volumes
  backup_temp:
    driver: local
  
  # Logs
  nginx_logs:
    driver: local