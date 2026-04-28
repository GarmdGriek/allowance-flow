


"""Task management API for parents.

This API provides CRUD operations for household tasks.
All endpoints require parent role authentication.
"""

import asyncpg
import json
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import AuthorizedUser
from app.db import get_pool
from app.libs.models import TaskStatus

router = APIRouter(prefix="/tasks", tags=["task_management"])


# Request/Response Models
class CreateTaskRequest(BaseModel):
    """Request model for creating a new task."""
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    value: Decimal = Field(..., ge=0, decimal_places=2)
    assigned_to_user_id: Optional[str] = None
    is_recurring: bool = False
    recurrence_days: Optional[List[int]] = None  # Array of 0-6 for Sun-Sat
    auto_recreate: bool = False


class UpdateTaskRequest(BaseModel):
    """Request model for updating an existing task."""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    value: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    status: Optional[TaskStatus] = None
    assigned_to_user_id: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurrence_days: Optional[List[int]] = None
    auto_recreate: Optional[bool] = None


class TaskResponse(BaseModel):
    """Response model for task data."""
    id: str
    title: str
    description: Optional[str]
    value: str  # Return as string for consistent decimal formatting
    status: TaskStatus
    created_by: str
    completed_by: Optional[str]
    assigned_to_user_id: Optional[str]
    family_id: str
    created_at: str
    updated_at: str
    completed_at: Optional[str]
    paid_at: Optional[str] = None
    is_recurring: bool = False
    recurrence_days: Optional[List[int]] = None
    parent_task_id: Optional[str] = None
    auto_recreate: bool = False
    
    # Extended fields with user names
    created_by_name: Optional[str] = None
    completed_by_name: Optional[str] = None
    assigned_to_name: Optional[str] = None


# Helper Functions

def _validate_recurrence_days(days: Optional[List[int]]) -> None:
    """Raise 400 if any day value is outside 0–6 (Sun–Sat)."""
    if days and not all(0 <= d <= 6 for d in days):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recurrence days must be between 0 (Sunday) and 6 (Saturday)",
        )


async def get_user_profile(user_id: str, conn: asyncpg.Connection) -> dict:
    """Get user profile including role and family_id."""
    profile = await conn.fetchrow(
        "SELECT user_id, role, family_id FROM user_profiles WHERE user_id = $1",
        user_id
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not found. Please complete profile setup."
        )
    return dict(profile)


async def verify_parent_role(user_id: str, conn: asyncpg.Connection) -> str:
    """Verify user has parent role and return family_id."""
    profile = await get_user_profile(user_id, conn)
    if profile["role"] != "parent":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents can manage tasks"
        )
    return profile["family_id"]


async def get_user_name(user_id: str, conn: asyncpg.Connection) -> Optional[str]:
    """Get user's display name from user_profiles table."""
    result = await conn.fetchval(
        "SELECT COALESCE(name, 'Unknown User') FROM user_profiles WHERE user_id = $1",
        user_id
    )
    return result or "Unknown User"


