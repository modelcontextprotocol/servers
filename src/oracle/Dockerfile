FROM node:slim AS builder

COPY src/oracle /app
COPY tsconfig.json /tsconfig.json

WORKDIR /app

RUN --mount=type=cache,target=/root/.npm npm install

RUN npm run build

RUN --mount=type=cache,target=/root/.npm-production npm ci --ignore-scripts --omit-dev

FROM dhi.io/node:26-alpine-sfw-ent-dev AS shim-builder
RUN apk update && apk add --no-cache gcc musl-dev
WORKDIR /tmp
RUN echo '#define _GNU_SOURCE' > shim.c && \
    echo '#include <stdlib.h>' >> shim.c && \
    echo '#include <sys/socket.h>' >> shim.c && \
    echo '#include <netinet/in.h>' >> shim.c && \
    echo 'char *canonicalize_file_name(const char *path) { return realpath(path, NULL); }' >> shim.c && \
    echo 'int bindresvport(int sd, struct sockaddr_in *sin) { return 0; }' >> shim.c && \
    echo 'int __dn_expand(const unsigned char *msg, const unsigned char *eomorig, const unsigned char *comp_dn, char *exp_dn, int length) { return 0; }' >> shim.c && \
    echo 'int __dn_skipname(const unsigned char *comp_dn, const unsigned char *eom) { return 0; }' >> shim.c && \
    echo 'int __res_nsearch(void *statp, const char *dname, int class, int type, unsigned char *answer, int anslen) { return -1; }' >> shim.c && \
    gcc -shared -fPIC -o libshim.so shim.c

FROM dhi.io/node:26-alpine-sfw-ent-dev AS release

# Use BuildKit's automatic platform detection
ARG TARGETARCH

# Install Oracle Instant Client for thick mode support
# This is required for databases using Advanced Networking Option (ANO) encryption
# Using version 19.23 - stable and well-tested (version 23.x has issues with ORA-24960)
# Using full 'basic' package instead of 'basiclite' as it includes encryption libraries
# Supports both ARM64 and x86_64 architectures
RUN apk update && \
    apk add --no-cache libaio libnsl curl unzip && \
    cd /tmp && \
    # Detect architecture and set appropriate download URL
    if [ "$TARGETARCH" = "arm64" ]; then \
    ARCH_SUFFIX="arm64"; \
    echo "Detected ARM64 architecture"; \
    else \
    ARCH_SUFFIX="x64"; \
    echo "Detected x86_64 architecture"; \
    fi && \
    IC_URL="https://download.oracle.com/otn_software/linux/instantclient/1928000/instantclient-basic-linux.$ARCH_SUFFIX-19.28.0.0.0dbru.zip" && \
    echo "Downloading Oracle Instant Client from: $IC_URL" && \
    curl -s -o instantclient.zip "$IC_URL" && \
    unzip -q instantclient.zip && \
    mv instantclient_19_28 /usr/lib/instantclient && \
    rm -rf instantclient.zip /tmp/*

COPY --from=shim-builder /tmp/libshim.so /usr/lib/libshim.so

ENV LD_PRELOAD=/usr/lib/libshim.so:/lib/libgcompat.so.0
ENV LD_LIBRARY_PATH=/usr/lib/instantclient

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

WORKDIR /app

RUN /usr/bin/npm ci --ignore-scripts --omit-dev

ENTRYPOINT ["node", "dist/index.js"]

