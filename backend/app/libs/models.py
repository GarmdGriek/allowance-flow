"""Database models for the Allowance Flow app.

This module defines the data models for user profiles and tasks.
These models mirror the database schema and provide type safety for database operations.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, Field


# Type aliases for role and status
UserRole = Literal["parent", "child"]
TaskStatus = Literal["available", "pending_approval", "completed", "paid"]


class UserProfile(BaseModel):
    """Model for user profile data.
    
    Extends Stack Auth user data with family-specific information.
    Links to neon_auth.users_sync via user_id.
    """
    user_id: str
    role: UserRole
    family_id: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    class Config:
        from_attributes = True


class Task(BaseModel):
    """Model for household task/chore.
    
    Tracks tasks created by parents and completed by children.
    Includes monetary value for allowance tracking.
    """
    id: str = Field(default_factory=lambda: "")
    title: str
    description: Optional[str] = None
    value: Decimal = Field(ge=0)  # Monetary value, must be >= 0
    status: TaskStatus
    created_by: str  # User ID of parent who created the task
    completed_by: Optional[str] = None  # User ID of child who completed the task
    family_id: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AllowanceBalance(BaseModel):
    """Model for child's allowance balance breakdown.
    
    Calculates balance based on task statuses:
    - pending_amount: Tasks awaiting parent approval
    - earned_amount: Approved tasks ready for payment
    - paid_amount: Tasks that have been paid
    """
    child_id: str
    child_name: str
    pending_amount: Decimal = Field(default=Decimal("0.00"))
    earned_amount: Decimal = Field(default=Decimal("0.00"))
    paid_amount: Decimal = Field(default=Decimal("0.00"))
    total_tasks_completed: int = 0

    class Config:
        from_attributes = True