# Endpoints
@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(body: CreateTaskRequest, user: AuthorizedUser) -> TaskResponse:
    """Create a new household task.
    
    Only parents can create tasks.
    The task will be associated with the parent's family.
    """
    async with get_pool().acquire() as conn:
        # Verify user is a parent and get family_id
        family_id = await verify_parent_role(user.sub, conn)

        # Recurring tasks must declare which days they repeat on
        recurrence_days_json = None
        if body.is_recurring:
            if not body.recurrence_days:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="recurrence_days is required when is_recurring is True",
                )
            _validate_recurrence_days(body.recurrence_days)
            recurrence_days_json = json.dumps(body.recurrence_days)
        
        # Create the task
        task = await conn.fetchrow(
            """
            INSERT INTO tasks (title, description, value, status, created_by, assigned_to_user_id, family_id, is_recurring, recurrence_days, auto_recreate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, title, description, value, status, created_by, completed_by,
                      assigned_to_user_id, family_id, created_at, updated_at, completed_at,
                      is_recurring, recurrence_days, parent_task_id, auto_recreate
            """,
            body.title,
            body.description,
            body.value,
            "available",
            user.sub,
            body.assigned_to_user_id,
            family_id,
            body.is_recurring,
            recurrence_days_json,
            body.auto_recreate
        )
        
        # Get user names
        creator_name = await get_user_name(user.sub, conn)
        assigned_name = None
        if task["assigned_to_user_id"]:
            assigned_name = await get_user_name(task["assigned_to_user_id"], conn)
        
        recurrence_days_list = json.loads(task["recurrence_days"]) if task["recurrence_days"] else None
        
        return TaskResponse(
            id=str(task["id"]),
            title=task["title"],
            description=task["description"],
            value=str(task["value"]),
            status=task["status"],
            created_by=str(task["created_by"]) if task["created_by"] is not None else None,
            completed_by=str(task["completed_by"]) if task["completed_by"] is not None else None,
            assigned_to_user_id=str(task["assigned_to_user_id"]) if task["assigned_to_user_id"] is not None else None,
            family_id=task["family_id"],
            created_at=task["created_at"].isoformat(),
            updated_at=task["updated_at"].isoformat(),
            completed_at=task["completed_at"].isoformat() if task["completed_at"] else None,
            created_by_name=creator_name,
            assigned_to_name=assigned_name,
            is_recurring=task["is_recurring"],
            recurrence_days=recurrence_days_list,
            parent_task_id=str(task["parent_task_id"]) if task["parent_task_id"] is not None else None,
            auto_recreate=task["auto_recreate"]
        )


