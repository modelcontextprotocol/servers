import sys
import logging
import subprocess
import json
import os
import tempfile
from typing import Dict, List, Optional, Any, Union
from pathlib import Path

# Try to import mcp with error handling
try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import TextContent, Tool
except ImportError as e:
    print(f"Error importing MCP: {e}")
    print(f"Current Python path: {sys.path}")
    sys.exit(1)

# Set up logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Helper function to execute a helm command and handle the output
def execute_helm_command(cmd: List[str], stdin_input: Optional[str] = None) -> str:
    """
    Execute a Helm command and return the formatted output.
    """
    logger.info(f"Executing command: {' '.join(cmd)}")

    try:
        if stdin_input:
            # Use Popen to provide input via stdin
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(input=stdin_input)

            if process.returncode != 0:
                error_msg = f"Error executing command: {stderr}"
                logger.error(error_msg)
                return error_msg

            return stdout
        else:
            # Use subprocess.run for commands without stdin input
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return result.stdout
    except subprocess.CalledProcessError as e:
        error_msg = f"Error executing command: {e.stderr}"
        logger.error(error_msg)
        return error_msg
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(error_msg)
        return error_msg

# Helm commands

def helm_completion(shell: str) -> str:
    """
    Generates the autocompletion script for the specified shell.
    """
    logger.info(f"Running helm completion with shell={shell}")

    valid_shells = ["bash", "fish", "powershell", "zsh"]
    if shell not in valid_shells:
        return f"Invalid shell: {shell}. Valid options are: {', '.join(valid_shells)}"

    return execute_helm_command(["helm", "completion", shell])

def helm_create(name: str, starter: Optional[str] = None) -> str:
    """
    Creates a new chart with the given name.
    """
    logger.info(f"Running helm create with name={name}, starter={starter}")

    cmd = ["helm", "create", name]

    if starter:
        cmd.extend(["--starter", starter])

    return execute_helm_command(cmd)

def helm_dependency_build(chart_path: str) -> str:
    """
    Builds the chart's dependencies.
    """
    logger.info(f"Running helm dependency build for chart={chart_path}")

    return execute_helm_command(["helm", "dependency", "build", chart_path])

def helm_dependency_list(chart_path: str) -> str:
    """
    Lists the dependencies for the given chart.
    """
    logger.info(f"Running helm dependency list for chart={chart_path}")

    return execute_helm_command(["helm", "dependency", "list", chart_path])

def helm_dependency_update(chart_path: str) -> str:
    """
    Updates the chart's dependencies.
    """
    logger.info(f"Running helm dependency update for chart={chart_path}")

    return execute_helm_command(["helm", "dependency", "update", chart_path])

def helm_env() -> str:
    """
    Shows Helm's environment information.
    """
    logger.info("Running helm env")

    return execute_helm_command(["helm", "env"])

