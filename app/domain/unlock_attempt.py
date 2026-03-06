"""Unlock throttle persistence model."""

from __future__ import annotations

from app import db


class UnlockAttempt(db.Model):
    """Stored unlock-attempt state for a (client_ip, item_id) pair."""

    __tablename__ = "unlock_attempts"

    id: int = db.Column(db.Integer, primary_key=True)
    client_ip: str = db.Column(db.String(64), nullable=False)
    item_id: int = db.Column(
        db.Integer,
        db.ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempt_timestamps_json: str = db.Column(db.Text, nullable=False, default="[]")
    locked_until: float = db.Column(db.Float, nullable=False, default=0.0)
    updated_at: float = db.Column(db.Float, nullable=False, default=0.0, index=True)

    __table_args__ = (
        db.UniqueConstraint("client_ip", "item_id", name="uq_unlock_attempt_client_item"),
    )

    def __repr__(self) -> str:
        return f"<UnlockAttempt {self.client_ip}:{self.item_id}>"
