import click


@click.group()
def cli():
    pass


@click.group()
def db():
    """Database management commands."""
    pass


@click.command(help="Initialize a new database")
@click.option("--name", type=str, required=True, help="Name of the database to create")
@click.option("--port", type=int, default=5432, help="Port to use for the database")
def init(name, port):
    click.echo(f"Initialized database {name} on port {port}")


@click.command()
@click.argument("names", nargs=-1, metavar="DATABASE_NAMES", required=True)
@click.option(
    "--force/--no-force", default=False, help="Force deletion without confirmation"
)
def drop(names, force):
    """Drop one or more databases by name.

    DATABASE_NAMES: Names of the databases to drop"""
    if not names:
        click.echo("No database names provided")
        return

    for name in names:
        click.echo(f"Dropped database {name}")


@click.group()
def users():
    """User management commands."""
    pass


@click.command(help="Greet a user with custom message")
@click.option("--count", default=1, help="Number of times to greet")
@click.option(
    "--greeting",
    type=click.Choice(["Hello", "Hi", "Hey"]),
    default="Hello",
    help="Greeting to use",
)
@click.argument("name")
def greet(count, greeting, name):
    """Greet a person by name."""
    for _ in range(count):
        click.echo(f"{greeting} {name}!")


db.add_command(init)
db.add_command(drop)
users.add_command(greet)

cli.add_command(db)
cli.add_command(users)

if __name__ == "__main__":
    cli()