def helm_get_all(release_name: str, namespace: Optional[str] = None) -> str:
    """
    Gets all information about a release.
    """
    logger.info(f"Running helm get all for release={release_name}, namespace={namespace}")

    cmd = ["helm", "get", "all", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    return execute_helm_command(cmd)

def helm_get_hooks(release_name: str, namespace: Optional[str] = None) -> str:
    """
    Gets the hooks for a release.
    """
    logger.info(f"Running helm get hooks for release={release_name}, namespace={namespace}")

    cmd = ["helm", "get", "hooks", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    return execute_helm_command(cmd)

def helm_get_manifest(release_name: str, namespace: Optional[str] = None) -> str:
    """
    Gets the manifest for a release.
    """
    logger.info(f"Running helm get manifest for release={release_name}, namespace={namespace}")

    cmd = ["helm", "get", "manifest", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    return execute_helm_command(cmd)

def helm_get_metadata(release_name: str, namespace: Optional[str] = None) -> str:
    """
    Gets the metadata for a release.
    """
    logger.info(f"Running helm get metadata for release={release_name}, namespace={namespace}")

    cmd = ["helm", "get", "metadata", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    return execute_helm_command(cmd)

def helm_get_notes(release_name: str, namespace: Optional[str] = None) -> str:
    """
    Gets the notes for a release.
    """
    logger.info(f"Running helm get notes for release={release_name}, namespace={namespace}")

    cmd = ["helm", "get", "notes", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    return execute_helm_command(cmd)

def helm_get_values(release_name: str, namespace: Optional[str] = None, all_values: bool = False) -> str:
    """
    Gets the values for a release.
    """
    logger.info(f"Running helm get values for release={release_name}, namespace={namespace}, all={all_values}")

    cmd = ["helm", "get", "values", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    if all_values:
        cmd.append("--all")

    return execute_helm_command(cmd)

def helm_history(release_name: str, namespace: Optional[str] = None, max_: Optional[int] = None) -> str:
    """
    Gets the release history.
    """
    logger.info(f"Running helm history for release={release_name}, namespace={namespace}, max={max_}")

    cmd = ["helm", "history", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    if max_:
        cmd.extend(["--max", str(max_)])

    return execute_helm_command(cmd)

def helm_install(chart: str, release_name: Optional[str] = None, namespace: Optional[str] = None,
                 values_file: Optional[str] = None, set_values: Optional[Dict[str, str]] = None,
                 description: Optional[str] = None, timeout: Optional[str] = None,
                 wait: bool = False, atomic: bool = False) -> str:
    """
    Installs a Helm chart.
    """
    logger.info(f"Running helm install with chart={chart}, release_name={release_name}, namespace={namespace}")

    # Build the command
    cmd = ["helm", "install"]

    # Add release name if provided, otherwise use --generate-name
    if release_name:
        cmd.append(release_name)
    else:
        cmd.append("--generate-name")

    # Add chart name
    cmd.append(chart)

    # Add namespace if provided
    if namespace:
        cmd.extend(["-n", namespace])

    # Add values file if provided
    if values_file:
        cmd.extend(["-f", values_file])

    # Add set values if provided
    if set_values:
        for key, value in set_values.items():
            cmd.extend(["--set", f"{key}={value}"])

    # Add description if provided
    if description:
        cmd.extend(["--description", description])

    # Add timeout if provided
    if timeout:
        cmd.extend(["--timeout", timeout])

    # Add wait flag if provided
    if wait:
        cmd.append("--wait")

    # Add atomic flag if provided
    if atomic:
        cmd.append("--atomic")

    # Add output format
    cmd.extend(["--output", "json"])

    output = execute_helm_command(cmd)

    try:
        # Try to parse JSON output
        release_info = json.loads(output)
        formatted_output = "INSTALLATION SUCCESSFUL:\n\n"
        formatted_output += f"NAME: {release_info.get('name', 'N/A')}\n"
        formatted_output += f"NAMESPACE: {release_info.get('namespace', 'N/A')}\n"
        formatted_output += f"STATUS: {release_info.get('info', {}).get('status', 'N/A')}\n"
        formatted_output += f"REVISION: {release_info.get('version', 'N/A')}\n"

        # Add notes if available
        notes = release_info.get('info', {}).get('notes')
        if notes:
            formatted_output += "\nNOTES:\n"
            formatted_output += notes

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Installation output:\n{output}"

def helm_lint(chart_path: str, values_file: Optional[str] = None, set_values: Optional[Dict[str, str]] = None) -> str:
    """
    Runs a series of tests to verify that the chart is well-formed.
    """
    logger.info(f"Running helm lint for chart={chart_path}")

    cmd = ["helm", "lint", chart_path]

    # Add values file if provided
    if values_file:
        cmd.extend(["-f", values_file])

    # Add set values if provided
    if set_values:
        for key, value in set_values.items():
            cmd.extend(["--set", f"{key}={value}"])

    return execute_helm_command(cmd)

def helm_list(namespace: Optional[str] = None, all_namespaces: bool = False,
              filter_: Optional[str] = None, uninstalled: bool = False,
              deployed: bool = False, failed: bool = False) -> str:
    """
    Lists all Helm releases.
    """
    logger.info(f"Running helm list with namespace={namespace}, all_namespaces={all_namespaces}")

    cmd = ["helm", "list", "--output", "json"]

    if namespace and not all_namespaces:
        cmd.extend(["-n", namespace])

    if all_namespaces:
        cmd.append("--all-namespaces")

    if filter_:
        cmd.extend(["-f", filter_])

    if uninstalled:
        cmd.append("--uninstalled")

    if deployed:
        cmd.append("--deployed")

    if failed:
        cmd.append("--failed")

    output = execute_helm_command(cmd)

    try:
        releases = json.loads(output)

        # Format the output for readability
        if not releases:
            return "No releases found."

        formatted_output = "RELEASE LIST:\n\n"
        formatted_output += "NAME\t\tNAMESPACE\t\tREVISION\t\tSTATUS\t\tCHART\t\tAPP VERSION\n"

        for release in releases:
            formatted_output += f"{release.get('name', 'N/A')}\t\t"
            formatted_output += f"{release.get('namespace', 'N/A')}\t\t"
            formatted_output += f"{release.get('revision', 'N/A')}\t\t"
            formatted_output += f"{release.get('status', 'N/A')}\t\t"
            formatted_output += f"{release.get('chart', 'N/A')}\t\t"
            formatted_output += f"{release.get('app_version', 'N/A')}\n"

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Release list:\n{output}"

def helm_package(chart_path: str, destination: Optional[str] = None,
                 app_version: Optional[str] = None, version: Optional[str] = None,
                 dependency_update: bool = False) -> str:
    """
    Packages a chart into a chart archive.
    """
    logger.info(f"Running helm package for chart={chart_path}")

    cmd = ["helm", "package", chart_path]

    if destination:
        cmd.extend(["--destination", destination])

    if app_version:
        cmd.extend(["--app-version", app_version])

    if version:
        cmd.extend(["--version", version])

    if dependency_update:
        cmd.append("--dependency-update")

    return execute_helm_command(cmd)

def helm_plugin_install(plugin_url: str, version: Optional[str] = None) -> str:
    """
    Installs a Helm plugin.
    """
    logger.info(f"Running helm plugin install with plugin={plugin_url}, version={version}")

    cmd = ["helm", "plugin", "install", plugin_url]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_plugin_list() -> str:
    """
    Lists Helm plugins.
    """
    logger.info("Running helm plugin list")

    return execute_helm_command(["helm", "plugin", "list"])

def helm_plugin_uninstall(plugin_name: str) -> str:
    """
    Uninstalls a Helm plugin.
    """
    logger.info(f"Running helm plugin uninstall with plugin={plugin_name}")

    return execute_helm_command(["helm", "plugin", "uninstall", plugin_name])

def helm_plugin_update(plugin_name: str) -> str:
    """
    Updates a Helm plugin.
    """
    logger.info(f"Running helm plugin update with plugin={plugin_name}")

    return execute_helm_command(["helm", "plugin", "update", plugin_name])

def helm_pull(chart: str, repo: Optional[str] = None, version: Optional[str] = None,
              destination: Optional[str] = None, untar: bool = False,
              verify: bool = False, keyring: Optional[str] = None) -> str:
    """
    Downloads a chart from a repository.
    """
    logger.info(f"Running helm pull with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "pull", chart_ref]

    if version:
        cmd.extend(["--version", version])

    if destination:
        cmd.extend(["--destination", destination])

    if untar:
        cmd.append("--untar")

    if verify:
        cmd.append("--verify")

    if keyring:
        cmd.extend(["--keyring", keyring])

    return execute_helm_command(cmd)

def helm_push(chart_path: str, registry_url: str, force: bool = False,
              insecure: bool = False, plain_http: bool = False) -> str:
    """
    Pushes a chart to a registry.
    """
    logger.info(f"Running helm push with chart_path={chart_path}, registry_url={registry_url}")

    cmd = ["helm", "push", chart_path, registry_url]

    if force:
        cmd.append("--force")

    if insecure:
        cmd.append("--insecure")

    if plain_http:
        cmd.append("--plain-http")

    return execute_helm_command(cmd)

def helm_registry_login(registry_url: str, username: str, password: str,
                        insecure: bool = False) -> str:
    """
    Logs in to a registry.
    """
    logger.info(f"Running helm registry login with registry_url={registry_url}, username={username}")

    cmd = ["helm", "registry", "login", registry_url,
           "--username", username, "--password-stdin"]

    if insecure:
        cmd.append("--insecure")

    return execute_helm_command(cmd, stdin_input=password)

def helm_registry_logout(registry_url: str) -> str:
    """
    Logs out from a registry.
    """
    logger.info(f"Running helm registry logout with registry_url={registry_url}")

    return execute_helm_command(["helm", "registry", "logout", registry_url])

def helm_repo_add(name: str, url: str, username: Optional[str] = None,
                  password: Optional[str] = None, pass_credentials: bool = False) -> str:
    """
    Adds a chart repository.
    """
    logger.info(f"Running helm repo add with name={name}, url={url}")

    cmd = ["helm", "repo", "add", name, url]

    if username:
        cmd.extend(["--username", username])

    if password:
        cmd.extend(["--password", password])

    if pass_credentials:
        cmd.append("--pass-credentials")

    return execute_helm_command(cmd)

def helm_repo_index(directory: str, url: Optional[str] = None, merge: Optional[str] = None) -> str:
    """
    Generates an index file for a chart repository.
    """
    logger.info(f"Running helm repo index with directory={directory}, url={url}")

    cmd = ["helm", "repo", "index", directory]

    if url:
        cmd.extend(["--url", url])

    if merge:
        cmd.extend(["--merge", merge])

    return execute_helm_command(cmd)

def helm_repo_list() -> str:
    """
    Lists chart repositories.
    """
    logger.info("Running helm repo list")

    output = execute_helm_command(["helm", "repo", "list", "--output", "json"])

    try:
        repos = json.loads(output)

        if not repos:
            return "No repositories found."

        formatted_output = "REPOSITORY LIST:\n\n"
        formatted_output += "NAME\t\tURL\n"

        for repo in repos:
            formatted_output += f"{repo.get('name', 'N/A')}\t\t"
            formatted_output += f"{repo.get('url', 'N/A')}\n"

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Repository list:\n{output}"

def helm_repo_remove(name: str) -> str:
    """
    Removes a chart repository.
    """
    logger.info(f"Running helm repo remove with name={name}")

    return execute_helm_command(["helm", "repo", "remove", name])

def helm_repo_update() -> str:
    """
    Updates chart repositories.
    """
    logger.info("Running helm repo update")

    return execute_helm_command(["helm", "repo", "update"])

def helm_rollback(release_name: str, revision: Optional[int] = None, namespace: Optional[str] = None,
                  timeout: Optional[str] = None, wait: bool = False, force: bool = False) -> str:
    """
    Rolls back a release to a previous revision.
    """
    logger.info(f"Running helm rollback with release={release_name}, revision={revision}")

    cmd = ["helm", "rollback", release_name]

    if revision is not None:
        cmd.append(str(revision))

    if namespace:
        cmd.extend(["-n", namespace])

    if timeout:
        cmd.extend(["--timeout", timeout])

    if wait:
        cmd.append("--wait")

    if force:
        cmd.append("--force")

    return execute_helm_command(cmd)

def helm_search_repo(keyword: str, version: Optional[str] = None, regexp: bool = False,
                     versions: bool = False) -> str:
    """
    Searches repositories for a keyword in charts.
    """
    logger.info(f"Running helm search repo with keyword={keyword}")

    cmd = ["helm", "search", "repo", keyword, "--output", "json"]

    if version:
        cmd.extend(["--version", version])

    if regexp:
        cmd.append("--regexp")

    if versions:
        cmd.append("--versions")

    output = execute_helm_command(cmd)

    try:
        charts = json.loads(output)

        if not charts:
            return f"No charts found for keyword: {keyword}"

        formatted_output = "SEARCH RESULTS:\n\n"
        formatted_output += "NAME\t\tCHART VERSION\t\tAPP VERSION\t\tDESCRIPTION\n"

        for chart in charts:
            formatted_output += f"{chart.get('name', 'N/A')}\t\t"
            formatted_output += f"{chart.get('version', 'N/A')}\t\t"
            formatted_output += f"{chart.get('app_version', 'N/A')}\t\t"
            formatted_output += f"{chart.get('description', 'N/A')}\n"

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Search results:\n{output}"

def helm_search_hub(keyword: str, max_results: Optional[int] = None,
                    repo_url: Optional[str] = None) -> str:
    """
    Searches the Helm Hub for a keyword in charts.
    """
    logger.info(f"Running helm search hub with keyword={keyword}")

    cmd = ["helm", "search", "hub", keyword, "--output", "json"]

    if max_results:
        cmd.extend(["--max-col-width", str(max_results)])

    if repo_url:
        cmd.extend(["--repository-url", repo_url])

    output = execute_helm_command(cmd)

    try:
        charts = json.loads(output)

        if not charts:
            return f"No charts found for keyword: {keyword}"

        formatted_output = "HUB SEARCH RESULTS:\n\n"
        formatted_output += "URL\t\tCHART VERSION\t\tAPP VERSION\t\tDESCRIPTION\n"

        for chart in charts:
            formatted_output += f"{chart.get('url', 'N/A')}\t\t"
            formatted_output += f"{chart.get('version', 'N/A')}\t\t"
            formatted_output += f"{chart.get('app_version', 'N/A')}\t\t"
            formatted_output += f"{chart.get('description', 'N/A')}\n"

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Hub search results:\n{output}"

def helm_show_all(chart: str, repo: Optional[str] = None, version: Optional[str] = None) -> str:
    """
    Shows all information of a chart.
    """
    logger.info(f"Running helm show all with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "show", "all", chart_ref]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_show_chart(chart: str, repo: Optional[str] = None, version: Optional[str] = None) -> str:
    """
    Shows the chart's definition.
    """
    logger.info(f"Running helm show chart with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "show", "chart", chart_ref]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_show_crds(chart: str, repo: Optional[str] = None, version: Optional[str] = None) -> str:
    """
    Shows the chart's CRDs.
    """
    logger.info(f"Running helm show crds with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "show", "crds", chart_ref]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_show_readme(chart: str, repo: Optional[str] = None, version: Optional[str] = None) -> str:
    """
    Shows the chart's README.
    """
    logger.info(f"Running helm show readme with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "show", "readme", chart_ref]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_show_values(chart: str, repo: Optional[str] = None, version: Optional[str] = None) -> str:
    """
    Shows the chart's values.
    """
    logger.info(f"Running helm show values with chart={chart}, repo={repo}, version={version}")

    # Build chart reference
    chart_ref = chart
    if repo:
        chart_ref = f"{repo}/{chart}"

    cmd = ["helm", "show", "values", chart_ref]

    if version:
        cmd.extend(["--version", version])

    return execute_helm_command(cmd)

def helm_status(release_name: str, namespace: Optional[str] = None, revision: Optional[int] = None) -> str:
    """
    Displays the status of the named release.
    """
    logger.info(f"Running helm status with release={release_name}, namespace={namespace}")

    cmd = ["helm", "status", release_name, "--output", "json"]

    if namespace:
        cmd.extend(["-n", namespace])

    if revision:
        cmd.extend(["--revision", str(revision)])

    output = execute_helm_command(cmd)

    try:
        status = json.loads(output)

        formatted_output = f"STATUS: {status.get('info', {}).get('status', 'N/A')}\n"
        formatted_output += f"NAME: {status.get('name', 'N/A')}\n"
        formatted_output += f"NAMESPACE: {status.get('namespace', 'N/A')}\n"
        formatted_output += f"REVISION: {status.get('version', 'N/A')}\n"
        formatted_output += f"LAST DEPLOYED: {status.get('info', {}).get('last_deployed', 'N/A')}\n"

        # Add notes if available
        notes = status.get('info', {}).get('notes')
        if notes:
            formatted_output += "\nNOTES:\n"
            formatted_output += notes

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Status output:\n{output}"

def helm_template(chart: str, release_name: Optional[str] = None, namespace: Optional[str] = None,
                  values_file: Optional[str] = None, set_values: Optional[Dict[str, str]] = None,
                  api_versions: Optional[List[str]] = None, kube_version: Optional[str] = None) -> str:
    """
    Renders chart templates locally and displays the output.
    """
    logger.info(f"Running helm template with chart={chart}, release_name={release_name}")

    cmd = ["helm", "template"]

    # Add release name if provided
    if release_name:
        cmd.append(release_name)

    # Add chart name
    cmd.append(chart)

    # Add namespace if provided
    if namespace:
        cmd.extend(["--namespace", namespace])

    # Add values file if provided
    if values_file:
        cmd.extend(["-f", values_file])

    # Add set values if provided
    if set_values:
        for key, value in set_values.items():
            cmd.extend(["--set", f"{key}={value}"])

    # Add API versions if provided
    if api_versions:
        for version in api_versions:
            cmd.extend(["--api-versions", version])

    # Add Kubernetes version if provided
    if kube_version:
        cmd.extend(["--kube-version", kube_version])

    return execute_helm_command(cmd)

def helm_test(release_name: str, namespace: Optional[str] = None,
              timeout: Optional[str] = None, filter_: Optional[str] = None) -> str:
    """
    Runs tests for a release.
    """
    logger.info(f"Running helm test with release={release_name}, namespace={namespace}")

    cmd = ["helm", "test", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    if timeout:
        cmd.extend(["--timeout", timeout])

    if filter_:
        cmd.extend(["--filter", filter_])

    return execute_helm_command(cmd)

def helm_uninstall(release_name: str, namespace: Optional[str] = None,
                   keep_history: bool = False, no_hooks: bool = False) -> str:
    """
    Uninstalls a release.
    """
    logger.info(f"Running helm uninstall with release={release_name}, namespace={namespace}")

    cmd = ["helm", "uninstall", release_name]

    if namespace:
        cmd.extend(["-n", namespace])

    if keep_history:
        cmd.append("--keep-history")

    if no_hooks:
        cmd.append("--no-hooks")

    return execute_helm_command(cmd)

def helm_upgrade(release_name: str, chart: str, namespace: Optional[str] = None,
                 values_file: Optional[str] = None, set_values: Optional[Dict[str, str]] = None,
                 install: bool = False, force: bool = False, atomic: bool = False,
                 timeout: Optional[str] = None, wait: bool = False) -> str:
    """
    Upgrades a release.
    """
    logger.info(f"Running helm upgrade with release={release_name}, chart={chart}")

    cmd = ["helm", "upgrade", release_name, chart]

    if namespace:
        cmd.extend(["-n", namespace])

    if values_file:
        cmd.extend(["-f", values_file])

    if set_values:
        for key, value in set_values.items():
            cmd.extend(["--set", f"{key}={value}"])

    if install:
        cmd.append("--install")

    if force:
        cmd.append("--force")

    if atomic:
        cmd.append("--atomic")

    if timeout:
        cmd.extend(["--timeout", timeout])

    if wait:
        cmd.append("--wait")

    cmd.extend(["--output", "json"])

    output = execute_helm_command(cmd)

    try:
        # Try to parse JSON output
        upgrade_info = json.loads(output)
        formatted_output = "UPGRADE SUCCESSFUL:\n\n"
        formatted_output += f"NAME: {upgrade_info.get('name', 'N/A')}\n"
        formatted_output += f"NAMESPACE: {upgrade_info.get('namespace', 'N/A')}\n"
        formatted_output += f"STATUS: {upgrade_info.get('info', {}).get('status', 'N/A')}\n"
        formatted_output += f"REVISION: {upgrade_info.get('version', 'N/A')}\n"

        # Add notes if available
        notes = upgrade_info.get('info', {}).get('notes')
        if notes:
            formatted_output += "\nNOTES:\n"
            formatted_output += notes

        return formatted_output
    except json.JSONDecodeError:
        # If output is not JSON, return raw output
        return f"Upgrade output:\n{output}"

def helm_verify(path: str, keyring: Optional[str] = None) -> str:
    """
    Verifies that a chart at the given path has been signed and is valid.
    """
    logger.info(f"Running helm verify with path={path}")

    cmd = ["helm", "verify", path]

    if keyring:
        cmd.extend(["--keyring", keyring])

    return execute_helm_command(cmd)

def helm_version() -> str:
    """
    Shows the Helm version information.
    """
    logger.info("Running helm version")

    return execute_helm_command(["helm", "version", "--short"])

async def serve() -> None:
    """
    Main function to run the MCP server for Helm commands.
    """
    logger.info("Starting Helm MCP server")
    server = Server("mcp-helm")

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        logger.info("Listing available tools")
        return [
            # Completion tools
            Tool(
                name="helm_completion",
                description="Generates the autocompletion script for the specified shell",
                inputSchema={"type": "object", "properties": {"shell": {"type": "string", "enum": ["bash", "fish", "powershell", "zsh"]}}, "required": ["shell"]},
            ),

            # Create tool
            Tool(
                name="helm_create",
                description="Creates a new chart with the given name",
                inputSchema={"type": "object", "properties": {"name": {"type": "string"}, "starter": {"type": "string"}}, "required": ["name"]},
            ),

            # Dependency tools
            Tool(
                name="helm_dependency_build",
                description="Builds the chart's dependencies",
                inputSchema={"type": "object", "properties": {"chart_path": {"type": "string"}}, "required": ["chart_path"]},
            ),
            Tool(
                name="helm_dependency_list",
                description="Lists the dependencies for the given chart",
                inputSchema={"type": "object", "properties": {"chart_path": {"type": "string"}}, "required": ["chart_path"]},
            ),
            Tool(
                name="helm_dependency_update",
                description="Updates the chart's dependencies",
                inputSchema={"type": "object", "properties": {"chart_path": {"type": "string"}}, "required": ["chart_path"]},
            ),

            # Environment tool
            Tool(
                name="helm_env",
                description="Shows Helm's environment information",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),

            # Get tools
            Tool(
                name="helm_get_all",
                description="Gets all information about a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}}, "required": ["release_name"]},
            ),
            Tool(
                name="helm_get_hooks",
                description="Gets the hooks for a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}}, "required": ["release_name"]},
            ),
            Tool(
                name="helm_get_manifest",
                description="Gets the manifest for a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}}, "required": ["release_name"]},
            ),
            Tool(
                name="helm_get_metadata",
                description="Gets the metadata for a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}}, "required": ["release_name"]},
            ),
            Tool(
                name="helm_get_notes",
                description="Gets the notes for a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}}, "required": ["release_name"]},
            ),
            Tool(
                name="helm_get_values",
                description="Gets the values for a release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}, "all_values": {"type": "boolean"}}, "required": ["release_name"]},
            ),

            # History tool
            Tool(
                name="helm_history",
                description="Gets the release history",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}, "max_": {"type": "integer"}}, "required": ["release_name"]},
            ),

            # Install tool
            Tool(
                name="helm_install",
                description="Installs a chart",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "chart": {"type": "string"},
                        "release_name": {"type": "string"},
                        "namespace": {"type": "string"},
                        "values_file": {"type": "string"},
                        "set_values": {"type": "object"},
                        "description": {"type": "string"},
                        "timeout": {"type": "string"},
                        "wait": {"type": "boolean"},
                        "atomic": {"type": "boolean"}
                    },
                    "required": ["chart"]
                },
            ),

            # Lint tool
            Tool(
                name="helm_lint",
                description="Runs a series of tests to verify that the chart is well-formed",
                inputSchema={"type": "object", "properties": {"chart_path": {"type": "string"}, "values_file": {"type": "string"}, "set_values": {"type": "object"}}, "required": ["chart_path"]},
            ),

            # List tool
            Tool(
                name="helm_list",
                description="Lists releases",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "namespace": {"type": "string"},
                        "all_namespaces": {"type": "boolean"},
                        "filter_": {"type": "string"},
                        "uninstalled": {"type": "boolean"},
                        "deployed": {"type": "boolean"},
                        "failed": {"type": "boolean"}
                    },
                    "required": []
                },
            ),

            # Package tool
            Tool(
                name="helm_package",
                description="Packages a chart into a chart archive",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "chart_path": {"type": "string"},
                        "destination": {"type": "string"},
                        "app_version": {"type": "string"},
                        "version": {"type": "string"},
                        "dependency_update": {"type": "boolean"}
                    },
                    "required": ["chart_path"]
                },
            ),

            # Plugin tools
            Tool(
                name="helm_plugin_install",
                description="Installs a Helm plugin",
                inputSchema={"type": "object", "properties": {"plugin_url": {"type": "string"}, "version": {"type": "string"}}, "required": ["plugin_url"]},
            ),
            Tool(
                name="helm_plugin_list",
                description="Lists Helm plugins",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),
            Tool(
                name="helm_plugin_uninstall",
                description="Uninstalls a Helm plugin",
                inputSchema={"type": "object", "properties": {"plugin_name": {"type": "string"}}, "required": ["plugin_name"]},
            ),
            Tool(
                name="helm_plugin_update",
                description="Updates a Helm plugin",
                inputSchema={"type": "object", "properties": {"plugin_name": {"type": "string"}}, "required": ["plugin_name"]},
            ),

            # Pull tool
            Tool(
                name="helm_pull",
                description="Downloads a chart from a repository",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "chart": {"type": "string"},
                        "repo": {"type": "string"},
                        "version": {"type": "string"},
                        "destination": {"type": "string"},
                        "untar": {"type": "boolean"},
                        "verify": {"type": "boolean"},
                        "keyring": {"type": "string"}
                    },
                    "required": ["chart"]
                },
            ),

            # Push tool
            Tool(
                name="helm_push",
                description="Pushes a chart to a registry",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "chart_path": {"type": "string"},
                        "registry_url": {"type": "string"},
                        "force": {"type": "boolean"},
                        "insecure": {"type": "boolean"},
                        "plain_http": {"type": "boolean"}
                    },
                    "required": ["chart_path", "registry_url"]
                },
            ),

            # Registry tools
            Tool(
                name="helm_registry_login",
                description="Logs in to a registry",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "registry_url": {"type": "string"},
                        "username": {"type": "string"},
                        "password": {"type": "string"},
                        "insecure": {"type": "boolean"}
                    },
                    "required": ["registry_url", "username", "password"]
                },
            ),
            Tool(
                name="helm_registry_logout",
                description="Logs out from a registry",
                inputSchema={"type": "object", "properties": {"registry_url": {"type": "string"}}, "required": ["registry_url"]},
            ),

            # Repo tools
            Tool(
                name="helm_repo_add",
                description="Adds a chart repository",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "url": {"type": "string"},
                        "username": {"type": "string"},
                        "password": {"type": "string"},
                        "pass_credentials": {"type": "boolean"}
                    },
                    "required": ["name", "url"]
                },
            ),
            Tool(
                name="helm_repo_index",
                description="Generates an index file for a chart repository",
                inputSchema={"type": "object", "properties": {"directory": {"type": "string"}, "url": {"type": "string"}, "merge": {"type": "string"}}, "required": ["directory"]},
            ),
            Tool(
                name="helm_repo_list",
                description="Lists chart repositories",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),
            Tool(
                name="helm_repo_remove",
                description="Removes a chart repository",
                inputSchema={"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
            ),
            Tool(
                name="helm_repo_update",
                description="Updates chart repositories",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),

            # Rollback tool
            Tool(
                name="helm_rollback",
                description="Rolls back a release to a previous revision",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "release_name": {"type": "string"},
                        "revision": {"type": "integer"},
                        "namespace": {"type": "string"},
                        "timeout": {"type": "string"},
                        "wait": {"type": "boolean"},
                        "force": {"type": "boolean"}
                    },
                    "required": ["release_name"]
                },
            ),

            # Search tools
            Tool(
                name="helm_search_repo",
                description="Searches repositories for a keyword in charts",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "keyword": {"type": "string"},
                        "version": {"type": "string"},
                        "regexp": {"type": "boolean"},
                        "versions": {"type": "boolean"}
                    },
                    "required": ["keyword"]
                },
            ),
            Tool(
                name="helm_search_hub",
                description="Searches the Helm Hub for a keyword in charts",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "keyword": {"type": "string"},
                        "max_results": {"type": "integer"},
                        "repo_url": {"type": "string"}
                    },
                    "required": ["keyword"]
                },
            ),

            # Show tools
            Tool(
                name="helm_show_all",
                description="Shows all information of a chart",
                inputSchema={"type": "object", "properties": {"chart": {"type": "string"}, "repo": {"type": "string"}, "version": {"type": "string"}}, "required": ["chart"]},
            ),
            Tool(
                name="helm_show_chart",
                description="Shows the chart's definition",
                inputSchema={"type": "object", "properties": {"chart": {"type": "string"}, "repo": {"type": "string"}, "version": {"type": "string"}}, "required": ["chart"]},
            ),
            Tool(
                name="helm_show_crds",
                description="Shows the chart's CRDs",
                inputSchema={"type": "object", "properties": {"chart": {"type": "string"}, "repo": {"type": "string"}, "version": {"type": "string"}}, "required": ["chart"]},
            ),
            Tool(
                name="helm_show_readme",
                description="Shows the chart's README",
                inputSchema={"type": "object", "properties": {"chart": {"type": "string"}, "repo": {"type": "string"}, "version": {"type": "string"}}, "required": ["chart"]},
            ),
            Tool(
                name="helm_show_values",
                description="Shows the chart's values",
                inputSchema={"type": "object", "properties": {"chart": {"type": "string"}, "repo": {"type": "string"}, "version": {"type": "string"}}, "required": ["chart"]},
            ),

            # Status tool
            Tool(
                name="helm_status",
                description="Displays the status of the named release",
                inputSchema={"type": "object", "properties": {"release_name": {"type": "string"}, "namespace": {"type": "string"}, "revision": {"type": "integer"}}, "required": ["release_name"]},
            ),

            # Template tool
            Tool(
                name="helm_template",
                description="Renders chart templates locally and displays the output",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "chart": {"type": "string"},
                        "release_name": {"type": "string"},
                        "namespace": {"type": "string"},
                        "values_file": {"type": "string"},
                        "set_values": {"type": "object"},
                        "api_versions": {"type": "array", "items": {"type": "string"}},
                        "kube_version": {"type": "string"}
                    },
                    "required": ["chart"]
                },
            ),

            # Test tool
            Tool(
                name="helm_test",
                description="Runs tests for a release",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "release_name": {"type": "string"},
                        "namespace": {"type": "string"},
                        "timeout": {"type": "string"},
                        "filter_": {"type": "string"}
                    },
                    "required": ["release_name"]
                },
            ),

            # Uninstall tool
            Tool(
                name="helm_uninstall",
                description="Uninstalls a release",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "release_name": {"type": "string"},
                        "namespace": {"type": "string"},
                        "keep_history": {"type": "boolean"},
                        "no_hooks": {"type": "boolean"}
                    },
                    "required": ["release_name"]
                },
            ),

            # Upgrade tool
            Tool(
                name="helm_upgrade",
                description="Upgrades a release",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "release_name": {"type": "string"},
                        "chart": {"type": "string"},
                        "namespace": {"type": "string"},
                        "values_file": {"type": "string"},
                        "set_values": {"type": "object"},
                        "install": {"type": "boolean"},
                        "force": {"type": "boolean"},
                        "atomic": {"type": "boolean"},
                        "timeout": {"type": "string"},
                        "wait": {"type": "boolean"}
                    },
                    "required": ["release_name", "chart"]
                },
            ),

            # Verify tool
            Tool(
                name="helm_verify",
                description="Verifies that a chart at the given path has been signed and is valid",
                inputSchema={"type": "object", "properties": {"path": {"type": "string"}, "keyring": {"type": "string"}}, "required": ["path"]},
            ),

            # Version tool
            Tool(
                name="helm_version",
                description="Shows the Helm version information",
                inputSchema={"type": "object", "properties": {}, "required": []},
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
        logger.info(f"Tool call: {name} with arguments {arguments}")

        result = ""

        # Use a dictionary mapping for "switch-case" approach
        command_handlers = {
            # Completion commands
            "helm_completion": lambda: helm_completion(arguments["shell"]),

            # Create command
            "helm_create": lambda: helm_create(arguments["name"], arguments.get("starter")),

            # Dependency commands
            "helm_dependency_build": lambda: helm_dependency_build(arguments["chart_path"]),
            "helm_dependency_list": lambda: helm_dependency_list(arguments["chart_path"]),
            "helm_dependency_update": lambda: helm_dependency_update(arguments["chart_path"]),

            # Environment command
            "helm_env": lambda: helm_env(),

            # Get commands
            "helm_get_all": lambda: helm_get_all(arguments["release_name"], arguments.get("namespace")),
            "helm_get_hooks": lambda: helm_get_hooks(arguments["release_name"], arguments.get("namespace")),
            "helm_get_manifest": lambda: helm_get_manifest(arguments["release_name"], arguments.get("namespace")),
            "helm_get_metadata": lambda: helm_get_metadata(arguments["release_name"], arguments.get("namespace")),
            "helm_get_notes": lambda: helm_get_notes(arguments["release_name"], arguments.get("namespace")),
            "helm_get_values": lambda: helm_get_values(
                arguments["release_name"],
                arguments.get("namespace"),
                arguments.get("all_values", False)
            ),

            # History command
            "helm_history": lambda: helm_history(
                arguments["release_name"],
                arguments.get("namespace"),
                arguments.get("max_")
            ),

            # Install command
            "helm_install": lambda: helm_install(
                arguments["chart"],
                arguments.get("release_name"),
                arguments.get("namespace"),
                arguments.get("values_file"),
                arguments.get("set_values"),
                arguments.get("description"),
                arguments.get("timeout"),
                arguments.get("wait", False),
                arguments.get("atomic", False)
            ),

            # Lint command
            "helm_lint": lambda: helm_lint(
                arguments["chart_path"],
                arguments.get("values_file"),
                arguments.get("set_values")
            ),

            # List command
            "helm_list": lambda: helm_list(
                arguments.get("namespace"),
                arguments.get("all_namespaces", False),
                arguments.get("filter_"),
                arguments.get("uninstalled", False),
                arguments.get("deployed", False),
                arguments.get("failed", False)
            ),

            # Package command
            "helm_package": lambda: helm_package(
                arguments["chart_path"],
                arguments.get("destination"),
                arguments.get("app_version"),
                arguments.get("version"),
                arguments.get("dependency_update", False)
            ),

            # Plugin commands
            "helm_plugin_install": lambda: helm_plugin_install(
                arguments["plugin_url"],
                arguments.get("version")
            ),
            "helm_plugin_list": lambda: helm_plugin_list(),
            "helm_plugin_uninstall": lambda: helm_plugin_uninstall(arguments["plugin_name"]),
            "helm_plugin_update": lambda: helm_plugin_update(arguments["plugin_name"]),

            # Pull command
            "helm_pull": lambda: helm_pull(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version"),
                arguments.get("destination"),
                arguments.get("untar", False),
                arguments.get("verify", False),
                arguments.get("keyring")
            ),

            # Push command
            "helm_push": lambda: helm_push(
                arguments["chart_path"],
                arguments["registry_url"],
                arguments.get("force", False),
                arguments.get("insecure", False),
                arguments.get("plain_http", False)
            ),

            # Registry commands
            "helm_registry_login": lambda: helm_registry_login(
                arguments["registry_url"],
                arguments["username"],
                arguments["password"],
                arguments.get("insecure", False)
            ),
            "helm_registry_logout": lambda: helm_registry_logout(arguments["registry_url"]),

            # Repo commands
            "helm_repo_add": lambda: helm_repo_add(
                arguments["name"],
                arguments["url"],
                arguments.get("username"),
                arguments.get("password"),
                arguments.get("pass_credentials", False)
            ),
            "helm_repo_index": lambda: helm_repo_index(
                arguments["directory"],
                arguments.get("url"),
                arguments.get("merge")
            ),
            "helm_repo_list": lambda: helm_repo_list(),
            "helm_repo_remove": lambda: helm_repo_remove(arguments["name"]),
            "helm_repo_update": lambda: helm_repo_update(),

            # Rollback command
            "helm_rollback": lambda: helm_rollback(
                arguments["release_name"],
                arguments.get("revision"),
                arguments.get("namespace"),
                arguments.get("timeout"),
                arguments.get("wait", False),
                arguments.get("force", False)
            ),

            # Search commands
            "helm_search_repo": lambda: helm_search_repo(
                arguments["keyword"],
                arguments.get("version"),
                arguments.get("regexp", False),
                arguments.get("versions", False)
            ),
            "helm_search_hub": lambda: helm_search_hub(
                arguments["keyword"],
                arguments.get("max_results"),
                arguments.get("repo_url")
            ),

            # Show commands
            "helm_show_all": lambda: helm_show_all(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version")
            ),
            "helm_show_chart": lambda: helm_show_chart(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version")
            ),
            "helm_show_crds": lambda: helm_show_crds(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version")
            ),
            "helm_show_readme": lambda: helm_show_readme(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version")
            ),
            "helm_show_values": lambda: helm_show_values(
                arguments["chart"],
                arguments.get("repo"),
                arguments.get("version")
            ),

            # Status command
            "helm_status": lambda: helm_status(
                arguments["release_name"],
                arguments.get("namespace"),
                arguments.get("revision")
            ),

            # Template command
            "helm_template": lambda: helm_template(
                arguments["chart"],
                arguments.get("release_name"),
                arguments.get("namespace"),
                arguments.get("values_file"),
                arguments.get("set_values"),
                arguments.get("api_versions"),
                arguments.get("kube_version")
            ),

            # Test command
            "helm_test": lambda: helm_test(
                arguments["release_name"],
                arguments.get("namespace"),
                arguments.get("timeout"),
                arguments.get("filter_")
            ),

            # Uninstall command
            "helm_uninstall": lambda: helm_uninstall(
                arguments["release_name"],
                arguments.get("namespace"),
                arguments.get("keep_history", False),
                arguments.get("no_hooks", False)
            ),

            # Upgrade command
            "helm_upgrade": lambda: helm_upgrade(
                arguments["release_name"],
                arguments["chart"],
                arguments.get("namespace"),
                arguments.get("values_file"),
                arguments.get("set_values"),
                arguments.get("install", False),
                arguments.get("force", False),
                arguments.get("atomic", False),
                arguments.get("timeout"),
                arguments.get("wait", False)
            ),

            # Verify command
            "helm_verify": lambda: helm_verify(
                arguments["path"],
                arguments.get("keyring")
            ),

            # Version command
            "helm_version": lambda: helm_version(),
        }

        # Execute the corresponding handler or return an error if the command is not found
        if name in command_handlers:
            try:
                result = command_handlers[name]()
            except Exception as e:
                error_msg = f"Error executing {name}: {str(e)}"
                logger.error(error_msg)
                return [TextContent(type="text", text=error_msg)]
        else:
            error_msg = f"Unknown tool: {name}"
            logger.error(error_msg)
            return [TextContent(type="text", text=error_msg)]

        return [TextContent(type="text", text=result)]

    logger.info("Creating initialization options")
    options = server.create_initialization_options()

    logger.info("Starting stdio server")
    async with stdio_server() as (read_stream, write_stream):
        logger.info("Running MCP server")
        await server.run(read_stream, write_stream, options, raise_exceptions=True)

# Add this main function at the end
def main():
    """
    Entry point for the MCP Helm server when run as a command-line program.
    """
    import asyncio

    logging.basicConfig(level=logging.INFO,
                        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    logger = logging.getLogger(__name__)

    logger.info("Starting MCP Helm server")

    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        logger.info("MCP Helm server stopped by user")
    except Exception as e:
        logger.error(f"Error running MCP Helm server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()