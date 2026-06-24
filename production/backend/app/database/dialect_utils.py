"""
Database dialect utilities to handle differences between MySQL and PostgreSQL.
"""
from enum import Enum
from typing import Optional, Dict, Any, Union, List, Tuple
from sqlalchemy.ext.asyncio import AsyncEngine
from sqlalchemy.sql import text
import logging

logger = logging.getLogger(__name__)

class DbDialect(str, Enum):
    """Database dialect enum"""
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLITE = "sqlite"
    UNKNOWN = "unknown"

def get_dialect(engine: AsyncEngine) -> DbDialect:
    """
    Get the database dialect from the SQLAlchemy engine.
    
    Args:
        engine: The SQLAlchemy engine
        
    Returns:
        DbDialect: The database dialect
    """
    dialect_name = engine.dialect.name
    
    if dialect_name == "mysql":
        return DbDialect.MYSQL
    elif dialect_name in ("postgresql", "postgres"):
        return DbDialect.POSTGRESQL
    elif dialect_name == "sqlite":
        return DbDialect.SQLITE
    else:
        logger.warning(f"Unknown database dialect: {dialect_name}")
        return DbDialect.UNKNOWN

def get_add_column_sql(table: str, column: str, column_type: str, nullable: bool = False,
                      default: Optional[str] = None) -> Dict[DbDialect, str]:
    """
    Get SQL statements to add a column for different dialects.
    
    Args:
        table: Table name
        column: Column name
        column_type: Column type
        nullable: Whether the column can be null
        default: Default value for the column
        
    Returns:
        Dict[DbDialect, str]: SQL statements for each dialect
    """
    not_null = "" if nullable else "NOT NULL"
    default_clause = f"DEFAULT {default}" if default is not None else ""
    
    # Common SQL template for most dialects
    common_sql = f"ALTER TABLE {table} ADD COLUMN {column} {column_type} {not_null} {default_clause}"
    
    return {
        DbDialect.MYSQL: common_sql,
        DbDialect.POSTGRESQL: common_sql,
        DbDialect.SQLITE: common_sql,
        DbDialect.UNKNOWN: common_sql
    }

def get_modify_column_sql(table: str, column: str, column_type: str, nullable: bool = True) -> Dict[DbDialect, str]:
    """
    Get SQL statements to modify a column for different dialects.
    
    Args:
        table: Table name
        column: Column name
        column_type: Column type
        nullable: Whether the column can be null
        
    Returns:
        Dict[DbDialect, str]: SQL statements for each dialect
    """
    not_null = "NOT NULL" if not nullable else "NULL"
    
    return {
        DbDialect.MYSQL: f"ALTER TABLE {table} MODIFY COLUMN {column} {column_type} {not_null}",
        DbDialect.POSTGRESQL: f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {column_type}, "
                             f"ALTER COLUMN {column} {'SET' if not nullable else 'DROP'} NOT NULL",
        DbDialect.SQLITE: "-- SQLite does not support modifying columns directly; you must create a new table",
        DbDialect.UNKNOWN: f"-- Unknown dialect: Cannot provide SQL to modify column {column} in table {table}"
    }

def get_table_exists_sql(table: str) -> Dict[DbDialect, str]:
    """
    Get SQL statements to check if a table exists for different dialects.
    
    Args:
        table: Table name
        
    Returns:
        Dict[DbDialect, str]: SQL statements for each dialect
    """
    return {
        DbDialect.MYSQL: f"SELECT 1 FROM information_schema.tables WHERE table_name = '{table}' LIMIT 1",
        DbDialect.POSTGRESQL: f"SELECT 1 FROM information_schema.tables WHERE table_name = '{table}' LIMIT 1",
        DbDialect.SQLITE: f"SELECT 1 FROM sqlite_master WHERE type='table' AND name='{table}' LIMIT 1",
        DbDialect.UNKNOWN: f"SELECT 1 FROM information_schema.tables WHERE table_name = '{table}' LIMIT 1"
    }

def get_column_exists_sql(table: str, column: str) -> Dict[DbDialect, str]:
    """
    Get SQL statements to check if a column exists in a table for different dialects.
    
    Args:
        table: Table name
        column: Column name
        
    Returns:
        Dict[DbDialect, str]: SQL statements for each dialect
    """
    return {
        DbDialect.MYSQL: f"""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = '{table}' AND column_name = '{column}'
            LIMIT 1
        """,
        DbDialect.POSTGRESQL: f"""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = '{table}' AND column_name = '{column}'
            LIMIT 1
        """,
        DbDialect.SQLITE: f"SELECT 1 FROM pragma_table_info('{table}') WHERE name='{column}' LIMIT 1",
        DbDialect.UNKNOWN: f"""
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = '{table}' AND column_name = '{column}'
            LIMIT 1
        """
    }

async def execute_dialect_sql(conn, dialect: DbDialect, sql_dict: Dict[DbDialect, str]) -> Optional[Any]:
    """
    Execute the SQL statement for the specified dialect.
    
    Args:
        conn: Database connection
        dialect: Database dialect
        sql_dict: Dictionary mapping dialects to SQL statements
        
    Returns:
        Optional[Any]: Result of the SQL execution
    """
    sql = sql_dict.get(dialect)
    
    if not sql or sql.startswith('--'):
        logger.warning(f"No SQL available for dialect {dialect}")
        return None
    
    try:
        result = await conn.execute(text(sql))
        return result
    except Exception as e:
        logger.error(f"Error executing SQL for dialect {dialect}: {e}")
        logger.error(f"SQL: {sql}")
        raise

async def column_exists(conn, dialect: DbDialect, table: str, column: str) -> bool:
    """
    Check if a column exists in a table.
    
    Args:
        conn: Database connection
        dialect: Database dialect
        table: Table name
        column: Column name
        
    Returns:
        bool: True if the column exists, False otherwise
    """
    sql_dict = get_column_exists_sql(table, column)
    result = await execute_dialect_sql(conn, dialect, sql_dict)
    
    if result is None:
        return False
    
    row = await result.first()
    return row is not None and len(row) > 0

async def table_exists(conn, dialect: DbDialect, table: str) -> bool:
    """
    Check if a table exists.
    
    Args:
        conn: Database connection
        dialect: Database dialect
        table: Table name
        
    Returns:
        bool: True if the table exists, False otherwise
    """
    sql_dict = get_table_exists_sql(table)
    result = await execute_dialect_sql(conn, dialect, sql_dict)
    
    if result is None:
        return False
    
    row = await result.first()
    return row is not None and len(row) > 0 