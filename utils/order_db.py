import os
import sqlite3
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from config import settings

logger = logging.getLogger("nexus.order_db")

DEFAULT_ORG_ID = "org_nexus"

# Sample seed data for the orders table across pre-seeded organizations
SAMPLE_ORDERS = [
    {
        "org_id": "org_nexus",
        "order_id": "7721",
        "customer_name": "Alex Mercer",
        "status": "In Transit",
        "carrier": "Express Courier",
        "tracking_number": "TRK-7721-EX",
        "estimated_delivery": "1-2 business days",
        "items": "Nexus Pro Wireless Mechanical Keyboard, Palm Rest"
    },
    {
        "org_id": "org_nexus",
        "order_id": "1001",
        "customer_name": "Jordan Lee",
        "status": "Delivered",
        "carrier": "FedEx",
        "tracking_number": "FDX-998811-US",
        "estimated_delivery": "Delivered yesterday at 2:15 PM",
        "items": "USB-C Fast Charging Dock 100W"
    },
    {
        "org_id": "org_nexus",
        "order_id": "1002",
        "customer_name": "Sarah Connor",
        "status": "Processing",
        "carrier": "DHL Express",
        "tracking_number": "DHL-443322-GL",
        "estimated_delivery": "3-5 business days",
        "items": "Ergonomic Monitor Arm Stand"
    },
    {
        "org_id": "org_nexus",
        "order_id": "5544",
        "customer_name": "David Miller",
        "status": "Shipped",
        "carrier": "UPS Ground",
        "tracking_number": "UPS-112233-TN",
        "estimated_delivery": "Tomorrow by 5:00 PM",
        "items": "Active Noise Cancelling Wireless Headset"
    },
    {
        "org_id": "org_amazon",
        "order_id": "7721",
        "customer_name": "Amazon Prime Customer",
        "status": "Delivered via Amazon Prime Logistics",
        "carrier": "Amazon Prime Logistics",
        "tracking_number": "AMZ-PRIME-7721",
        "estimated_delivery": "Delivered today at 10:30 AM",
        "items": "Echo Dot (5th Gen), Anker USB-C Hub"
    },
    {
        "org_id": "org_flipkart",
        "order_id": "7721",
        "customer_name": "Flipkart Plus Customer",
        "status": "Out for Delivery via Ekart Logistics",
        "carrier": "Ekart Logistics",
        "tracking_number": "EKART-FKT-7721",
        "estimated_delivery": "Arriving today by 8:00 PM",
        "items": "Noise ColorFit Smartwatch, boAt Airdopes"
    },
]

