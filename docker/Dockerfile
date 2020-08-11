FROM node:lts-alpine3.11 AS openvidu-call-build

WORKDIR /openvidu-call

RUN apk add git && \
    git clone "https://github.com/j-chick/openvidu-call-react" current-master-branch && \
    mv current-master-branch/openvidu-call-react . && \
    rm -rf current-master-branch && \
    rm -f openvidu-call-react/package-lock.json && \
    npm install --prefix=openvidu-call-react/ && \
    npm run build --prefix=openvidu-call-react/ && \
    mv openvidu-call-react/build . && \
    rm -rf openvidu-call-react

FROM node:lts-alpine3.11

WORKDIR /opt/openvidu-call

COPY --from=openvidu-call-build /openvidu-call/build ./build

COPY ./entrypoint.sh /usr/local/bin
RUN apk add curl && \
    chmod +x /usr/local/bin/entrypoint.sh && \
    npm install -g serve

# CMD ["/bin/sh"]
CMD ["/usr/local/bin/entrypoint.sh"]
