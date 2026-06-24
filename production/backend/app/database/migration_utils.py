import os
import json
import sqlite3
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

import asyncio
import aiosqlite
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.logging import logger

# Database paths
DB_PATH = Path("./data/sql_app.db")
BACKUP_DIR = Path("./data/backups")


async def backup_database() -> Path:
    """
    Create a backup of the current database.
    
    Returns:
        Path: Path to the backup file
    """
    # Ensure backup directory exists
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create a timestamped backup filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"sql_app_backup_{timestamp}.db"
    
    # Check if database exists before backing up
    if not DB_PATH.exists():
        logger.warning(f"Database file {DB_PATH} does not exist. No backup created.")
        return backup_path
    
    # Copy the database file to create a backup
    shutil.copy2(DB_PATH, backup_path)
    logger.info(f"Database backed up to {backup_path}")
    
    return backup_path


async def export_table_data(table_name: str) -> List[Dict[str, Any]]:
    """
    Export data from a specific table.
    
    Args:
        table_name: Name of the table to export data from
        
    Returns:
        List of dictionaries containing the table data
    """
    if not DB_PATH.exists():
        logger.warning(f"Database file {DB_PATH} does not exist. No data exported.")
        return []
    
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        try:
            # Get table schema
            cursor = await db.execute(f"PRAGMA table_info({table_name})")
            columns = await cursor.fetchall()
            
            if not columns:
                logger.warning(f"Table {table_name} does not exist or has no columns.")
                return []
            
            # Get table data
            cursor = await db.execute(f"SELECT * FROM {table_name}")
            rows = await cursor.fetchall()
            
            # Convert to list of dictionaries
            result = []
            for row in rows:
                row_dict = {column["name"]: row[column["name"]] for column in columns}
                result.append(row_dict)
            
            logger.info(f"Exported {len(result)} rows from table {table_name}")
            return result
        except Exception as e:
            logger.error(f"Error exporting data from table {table_name}: {e}")
            return []


async def export_all_tables() -> Dict[str, List[Dict[str, Any]]]:
    """
    Export data from all tables in the database.
    
    Returns:
        Dictionary mapping table names to their data
    """
    if not DB_PATH.exists():
        logger.warning(f"Database file {DB_PATH} does not exist. No data exported.")
        return {}
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Get list of all tables
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = await cursor.fetchall()
        
        # Export data from each table
        result = {}
        for table in tables:
            table_name = table[0]
            table_data = await export_table_data(table_name)
            result[table_name] = table_data
        
        return result


