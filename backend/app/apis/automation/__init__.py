"""Automation API for scheduled tasks.

Provides endpoints for automated processes like weekly summaries.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import uuid

from app.db import get_pool

router = APIRouter()


class WeeklySummaryResult(BaseModel):
    """Result of weekly summary generation."""
    notifications_sent: int
    families_processed: int
    children_summarized: int
    details: list[str]


@router.post("/weekly-summary", response_model=WeeklySummaryResult)
async def send_weekly_summary() -> WeeklySummaryResult:
    """Generate and send weekly earnings summary to parents.
    
    This endpoint is triggered by a scheduled job every Saturday morning.
    It creates in-app notifications for parents showing their children's
    weekly task completion and earnings.
    
    Returns:
        Summary of notifications sent
    """
    async with get_pool().acquire() as conn:
        notifications_sent = 0
        families_processed = 0
        children_summarized = 0
        details = []
        
        # Get all families with at least one parent
        families = await conn.fetch("""
            SELECT DISTINCT family_id
            FROM user_profiles
            WHERE role = 'parent'
        """)
        
        for family_row in families:
            family_id = family_row["family_id"]
            families_processed += 1
            
            # Get all parents in this family
            parents = await conn.fetch("""
                SELECT user_id, name, email
                FROM user_profiles
                WHERE family_id = $1 AND role = 'parent'
            """, family_id)
            
            if not parents:
                details.append(f"Family {family_id}: No parents found")
                continue
            
            # Get weekly summary for each child in this family
            # Last 7 days (Saturday to Friday) — use timezone-aware UTC datetime
            week_start = datetime.now(timezone.utc) - timedelta(days=7)

            children_data = await conn.fetch("""
                SELECT
                    p.user_id,
                    p.name,
                    COUNT(DISTINCT t.id) FILTER (WHERE t.completed_at >= $2) as tasks_completed,
                    COALESCE(SUM(t.value) FILTER (WHERE t.completed_at >= $2), 0) as weekly_earned,
                    COALESCE(SUM(t.value) FILTER (WHERE t.status = 'completed'), 0) as pending_payment,
                    COALESCE(SUM(t.value) FILTER (WHERE t.status = 'paid'), 0) as total_paid
                FROM user_profiles p
                LEFT JOIN tasks t ON t.completed_by = p.user_id AND t.family_id = p.family_id
                WHERE p.family_id = $1 AND p.role = 'child'
                GROUP BY p.user_id, p.name
                HAVING COUNT(DISTINCT t.id) FILTER (WHERE t.completed_at >= $2) > 0
            """, family_id, week_start)

            if not children_data:
                details.append(f"Family {family_id}: No child activity this week")
                continue

            # Fetch currency once per family, not once per child.
            # Use the first parent's currency as the family default; fall back to NOK.
            currency_row = await conn.fetchrow("""
                SELECT currency FROM user_profiles
                WHERE family_id = $1 AND role = 'parent'
                ORDER BY created_at
                LIMIT 1
            """, family_id)
            currency = currency_row["currency"] if currency_row else "NOK"

            # Build notification message
            child_summaries = []
            for child in children_data:
                children_summarized += 1
                child_name = child["name"] or "Child"
                tasks_count = child["tasks_completed"]
                weekly_earned = float(child["weekly_earned"])

                child_summaries.append(
                    f"{child_name}: {tasks_count} tasks, {currency} {weekly_earned:.2f} earned this week"
                )
            
            # Create notification for each parent
            notification_title = "Weekly Summary"
            notification_message = "\n".join(child_summaries)
            
            for parent in parents:
                notification_id = str(uuid.uuid4())
                
                await conn.execute("""
                    INSERT INTO notifications (
                        id, user_id, family_id, title, message,
                        notification_type, is_read, created_at, metadata
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                    notification_id,
                    parent["user_id"],
                    family_id,
                    notification_title,
                    notification_message,
                    "weekly_summary",
                    False,
                    datetime.now(timezone.utc),
                    {"week_start": week_start.isoformat(), "children_count": len(children_data)}
                )
                
                notifications_sent += 1
            
            details.append(
                f"Family {family_id}: Sent notifications to {len(parents)} parent(s) about {len(children_data)} child(ren)"
            )
        
        return WeeklySummaryResult(
            notifications_sent=notifications_sent,
            families_processed=families_processed,
            children_summarized=children_summarized,
            details=details
        )
