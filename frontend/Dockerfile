FROM node:20-alpine

WORKDIR /app

COPY package.json /app/
COPY webpack.config.js /app/
COPY .babelrc /app/
COPY public /app/public
COPY src /app/src

RUN npm install

ENV PORT=3003
EXPOSE 3003

CMD ["npm", "start"]