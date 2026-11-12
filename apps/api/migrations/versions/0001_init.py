"""初始表结构：8 张表

Revision ID: 0ff6160e2675
Revises:
Create Date: 2026-11-12

表清单与职责：
  app_user         登录用户（邮箱 / 企业微信 userid 二选一，服务层保证）
  login_code       邮箱验证码（只存 HMAC 哈希，不存明文）
  model_spec       模型规格（核心列 + detail JSONB 携完整展示字段）
  gpu_spec         显卡规格（同上，另含 condition 区分全新/二手）
  part_spec        CPU/主板/内存/电源/硬盘/散热，kind + payload
  price_snapshot   价格历史（没有它「参考价」就是拍脑袋的数字）
  build            用户配置（payload + evaluation 双 JSONB 快照）
  share_link       分享 token（随机串主键，可猜的链接等于泄露配置）
  lesson_progress  关卡进度（一人一关一行，重复上报即覆盖）

三个刻意的选择：
1. build.payload 存快照而不是外键指向规格表 —— 半年后回看应该看到当时算出的结果，
   而不是被新规格改写过的结论；
2. detail/payload 用 JSONB —— 展示字段会随前端迭代增加，拆列等于每次加文案都要迁移；
3. jsonb 而非 json —— 需要按键查询与索引时不用改表。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0ff6160e2675'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('app_user',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('wecom_userid', sa.String(length=128), nullable=True),
    sa.Column('nickname', sa.String(length=64), nullable=True),
    sa.Column('avatar', sa.Text(), nullable=True),
    sa.Column('is_admin', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('wecom_userid')
    )
    op.create_table('gpu_spec',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('vendor', sa.String(length=32), nullable=False),
    sa.Column('gpu_class', sa.String(length=32), nullable=False),
    sa.Column('vram_gb', sa.Integer(), nullable=False),
    sa.Column('bandwidth', sa.Integer(), nullable=False),
    sa.Column('tdp_w', sa.Integer(), nullable=False),
    sa.Column('price_cny', sa.Integer(), nullable=False),
    sa.Column('condition', sa.String(length=16), nullable=False),
    sa.Column('source', sa.Text(), nullable=True),
    sa.Column('detail', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('updated_at', sa.String(length=16), nullable=True),
    sa.Column('synced_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gpu_spec_gpu_class'), 'gpu_spec', ['gpu_class'], unique=False)
    op.create_index(op.f('ix_gpu_spec_vendor'), 'gpu_spec', ['vendor'], unique=False)
    op.create_table('login_code',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('code_hash', sa.String(length=128), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_login_code_email_time', 'login_code', ['email', 'created_at'], unique=False)
    op.create_table('model_spec',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('vendor', sa.String(length=64), nullable=False),
    sa.Column('arch', sa.String(length=32), nullable=False),
    sa.Column('params_b', sa.Numeric(precision=6, scale=2), nullable=False),
    sa.Column('layers', sa.Integer(), nullable=False),
    sa.Column('hidden_dim', sa.Integer(), nullable=False),
    sa.Column('ctx_max', sa.Integer(), nullable=False),
    sa.Column('license', sa.String(length=64), nullable=True),
    sa.Column('source', sa.Text(), nullable=True),
    sa.Column('detail', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('updated_at', sa.String(length=16), nullable=True),
    sa.Column('synced_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_model_spec_vendor'), 'model_spec', ['vendor'], unique=False)
    op.create_table('part_spec',
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('price_cny', sa.Integer(), nullable=False),
    sa.Column('payload', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('updated_at', sa.String(length=16), nullable=True),
    sa.PrimaryKeyConstraint('kind', 'id')
    )
    op.create_table('build',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('model_id', sa.String(length=64), nullable=False),
    sa.Column('model_name', sa.String(length=160), nullable=False),
    sa.Column('payload', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=False),
    sa.Column('evaluation', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('score', sa.Integer(), nullable=False),
    sa.Column('grade', sa.String(length=2), nullable=False),
    sa.Column('price_cny', sa.Integer(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_build_user_time', 'build', ['user_id', 'updated_at'], unique=False)
    op.create_table('lesson_progress',
    sa.Column('user_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('lesson_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('output', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['app_user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'lesson_id')
    )
    op.create_table('price_snapshot',
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
    sa.Column('gpu_id', sa.String(length=64), nullable=False),
    sa.Column('price_cny', sa.Integer(), nullable=False),
    sa.Column('channel', sa.String(length=32), nullable=False),
    sa.Column('note', sa.String(length=255), nullable=True),
    sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['gpu_id'], ['gpu_spec.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_price_snapshot_gpu_time', 'price_snapshot', ['gpu_id', 'captured_at'], unique=False)
    op.create_table('share_link',
    sa.Column('token', sa.String(length=32), nullable=False),
    sa.Column('build_id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('views', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['build_id'], ['build.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token')
    )


def downgrade() -> None:
    op.drop_table('share_link')
    op.drop_index('ix_price_snapshot_gpu_time', table_name='price_snapshot')
    op.drop_table('price_snapshot')
    op.drop_table('lesson_progress')
    op.drop_index('ix_build_user_time', table_name='build')
    op.drop_table('build')
    op.drop_table('part_spec')
    op.drop_index(op.f('ix_model_spec_vendor'), table_name='model_spec')
    op.drop_table('model_spec')
    op.drop_index('ix_login_code_email_time', table_name='login_code')
    op.drop_table('login_code')
    op.drop_index(op.f('ix_gpu_spec_vendor'), table_name='gpu_spec')
    op.drop_index(op.f('ix_gpu_spec_gpu_class'), table_name='gpu_spec')
    op.drop_table('gpu_spec')
    op.drop_table('app_user')
