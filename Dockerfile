FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

CMD ["npm", "start", "--", "--host", "0.0.0.0", "--port", "4200"]
