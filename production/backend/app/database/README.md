# Database Migration System

This directory contains the database configuration and migration system for the application. The migration system is built using Alembic and includes utilities for preserving data during schema changes.

## Overview

The migration system provides the following features:

1. **Database Schema Versioning**: Track and manage database schema changes using Alembic.
2. **Data Preservation**: Automatically backup and restore data during schema migrations.
3. **Backup and Restore**: Create and restore database backups as needed.

## Directory Structure

- `base.py`: Database connection configuration
- `migration_utils.py`: Utilities for data preservation during migrations
- `migrations/`: Alembic migration scripts
- `README.md`: This documentation file

## Usage

The migration system can be used via the command-line interface provided by `app/scripts/migrate.py`.

### Creating a New Migration

When you need to make changes to the database schema, follow these steps:

1. Modify the SQLAlchemy models in `app/models/models.py` as needed.
2. Create a new migration revision:

```bash
python -m app.scripts.migrate create "Description of the changes"
```

This will generate a new migration script in the `migrations/versions/` directory.

3. Review the generated migration script to ensure it correctly captures your changes.

### Applying Migrations

To apply migrations with data preservation:

```bash
python -m app.scripts.migrate upgrade
```

This command will:
1. Backup the current database
2. Export all data to JSON
3. Apply the migrations
4. Restore the data to the new schema

### Creating a Backup

To create a backup of the database:

```bash
python -m app.scripts.migrate backup
```

This will create both a SQLite database backup and a JSON export of all data.

### Restoring from a Backup

To restore the database from a backup:

```bash
python -m app.scripts.migrate restore ./data/backups/sql_app_backup_20230101_120000.db
```

or

```bash
python -m app.scripts.migrate restore ./data/backups/data_backup_20230101_120000.json
```

## How It Works

### Data Preservation Process

The data preservation process works as follows:

1. **Backup**: The current database file is copied to a timestamped backup file.
2. **Export**: All data from all tables is exported to a JSON file.
3. **Migration**: Alembic migrations are applied to update the database schema.
4. **Restore**: Data is restored from the JSON file to the new schema.

During the restore process, the system:
- Only restores data to tables that exist in the new schema
- Only includes columns that exist in the new schema
- Handles type conversions where possible

### Handling Schema Changes

The system can handle the following types of schema changes:

- **Adding columns**: New columns will be created with default values.
- **Removing columns**: Data from removed columns will not be restored.
- **Renaming columns**: Data from renamed columns will be lost unless manually handled.
- **Changing column types**: Basic type conversions are attempted, but complex changes may require manual handling.

For complex schema changes, you may need to modify the migration script to include custom data migration logic.

## Best Practices

1. **Regular Backups**: Create regular backups of your database, especially before major schema changes.
2. **Test Migrations**: Test migrations in a development environment before applying them to production.
3. **Review Migration Scripts**: Always review the generated migration scripts to ensure they correctly capture your changes.
4. **Custom Data Migration**: For complex schema changes, consider adding custom data migration logic to the migration script.

## Troubleshooting

### Migration Fails

If a migration fails, you can restore from the backup:

```bash
python -m app.scripts.migrate restore ./data/backups/sql_app_backup_TIMESTAMP.db
```

### Data Loss

If data is lost during migration, you can restore from the JSON backup:

```bash
python -m app.scripts.migrate restore ./data/backups/data_backup_TIMESTAMP.json
```

### Alembic Errors

If you encounter Alembic errors, check the following:

1. Ensure your models are correctly defined.
2. Check for circular dependencies in your models.
3. Verify that the database URL in `alembic.ini` is correct.
4. Check the Alembic documentation for specific error messages. 