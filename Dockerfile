FROM node:22.16.0-alpine

RUN apk add --no-cache ffmpeg openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4568

CMD ["npm", "start"]