def init_orders_table(db_path: Optional[str] = None) -> None:
    """
    Initializes or migrates the multi-tenant 'orders' table with PRIMARY KEY (org_id, order_id)
    and idempotently seeds sample records for Nexus Enterprise, Amazon Support, and Flipkart Support.
    """
    resolved_path = db_path or settings.SQLITE_DB_PATH
    parent = os.path.dirname(resolved_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(resolved_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='orders'")
        exists = cursor.fetchone() is not None

        if not exists:
            cursor.execute("""
                CREATE TABLE orders (
                    org_id TEXT NOT NULL DEFAULT 'org_nexus',
                    order_id TEXT NOT NULL,
                    customer_name TEXT,
                    status TEXT NOT NULL,
                    carrier TEXT,
                    tracking_number TEXT,
                    estimated_delivery TEXT,
                    items TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (org_id, order_id)
                )
            """)
        else:
            table_info = cursor.execute("PRAGMA table_info(orders)").fetchall()
            col_names = [row[1] for row in table_info]
            col_set = set(col_names)
            pk_cols = [row[1] for row in table_info if row[5] > 0]
            if "org_id" not in col_set or set(pk_cols) != {"org_id", "order_id"}:
                default_created_at = datetime.now(timezone.utc).isoformat()
                org_expr = "COALESCE(org_id, 'org_nexus')" if "org_id" in col_set else "'org_nexus'"
                created_at_expr = "COALESCE(created_at, ?)" if "created_at" in col_set else "?"
                customer_expr = "customer_name" if "customer_name" in col_set else "NULL"
                carrier_expr = "carrier" if "carrier" in col_set else "NULL"
                tracking_expr = "tracking_number" if "tracking_number" in col_set else "NULL"
                delivery_expr = "estimated_delivery" if "estimated_delivery" in col_set else "NULL"
                items_expr = "items" if "items" in col_set else "NULL"

                cursor.execute("""
                    CREATE TABLE orders_migrated (
                        org_id TEXT NOT NULL DEFAULT 'org_nexus',
                        order_id TEXT NOT NULL,
                        customer_name TEXT,
                        status TEXT NOT NULL,
                        carrier TEXT,
                        tracking_number TEXT,
                        estimated_delivery TEXT,
                        items TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (org_id, order_id)
                    )
                """)
                cursor.execute(
                    f"""
                    INSERT OR IGNORE INTO orders_migrated (
                        org_id, order_id, customer_name, status, carrier,
                        tracking_number, estimated_delivery, items, created_at
                    )
                    SELECT
                        {org_expr}, order_id, {customer_expr}, status, {carrier_expr},
                        {tracking_expr}, {delivery_expr}, {items_expr}, {created_at_expr}
                    FROM orders
                    """,
                    (default_created_at,),
                )
                cursor.execute("DROP TABLE orders")
                cursor.execute("ALTER TABLE orders_migrated RENAME TO orders")

        # Idempotently seed all pre-configured tenant orders
        cursor.executemany("""
            INSERT OR IGNORE INTO orders (
                org_id, order_id, customer_name, status, carrier,
                tracking_number, estimated_delivery, items
            ) VALUES (
                :org_id, :order_id, :customer_name, :status, :carrier,
                :tracking_number, :estimated_delivery, :items
            )
        """, SAMPLE_ORDERS)
        conn.commit()
    except Exception as e:
        logger.error(f"Error initializing orders table in {resolved_path}: {e}")
    finally:
        conn.close()


def _sync_get_order(
    order_id: str,
    db_path: str,
    org_id: str = DEFAULT_ORG_ID,
) -> Optional[Dict[str, Any]]:
    """Synchronous worker that looks up a tenant-scoped order in SQLite."""
    if not os.path.exists(db_path):
        init_orders_table(db_path)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT org_id, order_id, customer_name, status, carrier,
                   tracking_number, estimated_delivery, items, created_at
            FROM orders
            WHERE org_id = ? AND order_id = ?
        """, (org_id, order_id.strip()))
        row = cursor.fetchone()
        if row:
            return dict(row)
        return None
    except Exception as e:
        logger.error(f"Database query failed for org={org_id} order={order_id}: {e}")
        return None
    finally:
        conn.close()


async def get_order_by_id(
    order_id: str,
    db_path: Optional[str] = None,
    org_id: str = DEFAULT_ORG_ID,
) -> Optional[Dict[str, Any]]:
    """
    Asynchronously queries an order by (org_id, order_id) from SQLite.
    Tries aiosqlite if available; falls back to asyncio.to_thread with sqlite3.
    Non-blocking to ensure FastAPI and LangGraph event loops are never stalled.
    """
    resolved_db = db_path or settings.SQLITE_DB_PATH
    resolved_org = (org_id or DEFAULT_ORG_ID).strip()
    clean_id = order_id.strip().lstrip("#")

    try:
        import aiosqlite
        if not os.path.exists(resolved_db):
            await asyncio.to_thread(init_orders_table, resolved_db)

        async with aiosqlite.connect(resolved_db) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT org_id, order_id, customer_name, status, carrier,
                       tracking_number, estimated_delivery, items, created_at
                FROM orders
                WHERE org_id = ? AND order_id = ?
            """, (resolved_org, clean_id)) as cursor:
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return None
    except ImportError:
        return await asyncio.to_thread(_sync_get_order, clean_id, resolved_db, resolved_org)
    except Exception as e:
        logger.warning(f"aiosqlite lookup failed ({e}), falling back to asyncio.to_thread")
        return await asyncio.to_thread(_sync_get_order, clean_id, resolved_db, resolved_org)
