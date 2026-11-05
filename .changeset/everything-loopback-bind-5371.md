---
"@modelcontextprotocol/server-everything": minor
---

The Streamable HTTP and HTTP+SSE transports now bind the loopback interface (`127.0.0.1`) by default instead of every interface, so a server started over HTTP is no longer reachable from other hosts on the network. Set the new `HOST` environment variable to widen the bind deliberately (`HOST=0.0.0.0`); the container image sets it. The listening line now names the bound address and port. Thanks to TheodorNEngoy for the prototype in #3303.
