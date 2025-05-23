from setuptools import setup, find_packages

setup(
    name="mcp-server-fetch",
    version="0.6.3.1",
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    entry_points={
        "console_scripts": [
            "mcp-server-fetch = mcp_server_fetch:main",
        ],
    },
)