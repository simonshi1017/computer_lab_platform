"""价格来源字段 + 埋点表

Revision ID: ae1e2645c126
Revises: 0ff6160e2675
Create Date: 2026-11-12

M7 的两处结构变更：

1. `price_snapshot.source` —— 每条价格都要能说清「哪来的」。
   没有来源的价格，用户没法核，我们也没法为它负责。
2. `gpu_spec.price_captured_at` —— 当前有效价的采集时间。
   它和 `updated_at`（目录文案的更新时间）不是一回事：文案可能改过很多次，
   但价格还是三个月前那条。
3. `analytics_event` —— 埋点。只存匿名 session + 事件名 + 标量 props，
   不存 IP / UA 原文 / 任何可直接识别个人的字段。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'ae1e2645c126'
down_revision: Union[str, None] = '0ff6160e2675'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('analytics_event',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
    sa.Column('session_id', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=True),
    sa.Column('name', sa.String(length=64), nullable=False),
    sa.Column('path', sa.String(length=255), nullable=True),
    sa.Column('props', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('ua', sa.String(length=80), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_analytics_event_name_time', 'analytics_event', ['name', 'created_at'], unique=False)
    op.create_index('ix_analytics_event_session', 'analytics_event', ['session_id'], unique=False)
    op.create_index('ix_analytics_event_time', 'analytics_event', ['created_at'], unique=False)
    op.add_column('gpu_spec', sa.Column('price_captured_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('price_snapshot', sa.Column('source', sa.Text(), nullable=True))
    # 回填历史快照的来源：早期 seed 写入的 channel='catalog' 行来自内置目录，
    # 留空会让「这条价格哪来的」永久无解。
    op.execute(
        "UPDATE price_snapshot SET source = '内置目录 catalog.json' "
        "WHERE channel = 'catalog' AND source IS NULL"
    )


def downgrade() -> None:
    op.drop_column('price_snapshot', 'source')
    op.drop_column('gpu_spec', 'price_captured_at')
    op.drop_index('ix_analytics_event_time', table_name='analytics_event')
    op.drop_index('ix_analytics_event_session', table_name='analytics_event')
    op.drop_index('ix_analytics_event_name_time', table_name='analytics_event')
    op.drop_table('analytics_event')
