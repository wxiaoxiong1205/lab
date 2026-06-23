"""
Examples of how to use the migration system.

This file contains examples of how to use the migration system programmatically.
For command-line usage, see the README.md file.
"""

import asyncio
from pathlib import Path

from app.database.migration_utils import (
    backup_database,
    export_all_tables,
    save_data_to_json,
    import_data_from_json,
    restore_all_tables,
    run_alembic_migration,
    perform_migration_with_data_preservation,
    create_migration_revision,
)


async def example_backup_database():
    """Example of how to backup the database."""
    backup_path = await backup_database()
    print(f"Database backed up to: {backup_path}")
    return backup_path


async def example_export_data():
    """Example of how to export data from the database."""
    data = await export_all_tables()
    json_path = await save_data_to_json(data)
    print(f"Data exported to: {json_path}")
    return json_path


async def example_restore_data(json_path: Path):
    """Example of how to restore data from a JSON file."""
    data = await import_data_from_json(json_path)
    results = await restore_all_tables(data)
    total_restored = sum(results.values())
    print(f"Restored {total_restored} rows across {len(results)} tables.")
    for table, count in results.items():
        print(f"  - {table}: {count} rows")
    return results


async def example_create_migration():
    """Example of how to create a migration revision."""
    message = "Add example column to users table"
    success = await create_migration_revision(message)
    if success:
        print(f"Migration revision created successfully with message: {message}")
    else:
        print("Failed to create migration revision.")
    return success


async def example_run_migration():
    """Example of how to run a migration."""
    success = await run_alembic_migration()
    if success:
        print("Migration completed successfully.")
    else:
        print("Migration failed.")
    return success


async def example_full_migration_workflow():
    """Example of a full migration workflow with data preservation."""
    success = await perform_migration_with_data_preservation()
    if success:
        print("Migration with data preservation completed successfully.")
    else:
        print("Migration with data preservation failed.")
    return success


# Example of how to run these examples
if __name__ == "__main__":
    # Choose which example to run
    example = "backup"  # Change this to run a different example
    
    if example == "backup":
        asyncio.run(example_backup_database())
    elif example == "export":
        asyncio.run(example_export_data())
    elif example == "restore":
        # Replace with the path to your JSON file
        json_path = Path("./data/backups/data_backup_20230101_120000.json")
        asyncio.run(example_restore_data(json_path))
    elif example == "create_migration":
        asyncio.run(example_create_migration())
    elif example == "run_migration":
        asyncio.run(example_run_migration())
    elif example == "full_workflow":
        asyncio.run(example_full_migration_workflow())
    else:
        print(f"Unknown example: {example}")
        print("Available examples: backup, export, restore, create_migration, run_migration, full_workflow") 