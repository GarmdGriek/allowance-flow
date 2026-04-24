"""Notifications API for in-app notifications.

Provides endpoints for listing, creating, and managing notifications.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

from app.auth import AuthorizedUser
from app.db import get_pool

router = APIRouter()


class NotificationResponse(BaseModel):
    """Response model for a notification."""
    id: str
    user_id: str
    family_id: str
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: str
    read_at: Optional[str]
    metadata: Optional[dict]


class MarkReadRequest(BaseModel):
    """Request to mark notification(s) as read."""
    notification_ids: List[str]


@router.get("/", response_model=List[NotificationResponse])
async def list_notifications(user: AuthorizedUser, unread_only: bool = False) -> List[NotificationResponse]:
    """List notifications for the current user.
    
    Args:
        unread_only: If True, only return unread notifications
    
    Returns:
        List of notifications ordered by most recent first
    """
    async with get_pool().acquire() as conn:
        query = """
            SELECT id, user_id, family_id, title, message, notification_type,
                   is_read, created_at, read_at, metadata
            FROM notifications
            WHERE user_id = $1
        """

        if unread_only:
            query += " AND is_read = FALSE"

        query += " ORDER BY created_at DESC LIMIT 50"

        rows = await conn.fetch(query, user.sub)

        result = []
        for row in rows:
            result.append(NotificationResponse(
                id=str(row["id"]),
                user_id=str(row["user_id"]),
                family_id=str(row["family_id"]),
                title=row["title"],
                message=row["message"],
                notification_type=row["notification_type"],
                is_read=row["is_read"],
                created_at=row["created_at"].isoformat(),
                read_at=row["read_at"].isoformat() if row["read_at"] else None,
                metadata=row["metadata"]
            ))

        return result


@router.get("/unread-count")
async def get_unread_count(user: AuthorizedUser) -> dict:
    """Get count of unread notifications for the current user."""
    async with get_pool().acquire() as conn:
        count = await conn.fetchval(
            "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE",
            user.sub
        )

        return {"count": count}


@router.post("/mark-read")
async def mark_notifications_read(body: MarkReadRequest, user: AuthorizedUser) -> dict:
    """Mark one or more notifications as read.
    
    Only allows marking notifications owned by the current user.
    """
    async with get_pool().acquire() as conn:
        result = await conn.execute(
            """
            UPDATE notifications
            SET is_read = TRUE, read_at = NOW()
            WHERE id = ANY($1) AND user_id = $2 AND is_read = FALSE
            """,
            body.notification_ids,
            user.sub
        )

        updated_count = int(result.split()[-1]) if result else 0

        return {
            "success": True,
            "marked_count": updated_count
        }


@router.post("/mark-all-read")
async def mark_all_read(user: AuthorizedUser) -> dict:
    """Mark all notifications as read for the current user."""
    async with get_pool().acquire() as conn:
        result = await conn.execute(
            """
            UPDATE notifications
            SET is_read = TRUE, read_at = NOW()
            WHERE user_id = $1 AND is_read = FALSE
            """,
            user.sub
        )

        updated_count = int(result.split()[-1]) if result else 0

        return {
            "success": True,
            "marked_count": updated_count
        }