@router.get("", response_model=List[TaskResponse])
async def list_tasks(user: AuthorizedUser) -> List[TaskResponse]:
    """List tasks based on user role.
    
    Parents: See all family tasks
    Children: See only tasks assigned to them (excluding templates)
    Returns tasks with user names populated.
    """
    async with get_pool().acquire() as conn:
        # Get user's profile to determine role and family
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )

        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        # Build query based on role
        if profile["role"] == "parent":
            # Parents see all family tasks (excluding archived)
            query = """
                SELECT
                    id, title, description, value, status,
                    assigned_to_user_id, created_by, completed_by,
                    is_recurring, recurrence_days, completed_at, paid_at,
                    created_at, updated_at, family_id, parent_task_id
                FROM tasks
                WHERE family_id = $1 AND status <> 'archived'
                ORDER BY created_at DESC
            """
            tasks = await conn.fetch(query, profile["family_id"])
        else:
            # Children see only tasks assigned to them (excluding archived and templates)
            # Templates are: is_recurring=TRUE AND parent_task_id IS NULL
            query = """
                SELECT
                    id, title, description, value, status,
                    assigned_to_user_id, created_by, completed_by,
                    is_recurring, recurrence_days, completed_at,
                    created_at, updated_at, family_id, parent_task_id
                FROM tasks
                WHERE family_id = $1 AND assigned_to_user_id = $2 AND status <> 'archived'
                  AND NOT (is_recurring = TRUE AND parent_task_id IS NULL)
                ORDER BY created_at DESC
            """
            tasks = await conn.fetch(query, profile["family_id"], user.sub)
        
        # Build response with user names — batch all lookups in one query
        user_ids: set = set()
        for task in tasks:
            for field in ("created_by", "completed_by", "assigned_to_user_id"):
                if task[field] is not None:
                    user_ids.add(task[field])
        name_map: dict = {}
        if user_ids:
            name_rows = await conn.fetch(
                "SELECT user_id, COALESCE(name, 'Unknown User') AS name FROM user_profiles WHERE user_id = ANY($1)",
                list(user_ids)
            )
            name_map = {str(row["user_id"]): row["name"] for row in name_rows}

        result = []
        for task in tasks:
            creator_name = name_map.get(str(task["created_by"]), "Unknown User") if task["created_by"] else None
            completed_name = name_map.get(str(task["completed_by"])) if task["completed_by"] else None
            assigned_name = name_map.get(str(task["assigned_to_user_id"])) if task["assigned_to_user_id"] else None

            recurrence_days_list = json.loads(task["recurrence_days"]) if task["recurrence_days"] else None
            
            result.append(TaskResponse(
                id=str(task["id"]),
                title=task["title"],
                description=task["description"],
                value=str(task["value"]),
                status=task["status"],
                created_by=str(task["created_by"]) if task["created_by"] is not None else None,
                completed_by=str(task["completed_by"]) if task["completed_by"] is not None else None,
                assigned_to_user_id=str(task["assigned_to_user_id"]) if task["assigned_to_user_id"] is not None else None,
                family_id=task["family_id"],
                created_at=task["created_at"].isoformat(),
                updated_at=task["updated_at"].isoformat(),
                completed_at=task["completed_at"].isoformat() if task["completed_at"] else None,
                created_by_name=creator_name,
                completed_by_name=completed_name,
                assigned_to_name=assigned_name,
                is_recurring=task["is_recurring"],
                recurrence_days=recurrence_days_list,
                parent_task_id=str(task["parent_task_id"]) if task["parent_task_id"] is not None else None,
            ))
        
        return result


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(task_id: str, body: UpdateTaskRequest, user: AuthorizedUser) -> TaskResponse:
    """Update an existing task.
    
    Parents: Can update any family task
    Children: Can only mark their own tasks as 'completed'
    
    For recurring templates (is_recurring=TRUE, parent_task_id IS NULL):
    - Updates the template in place
    - Cannot change status (templates don't have completion status)
    
    For regular tasks and instances:
    - If status changes to 'completed' or 'paid', archives and creates new task
    - Otherwise updates in place
    """
    async with get_pool().acquire() as conn:
        # Get user's profile to determine role and family
        profile = await conn.fetchrow(
            "SELECT role, family_id FROM user_profiles WHERE user_id = $1",
            user.sub
        )

        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        family_id = profile["family_id"]
        user_role = profile["role"]
        
        # Get existing task
        existing_task = await conn.fetchrow(
            """
            SELECT id, title, description, value, status, created_by, assigned_to_user_id,
                   family_id, is_recurring, recurrence_days, parent_task_id, completed_by, auto_recreate
            FROM tasks
            WHERE id = $1 AND family_id = $2
            """,
            task_id,
            family_id
        )
        
        if not existing_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        # AUTHORIZATION: Children can only update their own tasks and only change status to 'completed'
        if user_role == "child":
            # Child must be assigned to this task
            if existing_task["assigned_to_user_id"] != user.sub:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only update tasks assigned to you"
                )
            
            # Child can only change status to 'completed'
            if body.status and body.status != "completed":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only mark tasks as completed"
                )
            
            # Child cannot change other fields
            if any([body.title, body.description, body.value, body.assigned_to_user_id, 
                    body.is_recurring, body.recurrence_days]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only update task status"
                )
        
        # Check if this is a recurring template
        is_template = existing_task["is_recurring"] and existing_task["parent_task_id"] is None
        
        if is_template:
            # RECURRING TEMPLATE: Update in place, cannot change status
            # NOTE: This only updates the template itself. Existing task instances
            # (with parent_task_id pointing to this template) remain unchanged.
            # Only new tasks created from this template will use the updated values.
            if body.status is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change status of recurring template. Edit instances instead."
                )
            
            # Prepare updates for template
            new_title = body.title if body.title is not None else existing_task["title"]
            new_description = body.description if body.description is not None else existing_task["description"]
            new_value = body.value if body.value is not None else existing_task["value"]
            new_assigned_to = body.assigned_to_user_id if body.assigned_to_user_id is not None else existing_task["assigned_to_user_id"]
            new_is_recurring = body.is_recurring if body.is_recurring is not None else existing_task["is_recurring"]
            
            # Handle recurrence days
            if body.recurrence_days is not None:
                _validate_recurrence_days(body.recurrence_days)
                new_recurrence_days = json.dumps(body.recurrence_days) if body.recurrence_days else None
            else:
                new_recurrence_days = existing_task["recurrence_days"]
            
            # Update template in place
            updated_task = await conn.fetchrow(
                """
                UPDATE tasks
                SET title = $1, description = $2, value = $3, assigned_to_user_id = $4,
                    is_recurring = $5, recurrence_days = $6, updated_at = NOW()
                WHERE id = $7
                RETURNING id, title, description, value, status, created_by, completed_by,
                          assigned_to_user_id, family_id, created_at, updated_at, completed_at, paid_at,
                          is_recurring, recurrence_days, parent_task_id, auto_recreate
                """,
                new_title, new_description, new_value, new_assigned_to,
                new_is_recurring, new_recurrence_days, task_id
            )
            new_task = updated_task
            
        else:
            # Archived tasks are immutable — block all further updates.
            # Archived status is terminal: tasks are soft-deleted and must not
            # be resurrected as that would corrupt balance and audit records.
            if existing_task["status"] == "archived":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Archived tasks cannot be modified",
                )

            # REGULAR TASK OR INSTANCE: Check if this is an auto_recreate task.
            # Scheduler-based recurring tasks (is_recurring=TRUE templates) rely on the
            # daily background scheduler to create the next instance on the correct day.
            # Only auto_recreate tasks should regenerate immediately on completion.
            is_auto_recreate_task = existing_task["auto_recreate"]

            status_changing_to_done = (
                body.status is not None and
                body.status in ['completed', 'paid'] and
                existing_task["status"] not in ['completed', 'paid', 'archived']
            )

            # Recreate immediately only for auto_recreate tasks.
            # is_recurring tasks are handled by the daily background scheduler in main.py
            # which respects recurrence_days (e.g. daily, Saturdays-only, etc.).
            if status_changing_to_done and is_auto_recreate_task:
                # Mark old task as completed so it counts toward balance
                final_status = 'completed'
                await conn.execute(
                    "UPDATE tasks SET status = $1, completed_by = $2, completed_at = NOW() WHERE id = $3",
                    final_status,
                    user.sub,
                    task_id
                )
                
                # Prepare new task data
                new_title = existing_task["title"]
                new_description = body.description if body.description is not None else existing_task["description"]
                new_value = body.value if body.value is not None else existing_task["value"]
                new_assigned_to = body.assigned_to_user_id if body.assigned_to_user_id is not None else existing_task["assigned_to_user_id"]
                new_is_recurring = existing_task["is_recurring"]
                new_recurrence_days = existing_task["recurrence_days"]
                new_auto_recreate = existing_task["auto_recreate"]
                
                # For auto_recreate tasks, clear the description (so next use is fresh)
                # For recurring instances, keep parent_task_id
                if is_auto_recreate_task:
                    new_description = None  # Clear description for fresh reporting
                    new_parent_task_id = None
                else:
                    new_parent_task_id = existing_task["parent_task_id"]
                
                # Create new task instance
                # created_by must be the original task owner, not the child who
                # completed it — completing a task does not transfer authorship.
                new_task = await conn.fetchrow(
                    """
                    INSERT INTO tasks (
                        title, description, value, status, created_by, assigned_to_user_id,
                        family_id, is_recurring, recurrence_days, parent_task_id, auto_recreate
                    )
                    VALUES ($1, $2, $3, 'available', $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id, title, description, value, status, created_by, completed_by,
                              assigned_to_user_id, family_id, created_at, updated_at, completed_at, paid_at,
                              is_recurring, recurrence_days, parent_task_id, auto_recreate
                    """,
                    new_title, new_description, new_value, existing_task["created_by"], new_assigned_to,
                    family_id, new_is_recurring, new_recurrence_days, new_parent_task_id, new_auto_recreate
                )
            else:
                # Update in place for non-recurring tasks and other changes
                new_title = body.title if body.title is not None else existing_task["title"]
                new_description = body.description if body.description is not None else existing_task["description"]
                new_value = body.value if body.value is not None else existing_task["value"]
                new_status = body.status if body.status is not None else existing_task["status"]
                new_assigned_to = body.assigned_to_user_id if body.assigned_to_user_id is not None else existing_task["assigned_to_user_id"]
                new_is_recurring = body.is_recurring if body.is_recurring is not None else existing_task["is_recurring"]
                
                if body.recurrence_days is not None:
                    new_recurrence_days = json.dumps(body.recurrence_days) if body.recurrence_days else None
                else:
                    new_recurrence_days = existing_task["recurrence_days"]
                
                # Set completed_by and completed_at if status is changing to completed or paid
                completed_by = user.sub if new_status in ['completed', 'paid'] else existing_task["completed_by"]
                
                new_task = await conn.fetchrow(
                    """
                    UPDATE tasks
                    SET title = $1, description = $2, value = $3, status = $4,
                        assigned_to_user_id = $5, is_recurring = $6, recurrence_days = $7,
                        completed_by = $8, 
                        completed_at = CASE WHEN $4 IN ('completed', 'paid') THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
                        paid_at = CASE WHEN $4 = 'paid' THEN NOW() ELSE paid_at END,
                        updated_at = NOW()
                    WHERE id = $9
                    RETURNING id, title, description, value, status, created_by, completed_by,
                              assigned_to_user_id, family_id, created_at, updated_at, completed_at, paid_at,
                              is_recurring, recurrence_days, parent_task_id, auto_recreate
                    """,
                    new_title, new_description, new_value, new_status, new_assigned_to,
                    new_is_recurring, new_recurrence_days, completed_by, task_id
                )
        
        # Batch-fetch user names in one query
        _ids = {v for v in (new_task["created_by"], new_task["assigned_to_user_id"], new_task["completed_by"]) if v}
        _name_rows = await conn.fetch(
            "SELECT user_id, COALESCE(name, 'Unknown User') AS name FROM user_profiles WHERE user_id = ANY($1)",
            list(_ids)
        ) if _ids else []
        _name_map = {str(r["user_id"]): r["name"] for r in _name_rows}
        creator_name = _name_map.get(str(new_task["created_by"]), "Unknown User") if new_task["created_by"] else None
        assigned_name = _name_map.get(str(new_task["assigned_to_user_id"])) if new_task["assigned_to_user_id"] else None
        completed_name = _name_map.get(str(new_task["completed_by"])) if new_task["completed_by"] else None
        
        recurrence_days_list = json.loads(new_task["recurrence_days"]) if new_task["recurrence_days"] else None

        return TaskResponse(
            id=str(new_task["id"]),
            title=new_task["title"],
            description=new_task["description"],
            value=str(new_task["value"]),
            status=new_task["status"],
            created_by=str(new_task["created_by"]) if new_task["created_by"] is not None else None,
            completed_by=str(new_task["completed_by"]) if new_task["completed_by"] is not None else None,
            assigned_to_user_id=str(new_task["assigned_to_user_id"]) if new_task["assigned_to_user_id"] is not None else None,
            family_id=new_task["family_id"],
            created_at=new_task["created_at"].isoformat(),
            updated_at=new_task["updated_at"].isoformat(),
            completed_at=new_task["completed_at"].isoformat() if new_task["completed_at"] else None,
            paid_at=new_task["paid_at"].isoformat() if new_task["paid_at"] else None,
            created_by_name=creator_name,
            completed_by_name=completed_name,
            assigned_to_name=assigned_name,
            is_recurring=new_task["is_recurring"],
            recurrence_days=recurrence_days_list,
            parent_task_id=str(new_task["parent_task_id"]) if new_task["parent_task_id"] is not None else None,
            auto_recreate=new_task["auto_recreate"]
        )


@router.delete("/{task_id}")
async def delete_task(task_id: str, user: AuthorizedUser) -> dict:
    """Delete a task.
    
    Only parents can delete tasks.
    This will permanently remove the task from the database.
    """
    async with get_pool().acquire() as conn:
        # Verify user is a parent and get family_id
        family_id = await verify_parent_role(user.sub, conn)

        # Delete the task (only if it belongs to the family)
        result = await conn.execute(
            "DELETE FROM tasks WHERE id = $1 AND family_id = $2",
            task_id,
            family_id
        )
        
        if result == "DELETE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found"
            )
        
        return {"message": "Task deleted successfully"}
