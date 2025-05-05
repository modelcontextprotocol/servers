# Hello World Helm Chart

This is a simple Hello World Helm chart that demonstrates basic Helm functionality. 
It deploys an Nginx container that serves a simple webpage.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+

## Installing the Chart

To install the chart with the release name `my-hello`:

```bash
helm install my-hello ./hello-world
```

## Uninstalling the Chart

To uninstall/delete the `my-hello` release:

```bash
helm uninstall my-hello
```

## Configuration

The following table lists the configurable parameters of the hello-world chart and their default values.

| Parameter             | Description                      | Default                |
|-----------------------|----------------------------------|------------------------|
| `replicaCount`        | Number of replicas               | `1`                    |
| `image.repository`    | Container image repository       | `nginx`                |
| `image.tag`           | Container image tag              | `stable`               |
| `image.pullPolicy`    | Container image pull policy      | `IfNotPresent`         |
| `service.type`        | Kubernetes Service type          | `ClusterIP`            |
| `service.port`        | Service port                     | `80`                   |
| `message`             | Message to display               | `Hello, World from Helm!` |
| `resources`           | CPU/Memory resource requests/limits | See `values.yaml` |
| `nodeSelector`        | Node labels for pod assignment   | `{}`                   |
| `tolerations`         | Tolerations for pod assignment   | `[]`                   |
| `affinity`            | Affinity for pod assignment      | `{}`                   |
