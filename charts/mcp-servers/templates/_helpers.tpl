{{/*
Common template helpers.
*/}}

{{- define "mcp-servers.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" -}}
{{- end -}}

{{- define "mcp-servers.labels" -}}
helm.sh/chart: {{ include "mcp-servers.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "mcp-servers.serverName" -}}
{{- $server := .server -}}
{{- default $server.name $server.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "mcp-servers.serverFullname" -}}
{{- $root := .root -}}
{{- $server := .server -}}
{{- $name := include "mcp-servers.serverName" (dict "server" $server) -}}
{{- if $server.fullnameOverride -}}
{{- $server.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if $server.nameOverride -}}
{{- printf "%s-%s" $root.Release.Name $server.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" $root.Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "mcp-servers.selectorLabels" -}}
{{- $root := .root -}}
{{- $server := .server -}}
app.kubernetes.io/name: {{ include "mcp-servers.serverName" (dict "server" $server) }}
app.kubernetes.io/instance: {{ $root.Release.Name }}
{{- end -}}

{{- define "mcp-servers.commonLabels" -}}
{{- $root := .root -}}
{{- $server := .server -}}
{{ include "mcp-servers.labels" $root }}
{{ include "mcp-servers.selectorLabels" (dict "root" $root "server" $server) }}
{{- with $root.Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- with $server.labels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "mcp-servers.commonAnnotations" -}}
{{- $root := .root -}}
{{- $server := .server -}}
{{- with $root.Values.global.annotations }}
{{ toYaml . }}
{{- end }}
{{- with $server.annotations }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "mcp-servers.serviceAccountName" -}}
{{- $root := .root -}}
{{- $server := .server -}}
{{- $sa := default (dict) $server.serviceAccount -}}
{{- $saCreate := default $root.Values.global.serviceAccount.create $sa.create -}}
{{- $saName := default $root.Values.global.serviceAccount.name $sa.name -}}
{{- if $saCreate -}}
{{- if $saName -}}
{{- $saName -}}
{{- else -}}
{{ include "mcp-servers.serverFullname" (dict "root" $root "server" $server) }}
{{- end -}}
{{- else -}}
{{- default "default" $saName -}}
{{- end -}}
{{- end -}}

{{- define "mcp-servers.imagePullSecrets" -}}
{{- $root := .root -}}
{{- $server := .server -}}
{{- $globalIps := default $root.Values.imagePullSecrets $root.Values.global.imagePullSecrets -}}
{{- $ips := default $globalIps $server.imagePullSecrets -}}
{{- if $ips }}
imagePullSecrets:
{{- toYaml $ips | nindent 2 }}
{{- end }}
{{- end -}}

{{- define "mcp-servers.containerPorts" -}}
{{- $server := .server -}}
{{- $ports := default (list (dict "name" "http" "containerPort" 8080)) $server.ports -}}
ports:
{{- range $p := $ports }}
  - name: {{ required "mcpServers[].ports[].name is required" $p.name }}
    containerPort: {{ required "mcpServers[].ports[].containerPort is required" $p.containerPort }}
    protocol: {{ default "TCP" $p.protocol }}
{{- end }}
{{- end -}}

{{- define "mcp-servers.servicePorts" -}}
{{- $server := .server -}}
{{- $svc := default (dict) $server.service -}}
{{- $ports := default (list (dict "name" "http" "port" 80 "targetPort" "http")) $svc.ports -}}
ports:
{{- range $p := $ports }}
  - name: {{ required "mcpServers[].service.ports[].name is required" $p.name }}
    port: {{ required "mcpServers[].service.ports[].port is required" $p.port }}
    targetPort: {{ default $p.name $p.targetPort }}
    protocol: {{ default "TCP" $p.protocol }}
{{- end }}
{{- end -}}
