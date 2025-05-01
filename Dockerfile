FROM node:18-slim

# ① build-essential（make/g++/gcc）、② python3 + python symlink を追加
RUN apt-get update && \
    apt-get install -y \
    build-essential \
    python3 \
    python3-pip \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package.json と lockfile を先にコピーして依存だけインストール
COPY package.json package-lock.json* ./
RUN npm install

# アプリ本体をコピー
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
