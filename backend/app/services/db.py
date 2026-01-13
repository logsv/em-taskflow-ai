from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings
from app.models.db import Base
import os

# Ensure directory exists
os.makedirs(os.path.dirname(settings.DATABASE_PATH), exist_ok=True)

# SQLAlchemy Async Engine
# Note: sqlite+aiosqlite:///path/to/db
DB_URL = f"sqlite+aiosqlite:///{settings.DATABASE_PATH}"

engine = create_async_engine(DB_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
