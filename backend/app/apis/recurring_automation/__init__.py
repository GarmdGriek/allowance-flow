


"""Recurring task automation API.

This API provides automation for creating task instances from recurring templates.
"""

import asyncpg
import os
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/automation", tags=["automation"])


class RecurringTaskProcessResult(BaseModel):
    """Result of processing recurring tasks."""
    tasks_created: int
    tasks_processed: int
    details: List[str]


@router.post("/process-recurring-tasks", response_model=RecurringTaskProcessResult)
async def process_recurring_tasks() -> RecurringTaskProcessResult:
    """Process recurring tasks and create instances for today.
    
    This endpoint:
    1. Finds all recurring task templates
    2. Checks if today matches their recurrence days (0=Sunday, 6=Saturday)
    3. Creates new task instances if they don't already exist for today
    4. Links new instances to parent via parent_task_id
    
    Should be run daily via scheduled automation.
    """
    conn = await asyncpg.connect(os.environ.get("DATABASE_URL"))
    try:
        # Get current day of week (0=Sunday, 6=Saturday)
        now = datetime.now(timezone.utc)
        current_weekday = now.weekday()
        # Convert Python weekday (0=Monday) to our format (0=Sunday)
        # Python: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
        # Our format: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
        if current_weekday == 6:  # Sunday
            day_number = 0
        else:
            day_number = current_weekday + 1
        
        today_date = now.date()
        
        print(f"Processing recurring tasks for day {day_number} ({now.strftime('%A')}) on {today_date}")
        
        # Find all recurring task templates
        recurring_tasks = await conn.fetch(
            """
            SELECT id, title, description, value, created_by, assigned_to_user_id, 
                   family_id, recurrence_days
            FROM tasks
            WHERE is_recurring = TRUE
            AND recurrence_days IS NOT NULL
            """
        )
        
        tasks_created = 0
        tasks_processed = 0
        details = []
        
        import json
        
        for template in recurring_tasks:
            tasks_processed += 1
            recurrence_days = json.loads(template["recurrence_days"])
            
            # Check if today is a recurrence day
            if day_number not in recurrence_days:
                print(f"Skipping task '{template['title']}' - not scheduled for today")
                continue
            
            # Skip if any instance is still active (available or in_progress).
            # The previous occurrence must be completed (or paid) before a new
            # one is spawned — the task does not need to be paid, just completed.
            active_instance = await conn.fetchrow(
                """
                SELECT id FROM tasks
                WHERE parent_task_id = $1
                AND status IN ('available', 'in_progress')
                """,
                template["id"]
            )

            if active_instance:
                print(f"Skipping '{template['title']}' - previous instance not yet completed")
                details.append(f"Skipped '{template['title']}' - previous instance still active")
                continue

            # Idempotency guard: don't create a second instance on the same day
            # (e.g. if the automation is triggered more than once).
            today_instance = await conn.fetchrow(
                """
                SELECT id FROM tasks
                WHERE parent_task_id = $1
                AND DATE(created_at) = $2
                """,
                template["id"],
                today_date
            )

            if today_instance:
                details.append(f"Skipped '{template['title']}' - already created today")
                continue

            # Create new task instance from template
            new_task = await conn.fetchrow(
                """
                INSERT INTO tasks (
                    title, description, value, status, created_by, 
                    assigned_to_user_id, family_id, parent_task_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, title
                """,
                template["title"],
                template["description"],
                template["value"],
                "available",
                template["created_by"],
                template["assigned_to_user_id"],
                template["family_id"],
                template["id"]  # Link to parent recurring template
            )
            
            tasks_created += 1
            details.append(f"Created '{new_task['title']}' (ID: {new_task['id']})")
            print(f"Created new task instance: {new_task['title']}")
        
        result_message = f"Processed {tasks_processed} recurring tasks, created {tasks_created} instances"
        print(result_message)
        
        # Cleanup: Delete old archived incomplete tasks (older than 7 days)
        # We only delete archived tasks that were never completed/paid
        deleted_result = await conn.execute(
            """
            DELETE FROM tasks
            WHERE status = 'archived'
            AND completed_at IS NULL
            AND paid_at IS NULL
            AND updated_at < NOW() - INTERVAL '7 days'
            """
        )
        
        deleted_count = 0
        if deleted_result and deleted_result != "DELETE 0":
            deleted_count = int(deleted_result.split()[-1])
            print(f"Deleted {deleted_count} old archived incomplete task(s)")
            details.append(f"Deleted {deleted_count} old archived incomplete task(s)")
        
        return RecurringTaskProcessResult(
            tasks_created=tasks_created,
            tasks_processed=tasks_processed,
            details=details
        )
        
    finally:
        await conn.close()
