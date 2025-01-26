FROM node:22

WORKDIR /app

COPY package.json /app
RUN npm install

COPY . /app

EXPOSE 4568

CMD ["npm", "start"]
