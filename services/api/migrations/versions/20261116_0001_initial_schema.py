"""Create the normalized Frasi domain schema."""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import Boolean, Integer, String, column, table

from frasi_api import models  # noqa: F401
from frasi_api.database import Base

revision: str = "20261116_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    instruments = table(
        "instruments",
        column("id", String),
        column("display_name", String),
        column("transposition_semitones", Integer),
        column("clef", String),
        column("minimum_concert_midi", Integer),
        column("maximum_concert_midi", Integer),
        column("enabled", Boolean),
    )
    op.bulk_insert(
        instruments,
        [
            {
                "id": "alto_saxophone",
                "display_name": "Alto Saxophone",
                "transposition_semitones": 9,
                "clef": "treble",
                "minimum_concert_midi": 49,
                "maximum_concert_midi": 80,
                "enabled": True,
            },
            {
                "id": "tenor_saxophone",
                "display_name": "Tenor Saxophone",
                "transposition_semitones": 14,
                "clef": "treble",
                "minimum_concert_midi": 44,
                "maximum_concert_midi": 76,
                "enabled": True,
            },
            {
                "id": "soprano_saxophone",
                "display_name": "Soprano Saxophone",
                "transposition_semitones": 2,
                "clef": "treble",
                "minimum_concert_midi": 56,
                "maximum_concert_midi": 88,
                "enabled": True,
            },
            {
                "id": "baritone_saxophone",
                "display_name": "Baritone Saxophone",
                "transposition_semitones": 21,
                "clef": "treble",
                "minimum_concert_midi": 36,
                "maximum_concert_midi": 69,
                "enabled": True,
            },
            {
                "id": "trumpet",
                "display_name": "B-flat Trumpet",
                "transposition_semitones": 2,
                "clef": "treble",
                "minimum_concert_midi": 52,
                "maximum_concert_midi": 82,
                "enabled": True,
            },
            {
                "id": "trombone",
                "display_name": "Trombone",
                "transposition_semitones": 0,
                "clef": "bass",
                "minimum_concert_midi": 40,
                "maximum_concert_midi": 72,
                "enabled": True,
            },
        ],
    )


def downgrade() -> None:
    for name in reversed(Base.metadata.sorted_tables):
        op.drop_table(name.name)
