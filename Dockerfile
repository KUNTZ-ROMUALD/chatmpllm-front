# ==================================
# BUILD ANGULAR
# ==================================
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration production


# ==================================
# NGINX PRODUCTION
# ==================================
FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/chatmpapp-front/browser/ /usr/share/nginx/html/

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
