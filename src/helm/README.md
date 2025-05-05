## Overview

Helm MCP provides a bridge between AI assistants and the Helm package manager for Kubernetes. It allows AI assistants to interact with Helm through natural language requests, executing commands like installing charts, managing repositories, and more.

## Installation

### Prerequisites
- Python 3.8+
- Docker (for containerized deployment)
- Helm CLI installed

### Using Docker

Build and run the Docker container:

```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/servers.git
cd src/helm

# Build the Docker image
docker build -t mcp-helm .
```

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/modelcontextprotocol/servers.git
cd src/helm

# Install dependencies
uv venv
source .venv/Scripts/Activate.ps1
uv pip install -e .

# Run the server
mcp-server-helm
```

## Tools

Here are the available tools in the Helm MCP server:

### `helm_completion`
Generate autocompletion scripts for various shells.
- Parameters:
  - `shell` (required): The shell to generate the completion script for. Options are "bash", "fish", "powershell", "zsh".
- Example:
  ```
  helm_completion(shell="bash")
  ```

### Chart Creation and Management

#### `helm_create`
Create a new chart with the given name.
- Parameters:
  - `name` (required): The name of the chart to create.
  - `starter` (optional): The name of the starter chart to use.
- Example:
  ```
  helm_create(name="mychart")
  ```

#### `helm_lint`
Runs a series of tests to verify that the chart is well-formed.
- Parameters:
  - `chart_path` (required): Path to the chart to lint.
  - `values_file` (optional): Path to values file.
  - `set_values` (optional): Set values on the command line (can specify multiple).
- Example:
  ```
  helm_lint(chart_path="./mychart")
  ```

#### `helm_package`
Packages a chart into a chart archive.
- Parameters:
  - `chart_path` (required): Path to the chart directory.
  - `destination` (optional): Location to write the chart.
  - `app_version` (optional): Set the appVersion on the chart.
  - `version` (optional): Set the version on the chart.
  - `dependency_update` (optional): Update dependencies before packaging.
- Example:
  ```
  helm_package(chart_path="./mychart")
  ```

#### `helm_template`
Renders chart templates locally and displays the output.
- Parameters:
  - `chart` (required): Chart name.
  - `release_name` (optional): Release name.
  - `namespace` (optional): Namespace.
  - `values_file` (optional): Values file.
  - `set_values` (optional): Set values.
  - `api_versions` (optional): Kubernetes API versions.
  - `kube_version` (optional): Kubernetes version.
- Example:
  ```
  helm_template(chart="./mychart", release_name="my-release")
  ```

### Dependency Management

#### `helm_dependency_build`
Builds the chart's dependencies.
- Parameters:
  - `chart_path` (required): Path to the chart.
- Example:
  ```
  helm_dependency_build(chart_path="./mychart")
  ```

#### `helm_dependency_list`
Lists the dependencies for the given chart.
- Parameters:
  - `chart_path` (required): Path to the chart.
- Example:
  ```
  helm_dependency_list(chart_path="./mychart")
  ```

#### `helm_dependency_update`
Updates the chart's dependencies.
- Parameters:
  - `chart_path` (required): Path to the chart.
- Example:
  ```
  helm_dependency_update(chart_path="./mychart")
  ```

### Environment

#### `helm_env`
Shows Helm's environment information.
- Parameters: None
- Example:
  ```
  helm_env()
  ```

#### `helm_version`
Shows the Helm version information.
- Parameters: None
- Example:
  ```
  helm_version()
  ```

### Release Management

#### `helm_install`
Installs a chart.
- Parameters:
  - `chart` (required): Chart name.
  - `release_name` (optional): Release name.
  - `namespace` (optional): Namespace.
  - `values_file` (optional): Values file.
  - `set_values` (optional): Set values.
  - `description` (optional): Add a custom description.
  - `wait` (optional): Wait until all resources are ready.
  - `atomic` (optional): If set, installation rollback on failure.
  - `timeout` (optional): Time to wait for any operation to complete.
- Example:
  ```
  helm_install(chart="bitnami/nginx", release_name="my-nginx")
  ```

#### `helm_uninstall`
Uninstalls a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
  - `keep_history` (optional): Remove the release but keep the history.
  - `no_hooks` (optional): Prevent hooks from running during uninstallation.
- Example:
  ```
  helm_uninstall(release_name="my-nginx")
  ```

#### `helm_upgrade`
Upgrades a release.
- Parameters:
  - `release_name` (required): Release name.
  - `chart` (required): Chart name.
  - `namespace` (optional): Namespace.
  - `values_file` (optional): Values file.
  - `set_values` (optional): Set values.
  - `install` (optional): Install if release doesn't exist.
  - `force` (optional): Force resource updates.
  - `wait` (optional): Wait until all resources are ready.
  - `atomic` (optional): If set, upgrade rollback on failure.
  - `timeout` (optional): Time to wait for any operation to complete.
- Example:
  ```
  helm_upgrade(release_name="my-nginx", chart="bitnami/nginx", set_values={"replicaCount": "3"})
  ```

#### `helm_rollback`
Rolls back a release to a previous revision.
- Parameters:
  - `release_name` (required): Release name.
  - `revision` (optional): Revision number.
  - `namespace` (optional): Namespace.
  - `wait` (optional): Wait until all resources are ready.
  - `force` (optional): Force resource updates.
  - `timeout` (optional): Time to wait for any operation to complete.
- Example:
  ```
  helm_rollback(release_name="my-nginx", revision=1)
  ```

#### `helm_list`
Lists releases.
- Parameters:
  - `all_namespaces` (optional): List releases across all namespaces.
  - `filter_` (optional): Filter by regex.
  - `namespace` (optional): Namespace.
  - `deployed` (optional): Show deployed releases.
  - `failed` (optional): Show failed releases.
  - `uninstalled` (optional): Show uninstalled releases.
- Example:
  ```
  helm_list()
  ```

#### `helm_status`
Displays the status of the named release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
  - `revision` (optional): Revision number.
- Example:
  ```
  helm_status(release_name="my-nginx")
  ```

#### `helm_history`
Gets the release history.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
  - `max_` (optional): Maximum number of revisions to include.
- Example:
  ```
  helm_history(release_name="my-nginx")
  ```

#### `helm_test`
Runs tests for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
  - `filter_` (optional): Filter tests by name.
  - `timeout` (optional): Time to wait for any operation to complete.
- Example:
  ```
  helm_test(release_name="my-nginx")
  ```

### Release Information

#### `helm_get_all`
Gets all information about a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
- Example:
  ```
  helm_get_all(release_name="my-nginx")
  ```

#### `helm_get_hooks`
Gets the hooks for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
- Example:
  ```
  helm_get_hooks(release_name="my-nginx")
  ```

#### `helm_get_manifest`
Gets the manifest for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
- Example:
  ```
  helm_get_manifest(release_name="my-nginx")
  ```

#### `helm_get_metadata`
Gets the metadata for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
- Example:
  ```
  helm_get_metadata(release_name="my-nginx")
  ```

#### `helm_get_notes`
Gets the notes for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
- Example:
  ```
  helm_get_notes(release_name="my-nginx")
  ```

#### `helm_get_values`
Gets the values for a release.
- Parameters:
  - `release_name` (required): Release name.
  - `namespace` (optional): Namespace.
  - `all_values` (optional): Get all values (user-supplied values and defaults).
- Example:
  ```
  helm_get_values(release_name="my-nginx", all_values=true)
  ```

### Repository Management

#### `helm_repo_add`
Adds a chart repository.
- Parameters:
  - `name` (required): Name of the repository.
  - `url` (required): URL of the repository.
  - `username` (optional): Username for repository.
  - `password` (optional): Password for repository.
  - `pass_credentials` (optional): Pass credentials to all domains.
- Example:
  ```
  helm_repo_add(name="bitnami", url="https://charts.bitnami.com/bitnami")
  ```

#### `helm_repo_index`
Generates an index file for a chart repository.
- Parameters:
  - `directory` (required): Directory containing packaged charts.
  - `url` (optional): URL of the repository.
  - `merge` (optional): Merge the generated index with the given index.
- Example:
  ```
  helm_repo_index(directory="./charts")
  ```

#### `helm_repo_list`
Lists chart repositories.
- Parameters: None
- Example:
  ```
  helm_repo_list()
  ```

#### `helm_repo_remove`
Removes a chart repository.
- Parameters:
  - `name` (required): Name of the repository.
- Example:
  ```
  helm_repo_remove(name="bitnami")
  ```

#### `helm_repo_update`
Updates chart repositories.
- Parameters: None
- Example:
  ```
  helm_repo_update()
  ```

#### `helm_search_repo`
Searches repositories for a keyword in charts.
- Parameters:
  - `keyword` (required): Search term.
  - `regexp` (optional): Use regular expressions for searching.
  - `version` (optional): Search using semantic version constraints.
  - `versions` (optional): Show all versions, not just the latest.
- Example:
  ```
  helm_search_repo(keyword="nginx")
  ```

#### `helm_search_hub`
Searches the Helm Hub for a keyword in charts.
- Parameters:
  - `keyword` (required): Search term.
  - `max_results` (optional): Maximum number of results to return.
  - `repo_url` (optional): Specific repo URL to search.
- Example:
  ```
  helm_search_hub(keyword="nginx")
  ```

### Registry Management

#### `helm_registry_login`
Logs in to a registry.
- Parameters:
  - `registry_url` (required): Registry URL to authenticate with.
  - `username` (required): Username for registry.
  - `password` (required): Password for registry.
  - `insecure` (optional): Allow connections to TLS registry without certs.
- Example:
  ```
  helm_registry_login(registry_url="registry.example.com", username="user", password="pass123")
  ```

#### `helm_registry_logout`
Logs out from a registry.
- Parameters:
  - `registry_url` (required): Registry URL to logout from.
- Example:
  ```
  helm_registry_logout(registry_url="registry.example.com")
  ```

#### `helm_push`
Pushes a chart to a registry.
- Parameters:
  - `chart_path` (required): Path to the chart to push.
  - `registry_url` (required): Registry URL to push to.
  - `insecure` (optional): Allow connections to TLS registry without certs.
  - `plain_http` (optional): Use plain HTTP.
  - `force` (optional): Force push even if the chart already exists.
- Example:
  ```
  helm_push(chart_path="./mychart-1.0.0.tgz", registry_url="oci://registry.example.com/charts")
  ```

#### `helm_pull`
Downloads a chart from a repository.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
  - `destination` (optional): Directory to download to.
  - `untar` (optional): If set, untar the chart after downloading.
  - `verify` (optional): Verify the package against its signature.
  - `keyring` (optional): Path to the keyring containing public keys.
- Example:
  ```
  helm_pull(chart="nginx", repo="bitnami", version="13.2.0")
  ```

### Chart Information

#### `helm_show_all`
Shows all information of a chart.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
- Example:
  ```
  helm_show_all(chart="nginx", repo="bitnami")
  ```

#### `helm_show_chart`
Shows the chart's definition.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
- Example:
  ```
  helm_show_chart(chart="nginx", repo="bitnami")
  ```

#### `helm_show_crds`
Shows the chart's CRDs.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
- Example:
  ```
  helm_show_crds(chart="prometheus-operator", repo="prometheus-community")
  ```

#### `helm_show_readme`
Shows the chart's README.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
- Example:
  ```
  helm_show_readme(chart="nginx", repo="bitnami")
  ```

#### `helm_show_values`
Shows the chart's values.
- Parameters:
  - `chart` (required): Chart name.
  - `repo` (optional): Repository name.
  - `version` (optional): Chart version.
- Example:
  ```
  helm_show_values(chart="nginx", repo="bitnami")
  ```

### Plugin Management

#### `helm_plugin_install`
Installs a Helm plugin.
- Parameters:
  - `plugin_url` (required): URL to the plugin.
  - `version` (optional): Version of the plugin.
- Example:
  ```
  helm_plugin_install(plugin_url="https://github.com/chartmuseum/helm-push")
  ```

#### `helm_plugin_list`
Lists Helm plugins.
- Parameters: None
- Example:
  ```
  helm_plugin_list()
  ```

#### `helm_plugin_uninstall`
Uninstalls a Helm plugin.
- Parameters:
  - `plugin_name` (required): Name of the plugin.
- Example:
  ```
  helm_plugin_uninstall(plugin_name="push")
  ```

#### `helm_plugin_update`
Updates a Helm plugin.
- Parameters:
  - `plugin_name` (required): Name of the plugin.
- Example:
  ```
  helm_plugin_update(plugin_name="push")
  ```

### Verification

#### `helm_verify`
Verifies that a chart at the given path has been signed and is valid.
- Parameters:
  - `path` (required): Path to the chart file.
  - `keyring` (optional): Path to the keyring containing public keys.
- Example:
  ```
  helm_verify(path="./mychart-1.0.0.tgz")
  ```

## Configuration

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

<details>
<summary>Using uvx</summary>

```json
"mcpServers": {
  "helm": {
    "command": "uvx",
    "args": ["mcp-server-helm"]
  }
}
```
</details>

<details>
<summary>Using docker</summary>

```json
"mcpServers": {
  "helm": {
    "command": "docker",
    "args": ["run", "--rm", "-i", "mcp/helm"]
  }
}
```
</details>

## Inspector
```shell
# run the inspector against the mcp-server-helm
npx @modelcontextprotocol/inspector uvx mcp-server-helm
```

## Build

Docker build:

```bash
cd src/helm
docker build -t mcp/helm .
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.