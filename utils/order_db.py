import os
import sqlite3
import asyncio
import logging
from typing import Optional, Dict, Any

from config import settings

logger = logging.getLogger("nexus.order_db")

# Sample seed data for the orders table
SAMPLE_ORDERS = [
    {
        "order_id": "7721",
        "customer_name": "Alex Mercer",
        "status": "In Transit",
        "carrier": "Express Courier",
        "tracking_number": "TRK-7721-EX",
        "estimated_delivery": "1-2 business days",
        "items": "Nexus Pro Wireless Mechanical Keyboard, Palm Rest"
    },
    {
        "order_id": "1001",
        "customer_name": "Jordan Lee",
        "status": "Delivered",
        "carrier": "FedEx",
        "tracking_number": "FDX-998811-US",
        "estimated_delivery": "Delivered yesterday at 2:15 PM",
        "items": "USB-C Fast Charging Dock 100W"
    },
    {
        "order_id": "1002",
        "customer_name": "Sarah Connor",
        "status": "Processing",
        "carrier": "DHL Express",
        "tracking_number": "DHL-443322-GL",
        "estimated_delivery": "3-5 business days",
        "items": "Ergonomic Monitor Arm Stand"
    },
    {
        "order_id": "5544",
        "customer_name": "David Miller",
        "status": "Shipped",
        "carrier": "UPS Ground",
        "tracking_number": "UPS-112233-TN",
        "estimated_delivery": "Tomorrow by 5:00 PM",
        "items": "Active Noise Cancelling Wireless Headset"
    }
]

def init_orders_table(db_path: str = settings.SQLITE_DB_PATH) -> None:
    """
    Initializes the 'orders' table in SQLite and seeds sample records if empty.
    Runs synchronously (typically called at startup or lazy initialization).
    """
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                customer_name TEXT,
                status TEXT NOT NULL,
                carrier TEXT,
                tracking_number TEXT,
                estimated_delivery TEXT,
                items TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Check if table has data; if not, seed with sample orders
        cursor.execute("SELECT COUNT(*) FROM orders")
        count = cursor.fetchone()[0]
        if count == 0:
            cursor.executemany("""
                INSERT OR IGNORE INTO orders (
                    order_id, customer_name, status, carrier,
                    tracking_number, estimated_delivery, items
                ) VALUES (
                    :order_id, :customer_name, :status, :carrier,
                    :tracking_number, :estimated_delivery, :items
                )
            """, SAMPLE_ORDERS)
            conn.commit()
            logger.info(f"Seeded {len(SAMPLE_ORDERS)} sample orders into {db_path}.")
    except Exception as e:
        logger.error(f"Error initializing orders table in {db_path}: {e}")
    finally:
        conn.close()


def _sync_get_order(order_id: str, db_path: str) -> Optional[Dict[str, Any]]:
    """Synchronous worker that looks up an order in SQLite."""
    if not os.path.exists(db_path):
        init_orders_table(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT order_id, customer_name, status, carrier,
                   tracking_number, estimated_delivery, items, created_at
            FROM orders
            WHERE order_id = ?
        """, (order_id.strip(),))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    except Exception as e:
        logger.error(f"Database query failed for order {order_id}: {e}")
        return None
    finally:
        conn.close()


async def get_order_by_id(order_id: str, db_path: str = settings.SQLITE_DB_PATH) -> Optional[Dict[str, Any]]:
    """
    Asynchronously queries an order by order_id from SQLite.
    Tries aiosqlite if available; falls back to asyncio.to_thread with sqlite3.
    Non-blocking to ensure FastAPI and LangGraph event loops are never stalled.
    """
    clean_id = order_id.strip().lstrip("#")
    
    # Try aiosqlite first if installed
    try:
        import aiosqlite
        if not os.path.exists(db_path):
            await asyncio.to_thread(init_orders_table, db_path)

        async with aiosqlite.connect(db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT order_id, customer_name, status, carrier,
                       tracking_number, estimated_delivery, items, created_at
                FROM orders
                WHERE order_id = ?
            """, (clean_id,)) as cursor:
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return None
    except ImportError:
        # Graceful non-blocking fallback using standard library sqlite3 + asyncio.to_thread
        return await asyncio.to_thread(_sync_get_order, clean_id, db_path)
    except Exception as e:
        logger.warning(f"aiosqlite lookup failed ({e}), falling back to asyncio.to_thread")
        return await asyncio.to_thread(_sync_get_order, clean_id, db_path)
