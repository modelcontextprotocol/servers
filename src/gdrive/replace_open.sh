#! /bin/bash

# Basic script to replace opn(authorizeUrl, { wait: false }).then(cp => cp.unref()); with process.stdout.write(`Open this URL in your browser: ${authorizeUrl}`);

sed -i 's/opn(authorizeUrl, { wait: false }).then(cp => cp.unref());/process.stderr.write(`Open this URL in your browser: ${authorizeUrl}\n`);/' node_modules/@google-cloud/local-auth/build/src/index.js