async def save_data_to_json(data: Dict[str, List[Dict[str, Any]]]) -> Path:
    """
    Save exported data to a JSON file.
    
    Args:
        data: Dictionary mapping table names to their data
        
    Returns:
        Path to the JSON file
    """
    # Ensure backup directory exists
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Create a timestamped filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = BACKUP_DIR / f"data_backup_{timestamp}.json"
    
    # Convert datetime objects to strings
    def json_serializer(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Type {type(obj)} not serializable")
    
    # Save data to JSON file
    with open(json_path, 'w') as f:
        json.dump(data, f, default=json_serializer, indent=2)
    
    logger.info(f"Data exported to {json_path}")
    return json_path


async def get_table_columns(table_name: str) -> List[str]:
    """
    Get the column names for a specific table.
    
    Args:
        table_name: Name of the table
        
    Returns:
        List of column names
    """
    if not DB_PATH.exists():
        logger.warning(f"Database file {DB_PATH} does not exist.")
        return []
    
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cursor = await db.execute(f"PRAGMA table_info({table_name})")
            columns = await cursor.fetchall()
            return [column[1] for column in columns]  # Column name is at index 1
        except Exception as e:
            logger.error(f"Error getting columns for table {table_name}: {e}")
            return []


async def import_data_from_json(json_path: Path) -> Dict[str, List[Dict[str, Any]]]:
    """
    Import data from a JSON file.
    
    Args:
        json_path: Path to the JSON file
        
    Returns:
        Dictionary mapping table names to their data
    """
    if not json_path.exists():
        logger.error(f"JSON file {json_path} does not exist.")
        return {}
    
    with open(json_path, 'r') as f:
        data = json.load(f)
    
    logger.info(f"Data imported from {json_path}")
    return data


async def restore_table_data(table_name: str, data: List[Dict[str, Any]]) -> int:
    """
    Restore data to a specific table.
    
    Args:
        table_name: Name of the table to restore data to
        data: List of dictionaries containing the data to restore
        
    Returns:
        Number of rows restored
    """
    if not DB_PATH.exists():
        logger.error(f"Database file {DB_PATH} does not exist. Cannot restore data.")
        return 0
    
    if not data:
        logger.warning(f"No data to restore for table {table_name}.")
        return 0
    
    # Get current table columns
    current_columns = await get_table_columns(table_name)
    if not current_columns:
        logger.error(f"Table {table_name} does not exist or has no columns.")
        return 0
    
    # Filter data to only include columns that exist in the current table
    filtered_data = []
    for row in data:
        filtered_row = {k: v for k, v in row.items() if k in current_columns}
        if filtered_row:
            filtered_data.append(filtered_row)
    
    if not filtered_data:
        logger.warning(f"No compatible data to restore for table {table_name}.")
        return 0
    
    # Restore data
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            count = 0
            for row in filtered_data:
                columns = list(row.keys())
                placeholders = ', '.join(['?' for _ in columns])
                column_str = ', '.join(columns)
                values = [row[col] for col in columns]
                
                query = f"INSERT INTO {table_name} ({column_str}) VALUES ({placeholders})"
                await db.execute(query, values)
                count += 1
            
            await db.commit()
            logger.info(f"Restored {count} rows to table {table_name}")
            return count
        except Exception as e:
            logger.error(f"Error restoring data to table {table_name}: {e}")
            await db.rollback()
            return 0


async def restore_all_tables(data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, int]:
    """
    Restore data to all tables.
    
    Args:
        data: Dictionary mapping table names to their data
        
    Returns:
        Dictionary mapping table names to the number of rows restored
    """
    if not DB_PATH.exists():
        logger.error(f"Database file {DB_PATH} does not exist. Cannot restore data.")
        return {}
    
    # Get list of all tables in the current database
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = await cursor.fetchall()
        current_tables = [table[0] for table in tables]
    
    # Restore data for each table that exists in the current database
    result = {}
    for table_name, table_data in data.items():
        if table_name in current_tables:
            count = await restore_table_data(table_name, table_data)
            result[table_name] = count
        else:
            logger.warning(f"Table {table_name} does not exist in the current database. Skipping.")
    
    return result


async def run_alembic_migration(revision: str = "head") -> bool:
    """
    Run Alembic migration to upgrade the database schema.
    
    Args:
        revision: Alembic revision to upgrade to (default: "head")
        
    Returns:
        True if migration was successful, False otherwise
    """
    try:
        # Run alembic upgrade command
        process = await asyncio.create_subprocess_exec(
            "alembic", "upgrade", revision,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"Alembic migration failed: {stderr.decode()}")
            return False
        
        logger.info(f"Alembic migration successful: {stdout.decode()}")
        return True
    except Exception as e:
        logger.error(f"Error running Alembic migration: {e}")
        return False


async def perform_migration_with_data_preservation() -> bool:
    """
    Perform a complete migration with data preservation.
    
    Steps:
    1. Backup the database
    2. Export all data to JSON
    3. Run Alembic migration
    4. Restore data from JSON
    
    Returns:
        True if migration was successful, False otherwise
    """
    try:
        # Step 1: Backup the database
        backup_path = await backup_database()
        
        # Step 2: Export all data to JSON
        data = await export_all_tables()
        json_path = await save_data_to_json(data)
        
        # Step 3: Run Alembic migration
        migration_success = await run_alembic_migration()
        if not migration_success:
            logger.error("Migration failed. Consider restoring from backup.")
            return False
        
        # Step 4: Restore data from JSON
        restore_results = await restore_all_tables(data)
        
        # Log restoration results
        total_restored = sum(restore_results.values())
        logger.info(f"Migration completed successfully. Restored {total_restored} rows across {len(restore_results)} tables.")
        for table, count in restore_results.items():
            logger.info(f"  - {table}: {count} rows")
        
        return True
    except Exception as e:
        logger.error(f"Error during migration with data preservation: {e}")
        return False


async def create_migration_revision(message: str) -> bool:
    """
    Create a new Alembic migration revision.
    
    Args:
        message: Migration message
        
    Returns:
        True if revision creation was successful, False otherwise
    """
    try:
        # Run alembic revision command
        process = await asyncio.create_subprocess_exec(
            "alembic", "revision", "--autogenerate", "-m", message,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            logger.error(f"Alembic revision creation failed: {stderr.decode()}")
            return False
        
        logger.info(f"Alembic revision created successfully: {stdout.decode()}")
        return True
    except Exception as e:
        logger.error(f"Error creating Alembic revision: {e}")
        return False 