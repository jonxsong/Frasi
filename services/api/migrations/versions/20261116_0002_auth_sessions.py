"""Persist refresh-token sessions for rotation and revocation."""

from collections.abc import Sequence

from alembic import op

from frasi_api.models import AuthSession

revision: str = "20261116_0002"
down_revision: str | None = "20261116_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    AuthSession.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    op.drop_table("auth_sessions")
